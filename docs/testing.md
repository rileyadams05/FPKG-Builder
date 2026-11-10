# Build and test status

## Changes under verification

This working tree contains the PS4 feedback fixes; the published v0.1.1 package does not contain them.

- The PlayGo allocation failure is caused by an upstream one-pass estimate in `PkgBuilder.BuildPkg`: it sizes the `playgo-chunk.sha` entry before the final PKG body alignment. The hash entry can push the body across a `0x80000` boundary, increasing the final PKG size and required SHA table after reservation. It is an internal metadata-size bug, not evidence that Linux ran out of disk space.
- The revised LibOrbisPkg code computes the reservation iteratively using the final body alignment and PFS size. The regression runner includes a fixed case that requires 68 bytes where the prior one-pass estimate reserved only 36, plus an alignment-boundary sweep.
- The external Update.pkg path now requires PS4 patch content type `DP` (not base-game `GD`), verifies the title ID and package validation, reads the uncompressed inner-PFS size, checks free external space for extraction and the combined output, extracts to a temporary directory beside the Itemzflow folder, and removes that workspace afterward.
- The desktop bridge rejects the Linux root device, partitions on the same physical disk as root, unsupported filesystems, non-block mounts, unwritable destinations, insufficient free space, and an output folder that is not on the selected dump's mount. The partial PKG and final `FPKG/<content-id>.pkg` are on that same external filesystem. The engine has no large-file `/tmp` staging or internal copy step.
- The Linux workflow has synthetic package checks for GP4 generation/reuse, a matching Itemzflow patch, a generated `DP` Update.pkg processed into exactly one validated output, source-file preservation, and the PlayGo allocation regression.

## Checks run in this workspace

| Check | Result |
|---|---|
| `npm test` | Passed: 2 frontend formatting/time tests. |
| `npm run build` | Passed: Vite production build. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Passed. |
| `git diff --check` | Passed. |
| .NET helper build and synthetic PKG/PlayGo tests | Not run: this Windows environment has .NET runtimes but no .NET SDK. |
| Rust compile and Tauri package build | Not run: Cargo cannot reach `static.crates.io` in this environment; required crates are not all cached. |
| Native Linux package installation/launch | Not run locally: this workspace is Windows and has no usable Linux VM/container. |
| PS4 Linux Mint build with a real Itemzflow dump | Pending: requires another test on Riley's PS4. |

The Linux GitHub Actions workflow runs the .NET regression and fixture suite and builds/installs the Debian and RPM packages. These new changes have not yet been pushed or run there, so no CI pass is claimed for them.

## Hardware acceptance still required

After a Linux build from these fixes is available, test with the PS4 Linux Mint 22.3 XFCE setup and a real Itemzflow base-game dump on an external drive. Confirm the build reaches PlayGo digest generation, validates the single `.pkg`, and leaves the dump/GP4/markers/logs untouched. Also test an Itemzflow patch and a readable fake-signed `Update.pkg` separately. No package-install or gameplay result should be inferred from LibOrbisPkg structural validation.
