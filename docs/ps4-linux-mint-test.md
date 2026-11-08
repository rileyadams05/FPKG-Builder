# PS4 Linux Mint test checklist

This checklist records the first on-console test for the Linux x86-64 `.deb`. Package validation by LibOrbisPkg is structural; it does not prove the resulting fPKG installs or runs on a PS4.

## Install and launch

1. Download the FPKG Builder `.deb` release asset on Linux Mint. A matching official FPKG Builder release has not yet been published; any legacy pre-rename package is not a substitute for a verified FPKG Builder build.
2. Confirm the system is x86-64 and identify the Mint release:

   ```sh
   uname -m
   cat /etc/os-release
   ```

   The expected architecture is `x86_64`. This build has not yet been tested on Mint 22.3 on PS4 hardware.
3. Install the package and dependencies:

   ```sh
   sudo apt install ./FPKG-Builder-0.1.0-linux-x64.deb
   ```

4. Launch **FPKG Builder** from the desktop menu as the ordinary user. Do not run the app with `sudo`.

## Process one base-game dump

1. Mount the storage containing the Itemzflow dump in Linux. The application cannot mount Orbis filesystems or translate an Orbis path that is not mounted.
2. Check the output destination has enough free space. The estimate is based on source bytes plus a safety margin; large dumps need substantial free space.
3. If the app discovers the dump automatically, select its candidate. Otherwise browse to the directory containing `sce_sys/param.sfo` or enter its Linux path. Start with a base-game dump; patch and DLC support is unverified.
4. If the dump contains an Itemzflow `.gp4`, confirm the app reports that it is reusing the existing project. If there is no usable GP4, generation should happen in memory; the dump should not gain or lose files.
5. Let packaging and LibOrbisPkg validation finish. Record the displayed output path, package size, and validation status. A successful validation is not an installation or gameplay test.
6. Verify the output exists and record its checksum:

   ```sh
   ls -lh "/path/to/output/package.pkg"
   sha256sum "/path/to/output/package.pkg"
   ```

7. If an existing GP4 was present, record its checksum before the build and verify it afterward:

   ```sh
   GP4="/path/to/dump/CUSA12345.gp4"
   sha256sum "$GP4" > /tmp/itemzflow-gp4-before.sha256
   # Run the build in the application, then:
   sha256sum -c /tmp/itemzflow-gp4-before.sha256
   ```

   It should report `OK`. The application must not modify that project or the game dump.
8. If a failure occurs, save the readable error and optional diagnostic details. The app must not show success or leave a completed-looking package after a failed build.

Do not interpret the structural validation result as proof of PS4 installation or runtime compatibility. Keep those results separate when recording the test.
