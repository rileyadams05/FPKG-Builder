# Installation and development

FPKG Builder **0.1.1** is distributed for 64-bit x86 Linux in two installer formats:

| Distribution | File |
|---|---|
| Linux Mint, Ubuntu, Debian | `FPKG-Builder-0.1.1-linux-x64.deb` |
| Fedora and compatible RPM-based distributions | `FPKG-Builder-0.1.1-linux-x64.rpm` |

Download the installer from the [latest GitHub Release](https://github.com/rileyadams05/FPKG-Builder/releases/latest). The release includes a `SHA256SUMS` file for checking downloads. On Linux Mint, Ubuntu, or Debian, open the `.deb` in the desktop package installer or install it with `sudo apt install ./FPKG-Builder-0.1.1-linux-x64.deb`. On Fedora, open the `.rpm` in the package installer or use `sudo dnf install ./FPKG-Builder-0.1.1-linux-x64.rpm`.

Launch **FPKG Builder** from the desktop application menu as your normal user. The bundled packaging helper is self-contained; a .NET SDK is not required. The desktop app uses the system GTK 3 and WebKitGTK 4.1 runtime, which the package manager resolves from package metadata.

## Prepare and process a dump

1. Use Itemzflow on the PS4 to finish dumping the base game and, if wanted, its matching update.
2. Arrange the game folder and optional matching `<TITLE_ID>-patch` folder inside one folder named `Itemzflow`. Keep any GP4 files Itemzflow generated with their game folders. Itemzflow logs and `.complete` marker files are optional; FPKG Builder ignores them and leaves them alone.
3. In Linux, connect or mount the drive and locate its Linux path. An Orbis path such as `/mnt/usb0` is not automatically mounted at that path in Linux.
4. Open FPKG Builder and drop the entire `Itemzflow` folder onto its drop area. It automatically checks the dump, reuses suitable GP4 projects or prepares missing project data in memory, then builds and validates a single `.pkg` from the base game and matching update.
5. After validation succeeds, choose where to save the package. Use your existing PS4 package-installation method to install it later; FPKG Builder does not install it on the console.

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
