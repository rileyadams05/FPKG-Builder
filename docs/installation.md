# Installation and development

FPKG Builder targets x86-64 Linux. The v0.1.0 installers are published on the [GitHub Releases page](https://github.com/rileyadams05/FPKG-Builder/releases). Available formats are Debian `.deb`, Arch `.pkg.tar.zst`, and RPM `.rpm`. They passed automated distribution-container build and smoke checks; PS4 Linux Mint hardware and real Itemzflow dump testing remain pending.

Download the `.deb` for your architecture from GitHub Releases, then install it on Linux Mint, Ubuntu, or Debian with:

```sh
sudo apt install ./FPKG-Builder-0.1.0-linux-x64.deb
```

Launch **FPKG Builder** from the desktop menu as the ordinary user. Do not run the application with `sudo`.

Mount the storage containing the dump in Linux first. FPKG Builder cannot mount Orbis filesystems; an Orbis `Dumper_Path` is not automatically a Linux mount path. Put one game's base folder and its matching `<TITLE_ID>-patch` folder, if present, inside a folder named `Itemzflow`. Drop that entire `Itemzflow` folder onto the application. The builder reuses Itemzflow GP4 projects when possible, otherwise prepares the GP4 data in memory, and combines the base game and matching update into one `.pkg`. It ignores optional `.complete` marker files and logs, whether present or absent, and leaves the dump contents in place. Once validation finishes, choose where to save the package. This application does not process DLC or install the fPKG on the console.

## Other Linux distributions

Install an Arch/Manjaro package with `sudo pacman -U ./fpkg-builder-0.1.0-1-x86_64.pkg.tar.zst`. Install an RPM package with `sudo dnf install ./FPKG-Builder-0.1.0-linux-x64.rpm`.

The Linux GUI uses the system GTK 3 and WebKitGTK 4.1 runtime. Package metadata declares the supported runtime dependencies. The bundled engine is a self-contained .NET 8 application; users do not need to install the .NET SDK.

## Development prerequisites

- Node.js 22 and npm
- Rust stable toolchain
- .NET 8 SDK
- Tauri 2 Linux build dependencies, including GTK 3, WebKitGTK 4.1, and package tools

Run frontend checks and build the frontend with `npm ci`, `npm test`, and `npm run build`. The GitHub Actions Linux workflow publishes the helper, exercises synthetic fixtures, and builds the Debian and RPM bundles. The Arch workflow packages the same GUI binary and helper in an Arch environment.

See [`ps4-linux-mint-test.md`](ps4-linux-mint-test.md) for the on-console checklist and [`testing.md`](testing.md) for verified and pending tests.
