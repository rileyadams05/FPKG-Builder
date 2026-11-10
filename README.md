# FPKG Builder

FPKG Builder is a Linux desktop application for turning Itemzflow game dumps into PS4 fake package files (fPKGs). Itemzflow handles dumping the game; FPKG Builder handles the packaging stage, allowing the work to be done on a PS4 that is already running Linux instead of transferring a large dump to a separate Windows PC.

The application accepts the complete `Itemzflow` parent folder by drag and drop or through its folder picker. A base-game dump and matching Itemzflow `-patch` folder are combined into one `.pkg`; a user-supplied update named `Update.pkg` can also be processed when its fake-package data is readable by LibOrbisPkg. If no update is present, the app asks whether the user has one. The output is written and validated in an `FPKG` folder beside the selected `Itemzflow` folder. Original dump files and GP4 files remain in place; logs and optional `.complete` markers are ignored.

Builds require the dump to be on a writable, separately mounted external SSD or HDD. The application checks the Linux mount, filesystem type, write access and available space before building. The package file and any temporary update extraction are placed on that same external filesystem; builds are blocked on the Linux root filesystem. Use a filesystem that supports files larger than 4 GB, such as ext4, exFAT, NTFS, Btrfs or XFS. An SSD is recommended for throughput, but an HDD is supported.

FPKG Builder requires a PS4 with a jailbreak that works with the console and its Linux setup, Linux installed and configured on the PS4, Itemzflow installed and used to create the dump, and enough storage for the package. A computer is ordinarily required to set up a PS4 jailbreak and Linux; a Raspberry Pi setup method is another option. FPKG Builder is for the packaging work after that setup is complete. It does not jailbreak a console, install Linux, dump games, or install the finished fPKG onto the PS4.

## Package support

The workflow targets one base game and, optionally, its matching update in one package. DLC is not included. Update PKGs that require keys unavailable to LibOrbisPkg cannot be extracted; the application reports that failure rather than silently building a base-only package. The finished package must be installed separately using the user's existing PS4 package-installation method.

## Linux compatibility

FPKG Builder packages target 64-bit x86 Linux systems.

| Linux distribution | Installer | Architecture |
|---|---|---|
| Linux Mint, including 22.3 XFCE | `.deb` | x86-64 |
| Ubuntu and Debian | `.deb` | x86-64 |
| Fedora and compatible RPM-based distributions | `.rpm` | x86-64 |

[![Download latest release](https://img.shields.io/github/v/release/rileyadams05/FPKG-Builder?style=for-the-badge&label=Download%20latest%20release)](https://github.com/rileyadams05/FPKG-Builder/releases/latest)

Release downloads include installation and Itemzflow-to-fPKG instructions. Community packaging for other distributions is welcome through pull requests, but a format is not officially supported until it has been reviewed and tested. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project and release status

The current published application version is **0.1.1**. It predates the external-storage enforcement, desktop UI redesign, and PlayGo allocation correction. Version **0.1.2** is the next test-build version; its regression checks, Linux package build, and launch tests must pass before it is prepared for PS4 testing. Package validation does not establish that a package installs or runs on a PS4.

<details>
<summary>Credits and licensing</summary>

FPKG Builder was created and is maintained by **Riley Adams (`rileyadams05`)**. Its packaging engine incorporates and modifies **LibOrbisPkg**, originally developed by **maxton** and distributed under LGPL-3.0. The upstream license, corresponding source, modifications, and third-party notices are retained in this repository. **Itemzflow**, developed by LightningMods, is the game-dumping application FPKG Builder is designed to work with. Other contributors and upstream projects are credited in the relevant source and notices.

See [CONTRIBUTING.md](CONTRIBUTING.md), [licensing notes](docs/licensing.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for contribution, attribution, and license details.

</details>
