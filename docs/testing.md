# Build and test record

## Release build checks

The `Linux packages` GitHub Actions workflow runs against the exact source commit used for a release. Publishing is gated on successful completion of both the Linux build/fixture job and the Fedora package-install/launch job.

The Linux job:

- Publishes the .NET 8 helper as a self-contained `linux-x64` application.
- Exercises generated and existing GP4 paths, including GP4s with Orbis-style source paths, and checks that existing GP4 files remain unchanged.
- Processes a base-game fixture with a matching update fixture and checks for the single expected `.pkg` output, package validation, and unchanged source GP4s.
- Includes optional DLC-named fixture content, log files, and completion markers to verify they do not become extra package outputs or get modified.
- Checks structured measured-progress events and rejects invalid input.
- Builds the Tauri `.deb` and `.rpm`, installs the `.deb` on Ubuntu, and smoke-launches the app.

The Fedora job installs the generated `.rpm` and smoke-launches the GUI. The release job then checks that version metadata agrees, prepares only the `.deb`, `.rpm`, source archive, and `SHA256SUMS`, and creates the matching GitHub Release. No Arch package is built or released.

## Previously completed Linux run

GitHub Actions run [42473961512](https://github.com/rileyadams05/FPKG-Builder/actions/runs/42473961512) passed on source commit `3488d21856b6f147fdc808d9b7b73b175bdcedad`. The Linux fixture/build job and Fedora and Arch jobs all succeeded. This run used version `0.1.0` metadata, so its package files are not reused for the `0.1.1` release. The versioned release workflow builds new packages from its own release commit before publishing.

Earlier Arch package smoke checks are retained here as development history only. Arch and Manjaro are not official package targets.

## Still requires PS4 testing

No real Itemzflow game dump has been tested on PS4 Linux Mint hardware in this build environment. Riley will perform the console test. Structural LibOrbisPkg validation confirms available package checks only; it does not prove PS4 installation or gameplay compatibility. The Linux Mint 22.3 XFCE PS4 test checklist is in [`ps4-linux-mint-test.md`](ps4-linux-mint-test.md).
