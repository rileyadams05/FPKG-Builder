# Installation and development

The latest public release is **0.1.1**. A replacement build is being prepared as **0.1.2** and must pass the documented checks before it is used for PS4 testing. The 0.1.1 installer does not include the PlayGo or external-storage fixes.

FPKG Builder is distributed for 64-bit x86 Linux in two installer formats:

| Distribution | File |
|---|---|
| Linux Mint, Ubuntu, Debian | `.deb` |
| Fedora and compatible RPM-based distributions | `.rpm` |

Download the installer from the [latest GitHub Release](https://github.com/rileyadams05/FPKG-Builder/releases/latest). The release includes a `SHA256SUMS` file for checking downloads. Open the installer in your desktop package installer or use your distribution's package command. The v0.1.2 test packages will use filenames `FPKG-Builder-0.1.2-linux-x64.deb` and `FPKG-Builder-0.1.2-linux-x64.rpm` when the CI build is available.

Launch **FPKG Builder** from the desktop application menu as your normal user. The bundled packaging helper is self-contained; a .NET SDK is not required. The desktop app uses the system GTK 3 and WebKitGTK 4.1 runtime, which the package manager resolves from package metadata.

## Prepare and process a dump

1. Use Itemzflow on the PS4 to finish dumping the base game and, if wanted, its matching update.
2. Put the game folder and, when available, its matching `<TITLE_ID>-patch` folder inside one folder named `Itemzflow`. Keep Itemzflow GP4 files beside their game folders. Logs and `.complete` marker files may be present or absent; the app ignores them and leaves them untouched.
3. Connect or mount the external SSD or HDD in Linux. The `Itemzflow` folder must be on a separately mounted physical drive from the Linux installation. Use a writable filesystem that supports files larger than 4 GB, such as ext4, exFAT, NTFS, Btrfs or XFS. An Orbis path such as `/mnt/usb0` is not automatically available at the same path in Linux.
4. Open FPKG Builder and drop the entire `Itemzflow` folder into the window (or use **Open Itemzflow…**). The app detects the base game and matching update, reuses valid GP4 projects or prepares missing project data in memory, then builds one package. If no update is found, answer **Yes** or **No** to “Do you have a game update?”. If you choose Yes, place the matching Itemzflow `-patch` folder or a compatible, readable patch PKG named exactly `Update.pkg` inside the parent folder, then rescan.
5. The package is built as a partial file in `FPKG` beside `Itemzflow`, on the same external drive. LibOrbisPkg validation runs before the file is renamed to its final `.pkg` name. The app does not use the internal Linux filesystem for large package output or update extraction. Existing output names are not overwritten.
6. Use your existing PS4 package-installation method to install the finished fPKG later; FPKG Builder does not install it on the console.

When `Update.pkg` is used, it must be a compatible PS4 patch package whose fake-package PFS data LibOrbisPkg can read. The app checks the package type, matching title ID and package validation; packages that require unavailable keys or cannot be read fail instead of being silently skipped. Updates are never downloaded by the app. DLC is outside the current workflow.

The application does not process DLC. Do not move or delete the source dump or its GP4 files while a build is running.

## Development

Prerequisites: Node.js 22 with npm, Rust stable, .NET 8 SDK, and Tauri 2 Linux build dependencies (including GTK 3, WebKitGTK 4.1, and Linux package tools).

```sh
npm ci
npm test
npm run build
dotnet build src/Vortex.Engine.Poc/Vortex.Engine.Poc.csproj -c Release
```

The `Linux packages` GitHub Actions workflow publishes the .NET helper, runs GP4 reuse/generation and base-plus-update package fixtures, builds `.deb` and `.rpm` packages, and smoke-tests installation and launch. A maintainer publishes a version by updating all version metadata and using a commit message beginning `Release vX.Y.Z`; after CI succeeds on `main`, the release job creates the matching GitHub tag and release with packages, source archive, and checksums.

See [`ps4-linux-mint-test.md`](ps4-linux-mint-test.md), [`testing.md`](testing.md), and [`licensing.md`](licensing.md).
