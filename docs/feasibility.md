# Focused Itemzflow-to-fPKG assessment

Assessment date: 7 November 2026. FPKG Builder is an Itemzflow-focused post-dump packaging companion. Itemzflow dumps PS4 games; FPKG Builder selects a dump, reuses its GP4 when possible, builds an fPKG through LibOrbisPkg, and reports the validator result. It is not a dumper, game manager, package explorer, extraction suite, or GP4 editor.

## What Itemzflow already produces

Itemzflow's dump code prompts with `ASK_FOR_GP4` during applicable dump flows. A generated project is saved beside the dump. For ordinary game and patch dumps the filename is `<TITLE_ID>.gp4`; additional-content projects use a content-ID-derived filename and DLC flows may append `-DLC.gp4`. Its generator reads `sce_sys/param.sfo`, selects a project type from dump type, uses relative file source/target paths, and filters package-generated metadata and other non-source files. It can use `sce_sys/playgo-manifest.xml` when present.

The normal dump directory is `<Dumper_Path>/<TITLE_ID>`. Patches use `<TITLE_ID>-patch`; unlock data uses `<TITLE_ID>-unlock`; DLC uses separate title/content-specific directories. `Dumper_Path` is a `[Settings]` key in `settings.ini`. Itemzflow may load the file from the selected USB root or `/user/app/ITEM00001/settings.ini`, with USB paths commonly under `/mnt/usbN`. Those are Orbis OS paths, not proof that Linux mounted the same location.

The production workflow now accepts only the complete `Itemzflow` folder by drag and drop. The user places one base-game folder and its matching `-patch` folder inside it. The application checks the folder metadata, reuses GP4s where usable, and creates missing GP4 project data in memory. It combines base and matching update entries into a single app package, lets the user choose a save path after validation, and leaves dump files, GP4s, marker files, and logs untouched. DLC is outside this application's scope.

Primary source references: Itemzflow [`utils.cpp`](https://github.com/LightningMods/Itemzflow/blob/main/itemzflow/source/utils.cpp) for settings, [`dump.cpp`](https://github.com/LightningMods/Itemzflow/blob/main/external/libdumper/source/dump.cpp) for dump paths and output, [`gp4.cpp`](https://github.com/LightningMods/Itemzflow/blob/main/external/libdumper/source/gp4.cpp) for project generation/filters, [README](https://github.com/LightningMods/Itemzflow/blob/main/README.md), and [release notes](https://github.com/LightningMods/Itemzflow/releases). These files were inspected for interoperability; Itemzflow implementation code is not copied.

## Minimum workflow implemented

1. **Drop the prepared folder.** The one input is a directory named `Itemzflow`, containing one base-game folder and optionally the matching `-patch` update.
2. **Inspect projects and metadata.** Read the SFO metadata, reuse GP4 projects, and resolve their file references safely against the selected Linux folders without rewriting the GP4.
3. **Prepare and merge.** Generate missing project data in memory. Overlay update files on the base app's target paths, retain the base app metadata, and exclude Itemzflow marker/log files outside the game dump folders.
4. **Build and validate.** Run LibOrbisPkg in the background and report measured build progress. Validate the single completed package.
5. **Save.** After validation, ask where to save the one `.pkg`. Copy it safely to the chosen path and show success only after that copy completes.

There are no browse, path-entry, GP4-selection, discovery, output-settings, or demo-preview controls in the production interface. Its opening screen is the single folder drop. A cancelled save prompt discards the staged package without changing the dump. Existing destination files are not overwritten.

## Backend and measured progress

The source is upstream LibOrbisPkg pinned to `643477263b2644e0803e0f58b8726ea4e3f3b7d4`. Core projects target .NET 8. The helper supports GP4 detection/reuse, validation, safe path resolution, in-memory generation, package writing and available package checks. It has been exercised in Windows with synthetic fixture data: reuse and generation passed; package output was reparsed and passed LibOrbisPkg validation; missing-GP4 processing did not create a project in the dump.

The upstream code did not expose byte progress. Minimal hooks in PFS/PKG write loops report measured file bytes, signing/hash bytes, encryption sectors and PlayGo data. Sparse image writes and finalization/validation have no reliable denominator and remain indeterminate. The JSON stream includes actual bytes and totals when available, measured throughput and a rolling stage ETA only after sufficient time/samples. It does not claim a verified total-work fraction. `completed` is emitted only after validation.

The helper is bundled self-contained without a manually installed .NET SDK. `LibOrbisPkg.Core.dll` stays separate from the engine executable in the bundled runtime folder to preserve replaceability. LGPL notices and source modifications are described in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Support boundary

The supported workflow is one base game and its matching update combined into one app `.pkg`. DLC is intentionally excluded. Synthetic base-plus-update fixtures pass the available LibOrbisPkg package validation. Real Itemzflow GP4 variations and PS4 installation/gameplay still require console testing. Package structural checks do not prove that a package will install or run on a PS4.

The target is PS4 Linux Mint 22.3 XFCE x86-64 using Tauri 2 and system WebKitGTK. The current Linux pipeline uses Ubuntu x86-64 and builds Arch in an Arch container. Package/helper installation and startup have been smoke-tested in Ubuntu 24.04, Fedora 45, and an Arch Linux container. Mint's WebKit integration, resource use on PS4 hardware, real Itemzflow dump processing, interactive desktop behavior, and console installation testing remain open. Cross-publishing alone does not pass those gates.

## Current delivery status

- **Source:** Tauri 2 frontend, Rust command/event bridge, .NET 8 helper, focused docs, licensing notes, desktop launcher, and CI workflows are present.
- **Frontend:** `npm run build` succeeds. Windows application builds are out of scope; Linux is the supported desktop target.
- **Existing Linux installers:** the staged v0.1.0 `.deb`, `.rpm`, and `.pkg.tar.zst` were built and smoke-tested before the current merged-update workflow. They are preserved and have not been rebuilt from the current source changes.
- **Windows:** application builds are out of scope. Windows remains the development host only.
- **GitHub Actions:** the Linux workflow has been updated to test the Itemzflow-parent input and combined base/update package. It has not yet run against these current local changes. The Windows host could not run Linux Tauri builds here: WSL returned `Wsl/E_ACCESSDENIED`.
- **Website/release:** no website changes were made. The existing v0.1.0 GitHub release contains the earlier build; the current source changes have not been published as a new release.

## Licensing

The upstream LGPL-3.0 notice, pinned source, modifications, and separate engine assembly are retained. Itemzflow is inspected only for compatibility and no Itemzflow source is incorporated. Tauri dependencies are resolved from their package sources in CI. Release packages must continue to include the notices, replaceable Core assembly and corresponding source/build commands.
