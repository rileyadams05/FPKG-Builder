# FPKG Builder

FPKG Builder is a Linux desktop application for creating PS4 fPKG packages from game dumps made with Itemzflow. It is designed to run on the PS4 itself, so you can finish packaging there without transferring a large game dump to a separate Windows PC.

Itemzflow handles the game dump; FPKG Builder handles packaging. Select the Itemzflow folder and the application locates the game data, reuses an existing GP4 project when one is available, or generates one when needed. It then builds the fPKG, reports build progress, checks the completed package, and saves it to your chosen location.

FPKG Builder leaves the Itemzflow folder and its contents in place. This includes GP4 files, logs, and `.complete` marker files when they are present. The builder ignores the marker files and leaves them untouched; they can be present or absent.

## Package support

FPKG Builder supports base-game and game-update dumps. DLC is handled separately: an Itemzflow-generated DLC folder is packaged as its own content and requires separate signing. DLC is not combined with the base-game or update package.

The finished fPKG is saved for use with your existing PS4 package-installation method. FPKG Builder does not install packages on the console, dump games, install Linux, or jailbreak a PS4.

## Requirements

To use FPKG Builder, you need:

- A PS4 with a jailbreak that works with your console and supports your Linux setup.
- Linux installed and set up on the PS4.
- Itemzflow installed on the PS4 and used to create the game dump.
- Enough free storage for the package being built.

Setting up the PS4 jailbreak and installing Linux normally requires a computer, or a Raspberry Pi method can be used instead for that setup. Once Linux and Itemzflow are running on the PS4, FPKG Builder lets you perform the packaging on the console.

## Linux compatibility

FPKG Builder is built for 64-bit x86 Linux systems.

| Linux distribution | Package format | Architecture |
|---|---|---|
| Linux Mint, including Linux Mint 22.3 XFCE | `.deb` | x86-64 |
| Ubuntu and Debian | `.deb` | x86-64 |
| Arch Linux and Manjaro | `.pkg.tar.zst` | x86-64 |
| Fedora and compatible RPM-based distributions | `.rpm` | x86-64 |

[![Download latest release](https://img.shields.io/github/v/release/rileyadams05/FPKG-Builder?style=for-the-badge&label=Download%20latest%20release)](https://github.com/rileyadams05/FPKG-Builder/releases/latest)

Each release page includes its installation and usage instructions.

<details>
<summary>Credits and licensing</summary>

FPKG Builder uses and modifies [LibOrbisPkg](https://github.com/maxton/LibOrbisPkg), created by maxton. LibOrbisPkg is licensed under LGPL-3.0. Its licence and applicable third-party notices are included in this repository.

[Itemzflow](https://github.com/LightningMods/Itemzflow), developed by LightningMods, provides the game-dumping workflow that FPKG Builder is designed to package.

</details>
