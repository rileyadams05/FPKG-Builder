# Third-party notices

## LibOrbisPkg

The packaging engine incorporates `LibOrbisPkg.Core` from [maxton/LibOrbisPkg](https://github.com/maxton/LibOrbisPkg), pinned to commit `643477263b2644e0803e0f58b8726ea4e3f3b7d4`. It is licensed under GNU LGPL version 3.0; the complete license is distributed as `LibOrbisPkg-LICENSE.txt` and retained at `vendor/LibOrbisPkg/LICENSE.txt`.

The upstream project files were retargeted from .NET Core 3.0 to .NET 8 in `LibOrbisPkg.Core/LibOrbisPkg.Core.csproj` and `PkgTool.Core/PkgTool.Core.csproj`. `PFSBuilder.cs` and `PkgBuilder.cs` were instrumented with typed, measured packaging-progress callbacks. These changes are in the included corresponding source at `vendor/LibOrbisPkg`.

The engine is published as a self-contained .NET application with `LibOrbisPkg.Core.dll` kept as a separate assembly in the `resources/engine` folder. The folder includes the runtime files needed to run it without a user-installed .NET SDK. Keep the assembly replaceable when redistributing the application; the complete source and the commands used to build it are supplied with the project and the source archive under `release-artifacts/source`. The Tauri interface invokes the engine as a separate process and consumes its JSON event stream.

To build a replacement assembly from the included modified source, run `dotnet build vendor/LibOrbisPkg/LibOrbisPkg.Core/LibOrbisPkg.Core.csproj -c Release`; the output is `vendor/LibOrbisPkg/LibOrbisPkg.Core/bin/Release/net8.0/LibOrbisPkg.Core.dll`. In a Debian package built from this source, the replaceable assembly is installed at `/usr/lib/FPKG Builder/resources/engine/LibOrbisPkg.Core.dll`. Replacing that file with a compatible build allows a recipient to use a modified library with the bundled engine. The helper's project file is included for rebuilding/relinking the engine if an API change requires it.

## Tauri and JavaScript packages

The desktop shell uses Tauri 2 and the official Tauri dialog plugin. The interface includes the Tauri JavaScript API. Their Apache-2.0/MIT license texts are bundled under `resources/licenses/npm` in desktop installers. The Rust crate license inventory and available crate license texts are bundled in `resources/THIRD_PARTY_DEPENDENCY_LICENSES.md` and `resources/licenses/rust`; `tools/bundle-licenses.mjs` regenerates them from `Cargo.lock`. Vite and the Tauri CLI are build-time tools and are not included in application installers.

## Itemzflow

Itemzflow is referenced for compatibility research and dump/configuration conventions. No Itemzflow source code is copied or linked into this application.
