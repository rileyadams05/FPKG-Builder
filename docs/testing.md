# Test and verification record

## Verified in Linux environments

- Repaired the existing Ubuntu 24.04 WSL distro, converted it from WSL 1 to WSL 2, and verified systemd and the Linux toolchain start.
- `npm test` passed (2 tests) and the production Vite frontend built successfully.
- Published the existing .NET 8/LibOrbisPkg helper as a self-contained `linux-x64` ELF executable.
- Native helper fixtures passed for GP4 generation, GP4 reuse, measured progress, successful PKG validation, unchanged reused-GP4 hash, and invalid-input rejection. The generated fixture package was 35,192,832 bytes; the reused-GP4 fixture package was 6,619,136 bytes.
- Rebased an existing fixture GP4 whose `orig_path` entries pointed into `/mnt/usb0/CUSA00001` onto the selected Linux dump using each GP4 `targ_path`. Reuse and package validation passed, and the original GP4 SHA-256 remained unchanged. The same regression case is now part of the Linux CI fixture job.
- Submitted that same rebased project as a direct `.gp4` input; it built and passed package validation, and the source GP4 checksum remained unchanged. Direct GP4-file processing is covered by the Linux CI fixture job.
- The helper installed by the `.deb` generated and validated a synthetic fPKG and emitted structured completion/progress events.
- `npm run tauri:build -- --bundles deb,rpm` completed successfully on Ubuntu 24.04 x86-64 after the demo-state isolation fix. Both bundles are about 33.7 MiB.
- Installed the refreshed `.deb` in Ubuntu 24.04 and ran the packaged Tauri app as an unprivileged user under Xvfb. The opening screen, preview menu, labelled demo progress, demo success, and demo error screens rendered. Scrolling exposed the lower controls.
- Through the installed app’s manual path field, packaged a synthetic Itemzflow-style fixture. The GUI received helper events, showed the package path and size, and displayed success only after LibOrbisPkg validation passed. Continue returned to the opening screen and retained the user’s configured output directory; demo sample paths no longer overwrite it.
- Through the installed app’s manual path field, submitted a standalone `.gp4` project whose `orig_path` entries pointed to `/mnt/usb0/CUSA00002`. The packaged GUI automatically reused the project, resolved its files against the GP4 directory by `targ_path`, built a 6,619,136-byte PKG, and showed the validated success screen. The GP4 SHA-256 was unchanged.
- Submitted a nonexistent path through the installed GUI. The native error screen displayed a readable message, and **Choose another game** returned to the opening screen.
- Verified Linux Itemzflow discovery with a controlled `settings.ini` containing `[Settings]` and `Dumper_Path=/tmp/vortex-itemzflow-discovery`; the helper emitted the fixture as a `dump-candidate` and reported discovery completion. The Linux CI fixture now also checks an accessible `Dumper_Path`, a `<TITLE_ID>` child dump, and detection of its existing GP4.
- Installed the `.rpm` in Fedora 45, verified the installed command, and kept the app running under Xvfb until the 15-second timeout.
- Built the Arch `.pkg.tar.zst` with `makepkg` in an Arch Linux container, installed it with `pacman -U`, and kept the app running under Xvfb until the 15-second timeout.
- Verified SHA-256 checksums for all three staged installers.
- Built and extracted the source archive; verified that it contains the application, modified LibOrbisPkg source, workflows, license texts and PS4 test procedure, with portable ZIP paths and no generated binaries. Its SHA-256 check passed.

The Tauri build exposed and fixed two Linux issues: resource directories now use explicit directory mappings, and the serialized `BuildError` event derives `Clone` as required by Tauri's emitter. The Arch build exposed a `makepkg --cleanbuild` collision with the app's `src/` tree; the workflow now preserves that source directory. The Arch job also now copies the required licence files and uses a shared `packaging/PKGBUILD`.

## Not verified

- All nine Bash `run` blocks in the GitHub Actions workflows pass `bash -n`. The Actions jobs themselves have not been dispatched; this workspace has no `.git` directory or configured remote, and no GP4 Builder repository is connected for dispatch.
- The native GTK folder picker opened and selected a synthetic dump under Xvfb; that selection triggered a package build and validation through the packaged GUI. OS-level drag-and-drop was not exercised. GUI tests ran under Xvfb, not in a full Mint/XFCE desktop session.
- Linux Mint 22.3 XFCE on the PS4 has not been tested. The console and real dump are not available in this environment.
- No real Itemzflow dump has been packaged. The package fixtures use synthetic data.
- Structural LibOrbisPkg validation does not prove an fPKG installs or runs on PS4. Console installation/gameplay testing remains pending.
- Patch and DLC compatibility is not claimed.
- Windows app builds are out of scope.
