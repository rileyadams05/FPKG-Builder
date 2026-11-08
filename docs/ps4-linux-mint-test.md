# PS4 Linux Mint test checklist

This checklist is for the first user-run test of the Linux x86-64 `.deb` on PS4 Linux Mint. Package validation is structural and does not prove that a package installs or runs on PS4.

## Install and launch

1. From the [latest GitHub Release](https://github.com/rileyadams05/FPKG-Builder/releases/latest), download `FPKG-Builder-0.1.1-linux-x64.deb` and verify it against the listed `SHA256SUMS` if desired.
2. Confirm the Linux installation is 64-bit x86 (`uname -m` should report `x86_64`).
3. Install the `.deb` using Linux Mint's graphical package installer or `sudo apt install ./FPKG-Builder-0.1.1-linux-x64.deb`.
4. Open **FPKG Builder** from the application menu as the ordinary user.

## Test a base game and optional update

1. Let Itemzflow finish the game dump. If including an update, make sure it is the matching `<TITLE_ID>-patch` folder for the base game.
2. Put the base-game folder and matching patch folder inside the parent folder named `Itemzflow`. Itemzflow-generated GP4 files should stay beside their game data. `.complete` marker files and logs may be present or absent; FPKG Builder ignores them and leaves them alone.
3. Connect or mount the storage in Linux and note its Linux mount path. An Orbis path such as `/mnt/usb0` is not automatically available under Linux.
4. Drag and drop the whole `Itemzflow` folder onto the application. There is no separate build step. Processing should start automatically.
5. Check that the app processes the base game and matching update into one package, reports measured progress, and shows completion only after package validation. When prompted, choose where to save the `.pkg` file.
6. Confirm the original game files and GP4 files remain present and unchanged. If you have a GP4 checksum, compare it before and after.
7. Use your existing local PS4 package-installation method to test the resulting fPKG. FPKG Builder does not install it to the console.

DLC is outside this application's scope and should not be placed into the base/update build. Record any error text and the package validation result separately from PS4 installation or gameplay results.
