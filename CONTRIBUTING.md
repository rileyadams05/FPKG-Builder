# Contributing

Contributions to FPKG Builder are welcome. The initial official distribution targets Linux Mint/Ubuntu/Debian with `.deb` packages and Fedora-compatible systems with `.rpm` packages. Work on Arch Linux, Manjaro, or another distribution may be proposed, but a contribution does not make that format officially supported. Maintainers will review the implementation, licensing, installation behavior, and tests before deciding whether to include it as an official format.

## Before submitting

- Keep the application focused on the Itemzflow-to-fPKG workflow. Do not add DLC packaging to this application without first discussing the scope with the maintainer.
- Include tests or controlled fixtures for behavior changes and report the exact commands and environments used.
- Do not claim PS4 compatibility from desktop or package validation alone. Hardware results must identify the console, Linux distribution, dump type, and test performed.
- Preserve existing copyright, license, and attribution notices. Do not remove upstream notices or relicense copied code.
- Identify every new third-party dependency and its license. Include required notices and source or replacement provisions before adding it.
- Attribute original work to its authors. Repository-level credits identify project creator and maintainer Riley Adams (`rileyadams05`), LibOrbisPkg author maxton, and relevant upstream authors and contributors. Preserve those credits in derivative distributions and documentation where applicable.

## Licensing and attribution

FPKG Builder contains components under different licenses. LibOrbisPkg is licensed under LGPL-3.0; its complete license and modified corresponding source are included in the repository. A contribution that modifies or redistributes that component must comply with the LGPL-3.0 terms. See [`docs/licensing.md`](docs/licensing.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

When proposing code, state its author and license status and confirm that you have the right to contribute it under the applicable project/component license. If the code comes from another project, retain its required copyright notices, license text, attribution, and source availability. Ask the maintainer before submitting code whose license or ownership is unclear. Do not imply that Riley Adams, maxton, LightningMods, or another upstream author endorses a contribution unless they have said so.

## Pull requests

Describe the user-visible change, the affected workflow, licensing impact, and test results. Keep unrelated changes out of the same pull request where practical. Maintainer review and approval are required before a community package format or feature is described as officially supported.
