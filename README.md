# EPUB Reader

An offline bookshelf and paged EPUB reader built with TypeScript, React, epub.js, Dexie, and Capacitor. Import reflowable, DRM-free EPUB 2/3 files, adjust text size and theme, navigate chapters, and resume at your last saved passage.

The behavior contract is [docs/spec.md](docs/spec.md). Verification results and remaining device checks are recorded in [docs/verification.md](docs/verification.md).

## Browser development

Use **Node.js 24 LTS** (at least 22.12) and npm. Node 26.4.0/npm 11.17.0 were used in this workspace; Node 24 is the recommended development baseline. No Android tooling is needed for browser development.

```powershell
npm ci
npm run dev
```

Open the local address printed by Vite, normally `http://127.0.0.1:5173`. Click **Import EPUB** and select a book. A development server is not the offline deliverable.

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

The production site in `dist/` must be served over HTTPS or localhost at the origin root. Hash routes need no server-side rewrite rules. After its first successful online visit, a service worker caches the application shell for offline use. Deploy the generated `sw.js` with revalidation/no-cache headers; serve hashed assets with long-lived immutable caching. New builds activate when old application tabs are closed. Capacitor bundles assets locally and does not register the browser service worker.

## Browser integration tests

Tests use an installed Google Chrome by default; no emulator or separate Chromium download is required.

```powershell
npm run build
npm run test:e2e
```

Playwright starts a local production preview server. Tests use isolated browser profiles and synthetic, original EPUB fixtures authored for this project, released under CC0. Fixture code lives in `tests/fixtures.ts`; it includes EPUB 2/3, nested contents, Unicode metadata, missing metadata, and hostile content variants. No copyrighted book downloads are needed. Failure traces and screenshots go to ignored `test-results/`.

## Android on Windows

The generated `android/` project is included. Routine development can stay in your editor and browser. Use a physical Android phone for mobile testing instead of an emulator.

Pinned framework versions:

| Component | Version |
| --- | --- |
| React / React DOM | 19.3.1 |
| TypeScript | 7.0.2 |
| Vite | 8.3.4 |
| epub.js | 0.3.93 |
| Dexie | 4.4.6 |
| Capacitor core / Android / CLI | 8.5.3 |
| Capacitor App plugin | 8.1.2 |
| Android Gradle plugin | 8.13.0 |
| Gradle wrapper | 8.14.3 |
| Android SDK compile / target | 36 |
| Minimum Android API | 24 (Android 7.0); use a current Android System WebView |
| Java for Android builds | JDK 21 |

1. Install JDK 21 and Android SDK command-line tools, or install them through Android Studio. Set `JAVA_HOME` to JDK 21 and put its `bin` directory on `PATH`.
2. Set `ANDROID_HOME` to your SDK directory. Install `platforms;android-36`, `build-tools;36.0.0`, and `platform-tools`, and accept SDK licenses. Alternatively set `sdk.dir` in the ignored `android/local.properties` file.
3. Build the web app and synchronize native assets/plugins:

   ```powershell
   npm run android:sync
   ```

4. Build the debug APK without opening an IDE:

   ```powershell
   npm run android:build
   ```

   The build script checks Java and SDK configuration before invoking Gradle. Initial builds need network access for Gradle/Maven downloads. Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Gradle limits workers to two and uses a 1.5 GiB heap; the script uses no persistent daemon.

5. Enable Developer options and USB debugging on your phone, connect it, authorize the computer, and install:

   ```powershell
   adb devices
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

   Add the SDK `platform-tools` directory to `PATH` if `adb` is not found. Chrome's `chrome://inspect/#devices` can inspect a running debug WebView. Run the Android checks in the verification document on the actual phone.

The import picker copies the file into app-local storage. No broad storage permission is requested. The app ID is `com.epubreader.app`; choose a permanent identifier and production signing setup before store release. The debug APK is for development. Android automatic application backup is disabled to keep the local-only storage policy explicit.

## Storage and supported books

- Books, covers, reading positions, and settings live in IndexedDB. Original EPUB blobs are separate from shelf metadata. There is no backend, sync, account, analytics, or export/backup.
- Reading positions use EPUB CFIs rather than rendered page numbers. Position changes are saved after a 300 ms debounce and flushed when leaving/backgrounding. Abrupt termination can lose the last uncommitted change.
- Books are identified by SHA-256 of their original bytes. Importing identical bytes under another filename reopens the existing entry. Different file bytes, including ZIP metadata, count as a different book.
- Input limit: 100 MiB; expanded archive limit: 250 MiB; entry limit: 10,000. Reading performance still depends on book complexity and device memory.
- Fixed-layout, DRM-protected, interactive/scripted EPUBs, and PDFs are unsupported. Font obfuscation does not reject a book; unsupported fonts can fall back. Remote book resources and external links are blocked. Embedded images and ordinary HTML/CSS are supported, subject to renderer compatibility.
- Browser storage is specific to an origin, including port. `localhost`, `127.0.0.1`, development, and preview can have separate shelves. Incognito storage is temporary. Persistent storage is requested where supported, but browser eviction is still possible.
- Clearing site/app data or uninstalling removes your local library and progress. Keep original EPUB files elsewhere. The app cannot recover deleted data.

## Code structure

`src/repository.ts` implements transactional persistence; `src/publication.ts` validates and prepares sandboxed publication content; `src/engine.ts` wraps epub.js; `src/progress.ts` serializes debounced saves. React screens use these contracts instead of reaching into the database or renderer. `src/platform.ts` owns offline registration and Capacitor lifecycle integration.

Dependency overrides replace epub.js's outdated transitive XML parser and the Capacitor CLI's outdated transitive UUID package. Keep those overrides under review when updating dependencies; run the full rendering suite and `npm audit` after upgrades. Publication XML is parsed with the browser's DOMParser and entity declarations are rejected.
