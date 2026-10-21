# Verification record

Implementation baseline: [spec.md](spec.md), version 1.0.

## Automated checks

MOBI empty-record follow-up (2026-10-21): the supplied Black Coffee MOBI uses supported, unencrypted MOBI 6/PalmDOC compression, but contains an empty auxiliary record. The importer now accepts equal record offsets and empty records at EOF while rejecting backwards/out-of-range offsets and missing declared text. All 33 unit tests passed. A local Chrome check confirmed that the supplied book imports, navigates, and resumes after reload; the existing PRC browser test also passed. Production build and Android sync passed. The supplied book and temporary book-specific test are not included in the repository; physical-phone verification remains pending.

EPUB chapter recovery follow-up (2026-10-21): a locally supplied EPUB failed XML parsing because a chapter opened a `divlity` element and closed a `div`. Chapter HTML now falls back to inert HTML parsing and then goes through the existing sanitizer; package XML and entity declarations remain strict. The supplied EPUB opened and its repaired chapter rendered in a local Chrome check. Its contents label differed from the chapter heading, so the corrected check verified the repaired element directly. No supplied book content or book-specific test is included in the repository. All 30 unit tests passed; eight of nine browser tests passed, including the new malformed-chapter/script/network regression. The existing rapid reader-exit test timed out again. Production build and Android sync passed; physical-phone verification remains pending.

PRC support follow-up (2026-10-21): all 28 unit tests and eight browser tests passed. Synthetic fixtures cover legacy Mobipocket and PalmDOC, PalmDOC decompression, UTF-8/Windows-1252, record trailers, malformed offsets/back references, unsupported formats, encrypted-file rejection, repository deduplication, and browser import/pagination/resume. Production build and Android asset sync passed. PRC support imports text only; real PRC books and physical Android document-provider behavior remain unverified. On a phone, import a DRM-free legacy PRC, compare text with its source, navigate pages, then restart and confirm the saved passage. Use the PRC itself; companion OPF and JPG files are unnecessary.

TXT support follow-up (2026-10-21): 19 unit tests and six of seven browser tests passed, including TXT import, pagination, literal markup, saved-position restoration, UTF-8/UTF-16 decoding, and invalid-text rejection. The existing rapid reader-exit browser test timed out in the full run and passed on a focused rerun; intermittent timing remains a limitation. Production build and Android asset sync passed. Windows blocked preview port 4173, so browser checks used `PLAYWRIGHT_PORT=15473`. Physical Android TXT import remains unverified: select a `.txt` file from Downloads, read forward, close/reopen, and confirm the saved passage; also cancel the picker and try an empty file.

Verified on 2026-10-21. Browser tests use local Google Chrome against a production preview build. They do not establish Android device compatibility.

- `npm test`: 13 tests passed across three test files.
- `npm run build`: strict TypeScript checking and production build passed. Vite reports the reader bundle is approximately 823 kB (253 kB gzip), above its advisory 500 kB chunk threshold.
- `npm run test:e2e`: all six browser tests passed, including offline reopening, internal links, keyboard navigation, synthetic swipe thresholds, invalid-CFI recovery, and repeated reader exit. The resize/resume test was then rerun with an explicit wait for debounced layout completion and passed.
- Visual review: desktop light-theme empty shelf and 390px dark-theme reader screenshots inspected; controls and settled publication text fit. This is not a full accessibility audit.
- `npx cap sync android`: passed with the final production assets and Capacitor App plugin.
- `node scripts/android-build.mjs`: stopped at the expected JDK 21 prerequisite check. No APK was compiled or installed; Android document-provider, Back-button, lifecycle, and airplane-mode checks remain pending.

The mapping below identifies coverage, not proof that every variation of a requirement has been exercised. Remaining manual checks follow it. Browser offline automation closes and reopens a tab in the same browser context; a full browser-process restart remains a manual check.

| Requirement | Verification |
| --- | --- |
| LIB-01 | Browser test: fresh shelf and empty state |
| LIB-02 | Repository persistence/bytes/cover test and browser import/read/reload flow |
| LIB-03 | Repository duplicate hash test and browser repeated-import flow |
| LIB-04 | Browser cancel-removal flow; picker cancellation also needs the manual check below |
| LIB-05 | Transactional deletion/rollback/late-write tests and browser confirmed removal |
| LIB-06 | Repository metadata fallback/Unicode tests; responsive bookshelf manual review |
| IMP-01 | Invalid/protected/fixed-layout and missing-spine-resource tests; invalid-file browser test |
| IMP-02 | Oversize-before-read and transaction failure/retry tests |
| IMP-03 | Missing-cover and recognized font-obfuscation tests |
| READ-01 | Browser page navigation tests; Android touch verification remains manual |
| READ-02 | Browser nested contents and internal-link target tests; no-contents EPUB 2 test |
| READ-03 | Browser mid-chapter CFI reload/restoration test |
| READ-04 | Browser font/theme and settled 390px resize preserve the marked passage; device rotation remains manual |
| READ-05 | Repository/location-cache and rendered estimated-progress checks; generation-failure check below |
| READ-06 | Progress writer failure/retry tests and browser invalid-CFI recovery |
| READ-07 | Progress writer concurrent flush test; rendered repeated open/close flow |
| SEC-01 | XML sanitization tests and browser script/network/sandbox assertions |
| OFF-01 | Browser offline close-tab/reopen flow with cached production assets and imported book |
| OFF-02 | Android device check required |
| AND-01 | Android device check required |
| AND-02 | Android device check required |
| UI-01 | Browser 320px overflow test; keyboard/contrast/touch review below |

## Manual acceptance procedures

Use a reflowable DRM-free EPUB with multiple chapters and images, including a larger book representative of actual use. The synthetic fixture suite supplements these checks and does not replace real-device testing.

1. **Import and source independence (AND-01, LIB-04):** On a phone, cancel the system picker and confirm the shelf is unchanged. Select a book from Downloads and another from a cloud document provider. Move/delete the originals, revoke provider access, and reopen both local copies. Check that no broad storage permission prompt appears.
2. **Position and lifecycle (OFF-02, AND-02):** Read into a chapter, wait at least one second, record an identifiable passage, background/resume, then force-stop/relaunch. The passage must be on the restored page. Repeat in airplane mode after a cold launch. Do not use exact page counts to judge restoration.
3. **Back and panels (AND-02):** Open Contents and press Android Back: only the panel closes. Press Back from the reader: the shelf opens with current progress. Back from the shelf follows normal platform behavior. Test the removal dialog separately.
4. **Gestures and navigation (READ-01):** Swipe horizontally more than 50 pixels, then make short and predominantly vertical drags. Only qualified swipes navigate. Text selection, link taps, and multi-touch must not turn pages. Test first/last page limits, rapid controls, keyboard arrows, a chapter boundary, and a right-to-left publication.
5. **Settings and accessibility (READ-04, UI-01):** Change font size at a marked passage and rotate the phone both ways; the passage remains visible. Confirm light/dark text contrast and unchanged image colors. Check the 80%/160% bounds, persisted settings, 320px layout, focus visibility, panel Escape/close focus restoration, and screen-reader control names.
6. **Error recovery (READ-05, READ-06):** In a disposable test profile, use DevTools IndexedDB inspection to replace a saved CFI with an invalid string. Reopen and verify the recovery notice and beginning-of-book fallback. Corrupt a location cache and verify regeneration. Simulate unavailable storage or a failed state write and verify the unsaved warning/retry without loss of the prior committed CFI. Rendering or percentage-generation failure must allow returning to the shelf and removing the book.
7. **Stress and cleanup (READ-07):** Open/close different books repeatedly, rapidly switch chapters, resize during reading, and leave while locations are generating. No old book may overwrite another's state; there must be no permanent spinner, detached-reader error, or steadily accumulating live publication frames.
8. **Real-book compatibility:** Try EPUB 2/3 publications, nested contents, embedded images/fonts, CJK and RTL text, missing metadata, and a large reflowable EPUB. Document specific incompatible publications rather than claiming universal EPUB conformance.

## Environment limits

This workspace has Node 26.4.0, npm 11.17.0, and JDK 17. The Android project requires JDK 21. No `adb` or configured Android SDK was found. APK compilation and physical-phone checks must be reported separately from successful Capacitor synchronization; no heavyweight SDK or emulator installation is required by this delivery.
