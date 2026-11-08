# FPKG Builder

FPKG Builder is a lightweight Linux desktop application for PS4 users who want to create fPKG files from compatible game dumps made with Itemzflow. It is designed to complete the packaging stage locally on a PS4 that is already running Linux, reducing the need to transfer large dumps to a separate PC.

## Project overview

Itemzflow handles game dumping; FPKG Builder focuses on packaging. The application uses LibOrbisPkg and is intentionally limited to the Itemzflow-to-fPKG workflow rather than serving as a general PS4 package-management suite.

FPKG Builder is for users who already have a compatible PS4 Linux installation and Itemzflow. It does not install Linux, jailbreak a console, dump games, or install fPKGs onto the PS4. A computer may still be useful or necessary for the console’s initial setup.

## Availability and status

FPKG Builder 0.1.0 is available for x86-64 Linux as `.deb`, `.rpm`, and `.pkg.tar.zst` packages. Automated Linux, Fedora, and Arch build and smoke checks passed. Testing on PS4 Linux Mint with a real Itemzflow dump is still pending. The initial compatibility focus is base-game dumps; patch and DLC support has not been verified.

For installation steps and the Itemzflow-to-fPKG usage guide, see the [v0.1.0 Release](https://github.com/rileyadams05/FPKG-Builder/releases/tag/v0.1.0).

## Credits

- [Itemzflow](https://github.com/LightningMods/Itemzflow), by LightningMods, provides the game-dumping workflow this application complements.
- [LibOrbisPkg](https://github.com/maxton/LibOrbisPkg), by maxton, provides the packaging technology used by FPKG Builder. LibOrbisPkg is licensed under LGPL-3.0; its notices and applicable source are included in this repository.

FPKG Builder is an independent project and is not an official Itemzflow release or endorsed by LightningMods or maxton.
