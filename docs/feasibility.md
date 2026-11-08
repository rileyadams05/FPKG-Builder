# Focused Itemzflow-to-fPKG assessment

Assessment date: 8 November 2026. FPKG Builder is an Itemzflow-focused post-dump packaging companion. Itemzflow dumps PS4 games; FPKG Builder accepts the prepared `Itemzflow` folder, reuses GP4 projects where possible, combines a base game and matching update into one fPKG through LibOrbisPkg, and reports validation results. It is not a dumper, game manager, package explorer, extraction suite, or GP4 editor.

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

The target is PS4 Linux Mint 22.3 XFCE x86-64 using Tauri 2 and system WebKitGTK. The official CI builds Debian and RPM packages on Ubuntu x86-64 and tests Debian installation/launch on Ubuntu and RPM installation/launch on Fedora. Arch Linux and Manjaro are not official package targets. Mint's WebKit integration, resource use on PS4 hardware, real Itemzflow dump processing, and console installation testing remain open.

## Current delivery status

- **Source:** Tauri 2 frontend, Rust command/event bridge, .NET 8 helper, focused docs, licensing notes, desktop launcher, and CI workflows are present.
- **Frontend:** `npm run build` succeeds. Windows application builds are out of scope; Linux is the supported desktop target.
- **Distribution:** the official Linux formats are `.deb` for Linux Mint/Ubuntu/Debian and `.rpm` for Fedora-compatible distributions. The older Arch package work is retained only as historical testing documentation; no Arch package is built or officially maintained.
- **Windows:** application builds are out of scope. Windows remains the development host only.
- **GitHub Actions:** run [42473961512](https://github.com/rileyadams05/FPKG-Builder/actions/runs/42473961512) passed the Linux, Fedora, and historical Arch jobs on commit `3488d21856b6f147fdc808d9b7b73b175bdcedad`. That run used v0.1.0 metadata, so its package artifacts are not reused for v0.1.1. The release workflow rebuilds versioned packages on the release commit and publishes only after the Debian/RPM checks succeed.
- **PS4 and website:** hardware testing with a real Itemzflow dump remains Riley's next step. No website changes are in scope.

## Licensing

The upstream LGPL-3.0 notice, pinned source, modifications, and separate engine assembly are retained. Itemzflow is inspected only for compatibility and no Itemzflow source is incorporated. Tauri dependencies are resolved from their package sources in CI. Release packages must continue to include the notices, replaceable Core assembly and corresponding source/build commands.
