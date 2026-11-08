#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

podman run -i --network=host --rm \
  -v "$repo_root/release-artifacts/linux:/artifacts:ro" \
  docker.io/library/fedora:latest bash -s <<'FEDORA'
set -euo pipefail
dnf -y install gtk3 webkit2gtk4.1 libayatana-appindicator-gtk3 \
  xorg-x11-server-Xvfb dejavu-sans-fonts dbus-daemon \
  /artifacts/FPKG-Builder-0.1.0-linux-x64.rpm
rpm -q fpkg-builder
command -v fpkg-builder
Xvfb :117 -screen 0 1280x900x24 -nolisten tcp -ac >/tmp/vortex-rpm-xvfb.log 2>&1 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  [[ -S /tmp/.X11-unix/X117 ]] && break
  sleep 0.25
done
if ! kill -0 "$xvfb_pid" 2>/dev/null; then cat /tmp/vortex-rpm-xvfb.log; exit 1; fi
set +e
DISPLAY=:117 env -u WAYLAND_DISPLAY -u XAUTHORITY GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 dbus-run-session -- timeout 15s fpkg-builder >/tmp/fpkg-builder-rpm-launch.log 2>&1
code=$?
set -e
cat /tmp/fpkg-builder-rpm-launch.log
if [ "$code" -ne 0 ] && [ "$code" -ne 124 ]; then
  exit "$code"
fi
FEDORA
