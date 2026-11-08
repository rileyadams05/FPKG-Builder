# FPKG Builder

FPKG Builder is a Linux desktop application for turning Itemzflow game dumps into PS4 fake package files (fPKGs). Itemzflow handles dumping the game; FPKG Builder handles the packaging stage, allowing the work to be done on a PS4 that is already running Linux instead of transferring a large dump to a separate Windows PC.

The application accepts the prepared `Itemzflow` folder by drag and drop. It handles a base-game dump and its matching game update together as one `.pkg` output. It reuses suitable GP4 projects from Itemzflow when available, prepares missing project data in memory, shows measured build progress, validates the completed package, and then asks where to save it. The dump and GP4 files are left in place. Optional Itemzflow logs and completion-marker files are ignored and left untouched.

FPKG Builder requires a PS4 with a jailbreak that works with the console and its Linux setup, Linux installed and configured on the PS4, Itemzflow installed and used to create the dump, and enough storage for the package. A computer is ordinarily required to set up a PS4 jailbreak and Linux; a Raspberry Pi setup method is another option. FPKG Builder is for the packaging work after that setup is complete. It does not jailbreak a console, install Linux, dump games, or install the finished fPKG onto the PS4.

## Package support

The initial workflow combines one base game with its matching update in a single package. DLC is not included in this application. The finished package must be installed separately using the user's existing PS4 package-installation method.

## Linux compatibility

FPKG Builder packages target 64-bit x86 Linux systems.

| Linux distribution | Installer | Architecture |
|---|---|---|
| Linux Mint and compatible Deb-based distributions | `.deb` | x86-64 |
| Fedora and compatible RPM-based distributions | `.rpm` | x86-64 |

[![Download latest release](https://img.shields.io/github/v/release/rileyadams05/FPKG-Builder?style=for-the-badge&label=Download%20latest%20release)](https://github.com/rileyadams05/FPKG-Builder/releases/latest)

for other distributions is welcome through pull requests Or making your own repo But Make sure you credit the original developer and me and anyone else that's worked on the project And follow the original licensing [CONTRIBUTING.md](CONTRIBUTING.md)


<details>
<summary>Credits and licensing</summary>

FPKG Builder was created and is maintained by **[@rileyadams05](https://github.com/rileyadams05)**. Its packaging engine incorporates and modifies **[LibOrbisPkg](https://github.com/maxton/LibOrbisPkg)**, originally developed by **[@maxton](https://github.com/maxton)**, with contributions from **[@Zer0xFF](https://github.com/Zer0xFF)**. LibOrbisPkg is distributed under LGPL-3.0. The upstream license, corresponding source, modifications, and third-party notices are retained in this repository. **Itemzflow**, developed by LightningMods, is the game-dumping application FPKG Builder is designed to work with. Other contributors and upstream projects are credited in the relevant source and notices.

See [CONTRIBUTING.md](CONTRIBUTING.md), [licensing notes](docs/licensing.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for contribution, attribution, and license details.

</details>
