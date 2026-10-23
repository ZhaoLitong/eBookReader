# eBook Reader specification

Version: 1.0  
Status: implementation baseline  
Date: 2026-10-20

## 1. Purpose and scope

Build an offline eBook reader for Android with a browser development version. Use TypeScript, React, Vite, epub.js, and Capacitor so routine development can happen in a browser on a Windows machine with limited memory. A physical Android phone is the preferred mobile test target; an emulator is optional.

The first release must support:

- A persistent bookshelf with covers, metadata, and estimated reading progress.
- Importing and removing local books.
- Reading reflowable, DRM-free EPUB 2 and EPUB 3 publications one page at a time.
- Returning to the last saved passage after closing or restarting the app.
- A table of contents, font sizing, and light/dark themes.
- A working browser build and a configured Capacitor Android project.

PDF, fixed-layout EPUB, DRM authorization, accounts, cloud synchronization, backup/export, bookmarks, annotations, full-text search, text-to-speech, and an ebook store are outside this release. Scripted and interactive publication features are unsupported. Basic text, images, hyperlinks, and supported embedded fonts are in scope; full conformance with every EPUB feature is not promised.

This document is the behavior and acceptance reference for implementation. Changes that alter these requirements must update this document and the affected tests together.

## 2. Product defaults

| Decision | Requirement |
| --- | --- |
| Working application name | eBook Reader |
| Interface language | English; publication text and Unicode metadata are preserved |
| Network/backend | No backend, accounts, analytics, or remote book downloads |
| Reading layout | One paginated page, including on wide screens; no two-page spread or scrolling mode |
| Theme | Light by default; explicit light/dark selection |
| Font size | 100% by default; 80% through 160% in 10% increments |
| Font family | Preserve publication typography; no font-family picker |
| Import selection | One file per import |
| Maximum input size | 100 MiB; reject larger files before loading their bytes into the reader |
| Library order | Most recently opened first; break equal timestamps by title, then book ID |
| Persistence | Local IndexedDB database; separate library per browser origin or Android installation |
| Destructive action | Confirm book removal; there is no trash or undo after confirmation |

The size limit is an application limit, not a guarantee that every smaller book will render on every device. Unsupported or resource-intensive publications must fail with a usable error instead of leaving a permanent loading screen.

## 3. User experience

### 3.1 Bookshelf

The initial screen is the bookshelf. It includes the application name, an Import EPUB action, and a responsive grid of book cards. Each card displays the cover or a consistent placeholder, title, author when known, and estimated progress when available. The card opens the book; a separately accessible menu or button removes it.

- With no books, show a brief local-import explanation and an import action.
- While the database loads, show a loading state rather than an empty-library message.
- If storage cannot be opened, show an actionable error and retry control. Do not silently switch to temporary storage.
- Long titles and authors must not obscure actions. Full metadata must remain available through accessible text.
- Opening a book updates its last-opened time. Changing settings or merely visiting the shelf does not.
- Returning from the reader refreshes that book's progress and shelf ordering.

### 3.2 Import

Import uses the system file picker, accepting `.epub` files and the EPUB MIME type. Android must allow selection through document providers that expose readable files, including Downloads. The app copies bytes into its own database; reopening must not depend on continued permission to the source document.

1. Canceling the picker leaves the current screen and library unchanged.
2. Check the file size and validate the EPUB container/package. Do not trust the extension or MIME type alone.
3. Compute SHA-256 over the original bytes. Use this hash as the stable book ID.
4. If that ID already exists, open the existing book at its saved location without replacing metadata, resetting progress, or creating another entry.
5. For a new book, check supported layout and protection, parse metadata and reading order, and prepare its cover when available.
6. Store the original bytes and required metadata together in one successful transaction. A missing or unreadable cover may use a placeholder and does not invalidate an otherwise readable book.
7. Open the newly imported book at the beginning of its linear reading order. Update last-opened time only after the reader opens successfully.

Missing title falls back to the filename without its extension; missing author displays as unknown or is omitted consistently. Preserve the original filename separately. Only one import runs at a time, with a visible busy state and duplicate submissions disabled.

Reject invalid containers, unreadable packages, publications without readable content, unsupported fixed-layout or mixed fixed/reflowable layouts, and content requiring unsupported decryption. Recognized EPUB font obfuscation must not by itself be mistaken for DRM. Unsupported obfuscated fonts may fall back to available fonts while preserving readable text.

Import errors identify the relevant category: invalid EPUB, unsupported layout, protected content, file too large, source read failure, or storage failure. A failed import must leave no book, cover, or progress records behind. If storage succeeds but initial rendering fails, retain the book and offer Retry or Return to shelf so the user can retry or remove it.

### 3.3 Reading and navigation

The reader shows a header with Back to shelf, title, Contents, and Reading settings actions; the publication viewport; and previous/next controls with a progress indicator. Controls remain accessible without relying on hidden gestures.

- Next/previous moves one rendered page and crosses chapter boundaries as necessary.
- Tap or click the left edge of the publication viewport for Previous and the right edge for Next. Each edge covers 20% of the visible viewport, capped at 80 CSS pixels; the center does not turn pages. Taps must finish within 500 ms with no more than 10 CSS pixels of movement. Ignore text selection, links/controls, multi-touch, and open panels.
- Left/right arrow keys navigate while the publication viewport or reader navigation is focused, excluding editable controls and open panels.
- Horizontal swipes navigate after the drag ends. Require at least 50 CSS pixels of horizontal displacement and horizontal movement greater than vertical movement by a factor of 1.5. Do not navigate during text selection, a multi-touch gesture, or interaction with a link or control.
- Swipes and arrow keys follow the publication's declared page progression direction. For left-to-right books, swipe left advances; for right-to-left books, swipe right advances. Edge taps and labeled buttons use logical Previous (left) and Next (right).
- At the beginning or end, the corresponding control is disabled and further navigation is a no-op. There is no wraparound.
- Serialize navigation and layout operations so rapid inputs cannot start overlapping rendition changes.
- Show a loading state during initial opening. A rendering error provides Retry and Return to shelf.

The Contents panel displays the publication's nested navigation entries when provided. Selecting an entry navigates to its target, closes the panel, and saves the resulting location. Without a table of contents, explain that none is available; previous/next navigation must still work.

Internal publication links navigate within the current book and update the saved location. External links do not navigate the app or automatically open another application in v1; explain that external links are unavailable offline. Reject links to executable, file-system, or other unsupported schemes.

### 3.4 Appearance and layout changes

The app interface supports English (`en`) and Simplified Chinese (`zh-CN`). Provide a labeled language selector on the shelf and in Reading settings. Persist the explicit choice with global settings; for new or legacy settings without a valid choice, use Simplified Chinese for a Chinese device/browser locale and English otherwise. Translate app controls, dialogs, notices, errors, and accessible labels, and update the document language. Translate existing notices at render time so they follow language changes. Keep publication text and metadata unchanged. Changing only the interface language must not reload the book or change the current passage.

Reading settings apply immediately and persist globally across app restarts and books. Disable font-size decrease/increase at the specified bounds. Themes apply to both app chrome and publication text/background while retaining readable contrast; do not invert publication images.

Before font-size, orientation, viewport-size, or theme changes, retain the current content location. After the new layout settles, restore that location. The exact line may move, but the same passage must remain on the visible page. Ignore intermediate relayout events when deciding which position to save.

The UI must support a 320 CSS-pixel-wide viewport without horizontal overflow in app controls. Respect safe-area insets. Primary controls need accessible labels, visible keyboard focus, and touch targets at least 44 by 44 CSS pixels. Panels close with their close button or Escape and return focus to the opening control.

### 3.5 Removal and Android Back

Removing a book asks for confirmation including its title. Cancel leaves all data intact. Confirm deletes the EPUB, metadata, cover, progress, and location cache atomically. A failure preserves the existing entry and shows a retryable error.

On Android, Back closes an open panel or dialog first, returns from the reader to the shelf second, and uses the normal platform back behavior from the shelf. Returning to the shelf flushes pending reading progress before the reader is destroyed. Browser Back from the reader also returns to the shelf.

## 4. Reading position and progress

### 4.1 Position is authoritative

Use an EPUB CFI emitted by the renderer at the beginning of the visible page as the saved location. Do not use a rendered page number or percentage as the authoritative position: pagination changes with font, screen, and orientation.

- On first open, start at the first readable item in the linear reading order.
- On subsequent opens, restore the saved CFI after the rendition is ready and settings have been applied.
- Record location changes with a 300 ms debounce. Persist a location within one second of the final settled navigation event under normal operating conditions.
- Flush pending writes on controlled reader exit, document visibility becoming hidden, and the Capacitor app becoming inactive.
- Never rely solely on an unload handler. Unexpected termination can lose the most recent uncommitted location; the previous committed location must remain valid.
- If a save fails, keep the latest location in memory, indicate that progress has not been saved, and retry on the next location change or lifecycle flush. Do not silently claim success.
- If a saved CFI cannot be resolved, open the beginning of the book, explain the recovery, and replace the invalid location only after successful rendering.

### 4.2 Estimated progress is secondary

Generate epub.js content locations asynchronously and cache them per book. Opening and CFI restoration must not wait for generation. Use the same generation interval, 1,024 characters, for all books. Store a cache version so a changed generation algorithm can discard and rebuild cached locations without discarding the saved CFI.

Calculate a clamped 0–100% estimate from the current CFI once locations are available. Display a rounded whole number and label it as estimated progress. Before an estimate exists, show a neutral unavailable state rather than a false 0%. Recalculate from the saved CFI when reopening a book. Failure to generate percentages must not prevent reading or position restoration.

## 5. Technical design and persistence

### 5.1 Modules and contracts

Use React with TypeScript strict mode, Vite for development/builds, epub.js for publication rendering, Dexie for IndexedDB, and Capacitor for the Android shell. Use hash-based routes for the shelf and `/read/:bookId`; keep reading progress in storage rather than the URL. An unknown or deleted book route returns to the shelf with an explanation.

Keep these responsibilities independently testable:

| Contract | Required responsibilities |
| --- | --- |
| `LibraryRepository` | Import/store a book, list summaries, retrieve book bytes, update reading state, remove a book, and persist settings |
| `ReaderEngine` | Open/destroy a publication, navigate next/previous or to a CFI/href, expose contents, apply appearance settings, and emit settled locations/errors |
| Platform integration | File selection, app lifecycle notifications, Android Back handling, and browser offline registration |

UI components must not write directly to IndexedDB or manipulate epub.js internals. The engine owns its rendition, document listeners, location-generation work, and object URLs. Destroy/cancel these on book change or reader exit. Late asynchronous results from an old book must not affect the active book.

### 5.2 Stored data

Start with database schema version 1 and explicit versioned migrations for subsequent changes. Keep lightweight shelf data separate from original file blobs so listing books does not load every EPUB into memory.

| Record | Required contents |
| --- | --- |
| Book metadata | SHA-256 ID, original filename, title, author, import timestamp, nullable last-opened timestamp, file size, nullable cover reference |
| Book assets | Book ID, original EPUB blob, optional cover blob |
| Reading state | Book ID, nullable CFI, nullable estimated fraction in `[0, 1]`, update timestamp |
| Location cache | Book ID, cache format/version, generated epub.js locations |
| Global settings | Theme (`light` or `dark`), font scale within the supported range, interface language (`en` or `zh-CN`) |

Use UTC epoch milliseconds for timestamps. Treat cached location data and progress percentages as rebuildable; preserve original book bytes and saved CFIs during cache changes. Normalize missing or invalid settings to the product defaults without clearing the library.

Save original EPUB bytes and initial metadata atomically. Delete all records belonging to a book atomically. Do not load all books' blobs during startup or re-render a publication merely to display its shelf card.

### 5.3 Offline behavior and security

- Android bundles the app shell and dependencies locally. Imported books must open with airplane mode enabled after a cold launch.
- The production browser build uses a service worker to cache versioned app-shell assets after an initial successful online visit. Imported books remain in IndexedDB. Disable service-worker registration inside Capacitor and during ordinary Vite development.
- Browser offline support assumes a secure context and a successful first cache installation. Vite's development server is not the offline deliverable.
- Serve production builds with an application CSP. Keep publication content sandboxed; do not enable book-provided JavaScript or give publication frames access to the Capacitor bridge or application storage.
- Permit bundled publication resources needed for reading, including controlled blob/data resources, while blocking remote publication resource requests. Check enforcement using a fixture with remote images, styles, and scripts; disabling scripts alone is insufficient.
- Publication HTML and metadata must not become unsanitized application chrome. Disable XML external-entity resolution and reject publication paths that escape the archive's resource namespace.
- Package runtime dependencies locally. No CDN, telemetry, remote fonts, or backend calls are required for ordinary use.
- Ask for persistent browser storage when supported, without making its availability a prerequisite. Explain in documentation that browser eviction, clearing site/app data, or uninstalling removes local books and progress. No backup or recovery service exists in v1.

### 5.4 Android and development delivery

Commit the generated Android project and the dependency lockfile. Use compatible stable package versions and document the actual pinned versions and supported Node LTS, JDK, and Android SDK combination. Do not require the currently installed machine tools to be compatible by assumption.

Provide commands for dependency installation, development, type checking, automated tests, production build, Capacitor synchronization, and Android debug APK build. A developer must be able to do routine UI work without launching Android Studio or an emulator.

Android file selection must be verified through the Capacitor WebView's system picker; a desktop file-input test does not establish Android compatibility. Do not request broad external-storage permission when document selection suffices. Importing from a provider stores a local copy and must remain usable after the source is moved or provider access ends.

## 6. Acceptance and verification

Each acceptance ID must map to an automated test or a documented manual check. Use unit/integration tests for repository and lifecycle behavior, and browser end-to-end tests for real epub.js rendering. Use small, redistributable test EPUBs with recorded provenance, including a multi-chapter fixture with a nested table of contents and identifiable passages.

| ID | Scenario and required result |
| --- | --- |
| LIB-01 | Fresh launch shows the empty shelf and import action. Reloading does not invent entries. |
| LIB-02 | Import a valid book; its metadata and cover or placeholder appear, and it opens at the beginning. Reloading retains the book. |
| LIB-03 | Import identical bytes under another filename; one entry remains and opens at its existing saved location. |
| LIB-04 | Cancel file selection or removal; the library and progress are unchanged. |
| LIB-05 | Confirm removal; all related records are gone and reopening its old route returns safely to the shelf. |
| LIB-06 | Missing cover/title/author and long Unicode metadata render usable cards with the specified fallbacks. |
| IMP-01 | Reject a non-EPUB, malformed package, protected content, and fixed-layout publication with category-appropriate errors and no partial entry. |
| IMP-02 | Reject a file exceeding 100 MiB before parsing. Simulated storage/read failures leave no partial records and allow a later retry. |
| IMP-03 | A missing cover or unsupported font obfuscation does not reject otherwise readable text. |
| READ-01 | Buttons, edge taps, keyboard, and qualified swipes move one page, including across chapters; beginning/end do not wrap. Rapid inputs do not corrupt rendition state. |
| READ-02 | Contents entries, nested targets, and internal links reach the expected passage and update saved position. A book without contents remains navigable. |
| READ-03 | Save a passage mid-chapter, leave/reload, and reopen. The same passage appears on the restored page without waiting for location generation. |
| READ-04 | Change font size, rotate/resize, and change theme at a marked passage. That passage remains on the visible page; settings survive reload. |
| READ-05 | Location generation supplies an estimated percentage; its failure leaves reading and CFI resume functional. |
| READ-06 | An invalid saved CFI recovers to the beginning with an explanation. An injected save failure exposes unsaved state and retries without erasing the prior position. |
| READ-07 | Switching books and returning to the shelf releases the old rendition; late work cannot overwrite another book's progress. |
| SEC-01 | An EPUB containing script, remote assets, and hostile links cannot execute script, make remote publication requests, reach the native bridge, or replace the app UI. |
| OFF-01 | A cached production browser build opens an imported book after the browser is restarted without network access. |
| OFF-02 | An Android cold launch in airplane mode opens an imported book and restores its committed position. |
| AND-01 | Import using the phone's document picker, then move/delete the source. The copied book still opens. Canceling the picker changes nothing. |
| AND-02 | Android Back closes a panel, then returns to the shelf. Background/resume and process restart retain the last committed position and settings. |
| UI-01 | At 320 CSS pixels, controls fit; keyboard focus and accessible names work; light/dark text remains legible and image colors are preserved. |

End-to-end resume assertions must check identifiable content or equivalent CFIs, not an exact rendered page number or a screenshot alone. Repository failure tests must include transactional rollback. Security checks must inspect attempted network requests and script effects, not merely the final appearance.

## 7. Completion and reporting

Implementation is complete when the specified behavior is present, type checking and automated tests pass, a production web build succeeds, and Capacitor synchronization produces a configured Android project. Supply a README with setup/build commands, supported-format limits, storage-loss implications, and Android verification instructions.

Record verification results against the acceptance IDs. Separate passed automated checks, passed manual checks, and checks that could not run. In particular, a successful web build or Capacitor synchronization must never be reported as proof that the APK builds or that device behavior passes. If Android SDK/JDK or a connected device is unavailable, identify the remaining checks explicitly and leave reproducible instructions.

An installable APK and completed phone validation are desirable verification outcomes, but are not prerequisites for the agreed first delivery of a web app plus Android project. Do not install heavyweight tooling or require an emulator simply to satisfy that delivery.
