# Focused Itemzflow-to-fPKG assessment

Assessment date: 7 November 2026. FPKG Builder is an Itemzflow-focused post-dump packaging companion. Itemzflow dumps PS4 games; FPKG Builder selects a dump, reuses its GP4 when possible, builds an fPKG through LibOrbisPkg, and reports the validator result. It is not a dumper, game manager, package explorer, extraction suite, or GP4 editor.

## What Itemzflow already produces

Itemzflow's dump code prompts with `ASK_FOR_GP4` during applicable dump flows. A generated project is saved beside the dump. For ordinary game and patch dumps the filename is `<TITLE_ID>.gp4`; additional-content projects use a content-ID-derived filename and DLC flows may append `-DLC.gp4`. Its generator reads `sce_sys/param.sfo`, selects a project type from dump type, uses relative file source/target paths, and filters package-generated metadata and other non-source files. It can use `sce_sys/playgo-manifest.xml` when present.

The normal dump directory is `<Dumper_Path>/<TITLE_ID>`. Patches use `<TITLE_ID>-patch`; unlock data uses `<TITLE_ID>-unlock`; DLC uses separate title/content-specific directories. `Dumper_Path` is a `[Settings]` key in `settings.ini`. Itemzflow may load the file from the selected USB root or `/user/app/ITEM00001/settings.ini`, with USB paths commonly under `/mnt/usbN`. Those are Orbis OS paths, not proof that Linux mounted the same location.

The application therefore inspects accessible settings and mounts, recognizes dumps from `sce_sys/param.sfo`, and allows a folder/GP4 picker or a manually entered Linux path. It does not mount Orbis filesystems. It prefers and validates the matching Itemzflow GP4. If no usable project exists, generation happens in memory and leaves the dump and any old GP4 untouched.

Primary source references: Itemzflow [`utils.cpp`](https://github.com/LightningMods/Itemzflow/blob/main/itemzflow/source/utils.cpp) for settings, [`dump.cpp`](https://github.com/LightningMods/Itemzflow/blob/main/external/libdumper/source/dump.cpp) for dump paths and output, [`gp4.cpp`](https://github.com/LightningMods/Itemzflow/blob/main/external/libdumper/source/gp4.cpp) for project generation/filters, [README](https://github.com/LightningMods/Itemzflow/blob/main/README.md), and [release notes](https://github.com/LightningMods/Itemzflow/releases). These files were inspected for interoperability; Itemzflow implementation code is not copied.

## Minimum workflow implemented

1. **Select or discover input.** Detect accessible Itemzflow locations on launch, read `Dumper_Path` when its settings file can be found, and accept a dropped folder/GP4, folder/GP4 dialog, or pasted path.
2. **Inspect and validate.** Read title metadata and available game files. Detect matching GP4s. Validate and reuse valid projects, resolving Orbis/other-host source paths against the selected dump in memory.
3. **Generate if needed.** Build a minimal GP4 object with the existing LibOrbisPkg model and scanner only when no suitable project can be used. Do not persist it into the original dump.
4. **Build automatically.** Check the output path/storage, then run LibOrbisPkg without blocking the Tauri UI. Emit JSON events; show measured stage progress, data, throughput and stage ETA where there are enough real samples. Use indeterminate display for operations without a reliable total. Do not invent an overall percentage.
5. **Validate and finish.** Run `PkgReader`/`PkgValidator`; show success only after a successful validator result. Present the actual path, size, duration and result. Errors can be retried or abandoned. Continue resets the screen and retains locations.

There is no separate Build or Edit action. The interface provides one simple selection flow and a labelled preview mode for demo progress/success/error screens. The default destination is user-owned application data; users may choose another folder. The source folder is never selected as an allowed output location, existing packages are not overwritten, and incomplete newly-created output is cleaned up on failure.

## Backend and measured progress

The source is upstream LibOrbisPkg pinned to `643477263b2644e0803e0f58b8726ea4e3f3b7d4`. Core projects target .NET 8. The helper supports GP4 detection/reuse, validation, safe path resolution, in-memory generation, package writing and available package checks. It has been exercised in Windows with synthetic fixture data: reuse and generation passed; package output was reparsed and passed LibOrbisPkg validation; missing-GP4 processing did not create a project in the dump.

The upstream code did not expose byte progress. Minimal hooks in PFS/PKG write loops report measured file bytes, signing/hash bytes, encryption sectors and PlayGo data. Sparse image writes and finalization/validation have no reliable denominator and remain indeterminate. The JSON stream includes actual bytes and totals when available, measured throughput and a rolling stage ETA only after sufficient time/samples. It does not claim a verified total-work fraction. `completed` is emitted only after validation.

The helper is bundled self-contained without a manually installed .NET SDK. `LibOrbisPkg.Core.dll` stays separate from the engine executable in the bundled runtime folder to preserve replaceability. LGPL notices and source modifications are described in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Support boundary

Initial release focus is base-game Itemzflow dumps. The pinned `Gp4Validator` accepts app/ac-data/ac-nodata types but rejects patch GP4. Patch or DLC building is not claimed. Package structural checks do not show that a package will install or run on a PS4.

The target is PS4 Linux Mint 22.3 XFCE x86-64 using Tauri 2 and system WebKitGTK. The current Linux pipeline uses Ubuntu x86-64 and builds Arch in an Arch container. Package/helper installation and startup have been smoke-tested in Ubuntu 24.04, Fedora 45, and an Arch Linux container. Mint's WebKit integration, resource use on PS4 hardware, real Itemzflow dump processing, interactive desktop behavior, and console installation testing remain open. Cross-publishing alone does not pass those gates.

## Current delivery status

- **Source:** Tauri 2 frontend, Rust command/event bridge, .NET 8 helper, focused docs, licensing notes, desktop launcher, and CI workflows are present.
- **Frontend:** `npm run build` succeeds. Windows application builds are out of scope; Linux is the supported desktop target.
- **Linux installers:** `.deb`, `.rpm`, and `.pkg.tar.zst` packages are built in Linux x86-64 environments and staged in `release-artifacts/linux`. The `.deb` was installed and smoke-launched in Ubuntu 24.04; the `.rpm` was installed and smoke-launched in Fedora 45; the Arch package was built, installed and smoke-launched in an Arch container. These tests do not substitute for Linux Mint 22.3 on PS4 hardware.
- **Windows:** application builds are out of scope. Windows remains the development host only.
- **GitHub Actions:** Linux workflows are prepared but have not been dispatched because this workspace has no `.git` directory or configured remote.
- **Website/release:** no website change or public release was made.

## Licensing

The upstream LGPL-3.0 notice, pinned source, modifications, and separate engine assembly are retained. Itemzflow is inspected only for compatibility and no Itemzflow source is incorporated. Tauri dependencies are resolved from their package sources in CI. Release packages must continue to include the notices, replaceable Core assembly and corresponding source/build commands.
