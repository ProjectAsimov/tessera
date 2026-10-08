# Tessera — Android TWA (Trusted Web Activity)

This project packages the Tessera PWA (https://projectasimov.github.io/tessera/)
as an Android app using [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), for
distribution through Google Play.

- **Package ID:** `com.projectasimov.tessera`
- **Host:** `projectasimov.github.io`
- **Start URL:** `/tessera/`

## Signing key

The upload keystore lives outside this repository (never commit a keystore):

- Keystore: `C:\Users\User\.secrets\tasktracker\android-upload.keystore`
- Alias: `upload`
- Password: `C:\Users\User\.secrets\tasktracker\android-upload.txt` (plain text file,
  same password for the store and the key). Treat this file like any other secret —
  it is not backed up anywhere else.

`twa-manifest.json` only references the keystore's path and alias; it never stores the
password. Google Play App Signing wraps this upload key once the app is enrolled — Play
re-signs the app with its own app signing key for distribution, and this upload key is
only used to authenticate uploads to the Play Console.

If the keystore or password file is ever lost or compromised, generate a new keystore and
follow Google Play's key-reset process (requires Google's help since Play App Signing is
in use), or use Play's "request upload key reset" flow.

## Bumping the version and rebuilding

1. Edit `twa-manifest.json`:
   - Increment `appVersionCode` (must strictly increase for every Play Store upload).
   - Update `appVersionName` to the new human-readable version (e.g. `1.0.1`).
2. Regenerate the Android project so the manifest changes take effect:
   ```powershell
   cd "C:\Claude Projects\gym-years\android"
   node_modules\.bin\bubblewrap update
   ```
   (Accept the prompt to apply manifest changes; when it asks for versionCode/versionName,
   the values already in `twa-manifest.json` are used automatically if `appVersionName`
   was already updated by hand.)
3. Rebuild and sign:
   ```powershell
   cd "C:\Claude Projects\gym-years\android"
   $env:BUBBLEWRAP_KEYSTORE_PASSWORD = (Get-Content "C:\Users\User\.secrets\tasktracker\android-upload.txt" -Raw).Trim()
   $env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
   node_modules\.bin\bubblewrap.cmd build
   Remove-Item Env:\BUBBLEWRAP_KEYSTORE_PASSWORD
   Remove-Item Env:\BUBBLEWRAP_KEY_PASSWORD
   ```
   This produces `app-release-bundle.aab` (upload this to Play Console) and
   `app-release-signed.apk` (useful for local/manual testing) in this directory.
4. Copy the new bundle into `dist/` with a version-tagged name, e.g.:
   ```powershell
   Copy-Item app-release-bundle.aab "dist\tessera-1.0.1.aab"
   ```

### Notes on this environment

- The JDK and Android SDK used by Bubblewrap are **not** the CLI's default download: this
  machine had `NoDefaultCurrentDirectoryInExePath=1` set, and Bubblewrap's own JDK auto
  installer download a 32-bit (x86) JDK 17 that OOMs on Gradle's build daemon under a
  normal-sized heap. This project's Bubblewrap config
  (`C:\Users\User\.bubblewrap\config.json`) instead points at a manually installed 64-bit
  Temurin JDK 17 at `C:\Users\User\.bubblewrap\jdk64\jdk-17.0.20.1+1`.
- `node_modules\@bubblewrap\core\dist\lib\jdk\JdkHelper.js` has a small local patch: on this
  machine `process.env` already has a `PATH` key (uppercase) from the shell, and
  Bubblewrap's Windows code unconditionally sets a `Path` (title case) key without
  removing the old one, which left two conflicting PATH entries in the child process
  environment and broke `gradlew.bat` / `jarsigner` resolution. The patch removes any
  differently-cased duplicate before writing the merged PATH. If you reinstall
  `node_modules` from scratch, you may need to reapply this patch (or ensure your shell
  only ever has one canonical-case `Path`/`PATH` variable).
- Building from the command line always adds the project directory
  (`C:\Claude Projects\gym-years\android`) to `PATH` before invoking Bubblewrap so that
  `gradlew.bat` can be found (this machine disables the default "search current directory
  first" behavior for `cmd.exe`).

## Play Console — Internal testing track

1. Create the app in Play Console (if not already created) with package name
   `com.projectasimov.tessera`.
2. Enroll in Play App Signing when prompted during the first upload.
3. Go to **Testing → Internal testing → Create new release**.
4. Upload `dist\tessera-1.0.1.aab` (or whichever versioned file you just built).
5. Fill in release notes, save, and roll out to internal testing.
6. Add testers (by email or Google Group) under the Internal testing track's "Testers" tab,
   and share the opt-in URL Play generates.

## Digital Asset Links

`assetlinks.json` in this directory contains the Digital Asset Links statement that must be
published at `https://projectasimov.github.io/.well-known/assetlinks.json` so Chrome treats
the TWA as verified (removing the browser URL bar). Copy its contents into the PWA repo's
`.well-known/assetlinks.json` and deploy it. If the signing key ever changes (e.g. after a
Play App Signing key rotation), regenerate this file with the new SHA-256 fingerprint.

## Rename note (TaskTracker -> Tessera)

The app was renamed to Tessera (package `com.projectasimov.tessera`, start URL `/tessera/`).
The secrets folder is deliberately still `C:\Users\User\.secrets\tasktracker\` and the
keystore/alias/password are unchanged, so the signing fingerprint is the same.
When regenerating the project before the `/tessera/` site is live, fetch the manifest/icons
from the old `/tasktracker/` URLs in memory only, then make sure `app/build.gradle`
(`webManifestUrl`) and `app/src/main/res/raw/web_app_manifest.json` say `/tessera/`.

## Minimum SDK

`minSdkVersion` is 24 (set in `twa-manifest.json` and mirrored in `app/build.gradle`).
Play automatic protection rejects bundles with a minimum SDK below 24. If the project is
regenerated, confirm `app/build.gradle` still says `minSdkVersion 24` and reapply the two
`/tessera/` hand fixes described above.

## Build 2 (1.1.0, versionCode 2): notifications

`enableNotifications` is now `true`, so Bubblewrap emits the `POST_NOTIFICATIONS`
uses-permission and the `DelegationService` (enabled via the `enableNotification` bool).
Artifacts: `dist\tessera-1.1.0.apk` / `.aab` (the 1.0.0 files are kept). Once the live
`/tessera/` site existed, the project was regenerated straight from `twa-manifest.json`
(no more in-memory /tasktracker/ override), so `web_app_manifest.json` and the
`webManifestUrl` resValue come out with `/tessera/` without hand edits. A running Gradle
daemon can lock `app/build`; stop any java process under `.bubblewrap` before regenerating.
