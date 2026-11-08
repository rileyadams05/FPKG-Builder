# Licensing and attribution

FPKG Builder brings together project code and third-party components that retain their own copyright and license terms. This document summarizes key obligations; the license files and notices distributed with each component control.

## Project attribution

FPKG Builder was created and is maintained by (`rileyadams05`) The repository and derivative distributions should preserve this project attribution together with all upstream attribution and copyright notices applicable to included code.

## LibOrbisPkg

FPKG Builder incorporates and modifies LibOrbisPkg, originally developed by maxton. The included LibOrbisPkg source is licensed under GNU LGPL version 3.0. The full license is retained at `vendor/LibOrbisPkg/LICENSE.txt` and is bundled with the application. Modifications to upstream files and the replaceable `LibOrbisPkg.Core.dll` arrangement are documented in `THIRD_PARTY_NOTICES.md`.

Redistributors must comply with the LGPL-3.0 terms, retain copyright and license notices, provide the corresponding source for the modified library, and preserve the required ability to replace or relink the library. The repository contains the modified source and build instructions. Do not treat the LibOrbisPkg code as wholly original FPKG Builder code.

## Other projects and dependencies

Itemzflow, developed by LightningMods, is acknowledged as the dumping application whose output this project is designed to package. Itemzflow source is not included. Tauri, Rust crates, JavaScript packages, and other bundled dependencies retain their own licenses and notices. The dependency license inventories are maintained in `THIRD_PARTY_NOTICES.md` and the generated license resources.

## Contributions

Contributors must identify the authorship and license of submitted code, retain upstream notices, and provide required source and attribution. New distribution formats are community contributions until reviewed and explicitly adopted as official. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).
