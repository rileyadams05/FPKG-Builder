#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
arch_image="${ARCH_BUILD_IMAGE:-docker.io/library/archlinux:latest}"

podman run -i --network=host --rm -v "$repo_root:/build:Z" "$arch_image" bash -s <<'CONTAINER'
set -euo pipefail
pacman -Sy --noconfirm base-devel gtk3 webkit2gtk-4.1 libayatana-appindicator \
  librsvg xorg-server-xvfb ttf-dejavu sudo
useradd --create-home builder
printf '%s\n' 'builder ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/builder
chmod 440 /etc/sudoers.d/builder
chown -R builder:builder /build
cp /build/packaging/PKGBUILD /build/PKGBUILD
su builder -c 'cd /build && makepkg --syncdeps --noconfirm --force'
install -Dm644 /build/fpkg-builder-0.1.0-1-x86_64.pkg.tar.zst \
  /build/release-artifacts/arch/FPKG-Builder-0.1.0-1-arch-x86_64.pkg.tar.zst
pacman -U --noconfirm /build/release-artifacts/arch/*.pkg.tar.zst
Xvfb :117 -screen 0 1280x900x24 -nolisten tcp -ac >/tmp/vortex-arch-xvfb.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  [[ -S /tmp/.X11-unix/X117 ]] && break
  sleep 0.25
done
if ! kill -0 "$xvfb_pid" 2>/dev/null; then cat /tmp/vortex-arch-xvfb.log; exit 1; fi
set +e
DISPLAY=:117 env -u WAYLAND_DISPLAY -u XAUTHORITY GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 dbus-run-session -- timeout 15s fpkg-builder >/tmp/fpkg-builder-arch-launch.log 2>&1
code=$?
set -e
cat /tmp/fpkg-builder-arch-launch.log
if [ "$code" -ne 0 ] && [ "$code" -ne 124 ]; then
  exit "$code"
fi
CONTAINER

linux_dir="/mnt/d/Projects/GP4 BUILDER/release-artifacts/linux"
mkdir -p "$linux_dir"
cp "$repo_root"/release-artifacts/arch/*.pkg.tar.zst "$linux_dir/"
(cd "$linux_dir" && sha256sum *.deb *.rpm *.pkg.tar.zst > SHA256SUMS)
ls -lh "$linux_dir"
