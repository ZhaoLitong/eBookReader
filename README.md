# eBook Reader

[English](#english) | [简体中文](#简体中文)

## English

An offline bookshelf and paged eBook reader built with TypeScript, React, epub.js, Dexie, and Capacitor. Import plain-text TXT files, text from legacy PRC/MOBI books, or reflowable, DRM-free EPUB 2/3 files, adjust text size and theme, navigate chapters, and resume at your last saved passage.

The interface supports English and Simplified Chinese (简体中文). Choose **Language / 语言** on the shelf or in **Reading settings / 阅读设置**. The choice is saved on the device and takes effect immediately, including notices and accessibility labels. Without a saved choice, Chinese device/browser locales use Simplified Chinese; other locales use English. Existing theme and font-size preferences are retained. Changing the interface language preserves the reading position and does not translate book text, titles, authors, or the publication's contents entries.

The behavior contract is [docs/spec.md](docs/spec.md). Verification results and remaining device checks are recorded in [docs/verification.md](docs/verification.md).

### Browser development

Use **Node.js 24 LTS** (at least 22.12) and npm. Node 26.4.0/npm 11.17.0 were used in this workspace; Node 24 is the recommended development baseline. No Android tooling is needed for browser development.

```powershell
npm ci
npm run dev
```

Open the local address printed by Vite, normally `http://127.0.0.1:5173`. Click **Import book** and select a book. A development server is not the offline deliverable.

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

The production site in `dist/` must be served over HTTPS or localhost at the origin root. Hash routes need no server-side rewrite rules. After its first successful online visit, a service worker caches the application shell for offline use. Deploy the generated `sw.js` with revalidation/no-cache headers; serve hashed assets with long-lived immutable caching. New builds activate when old application tabs are closed. Capacitor bundles assets locally and does not register the browser service worker.

### Browser integration tests

Tests use an installed Google Chrome by default; no emulator or separate Chromium download is required.

```powershell
npm run build
npm run test:e2e
```

Playwright starts a local production preview server. Tests use isolated browser profiles and synthetic, original EPUB fixtures authored for this project, released under CC0. Fixture code lives in `tests/fixtures.ts`; it includes EPUB 2/3, nested contents, Unicode metadata, missing metadata, and hostile content variants. No copyrighted book downloads are needed. Failure traces and screenshots go to ignored `test-results/`.

### Android on Windows

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

### Storage and supported books

- Books, covers, reading positions, and settings live in IndexedDB. Original EPUB blobs are separate from shelf metadata. There is no backend, sync, account, analytics, or export/backup.
- TXT files support UTF-8 (with or without a BOM) and UTF-16 with a BOM. The filename becomes the title; line breaks and indentation are preserved. Text is stored as a generated EPUB, with numbered parts for longer files, so pagination, themes, and saved progress work as usual. Empty, binary, and unsupported-encoding text files produce an error.
- PRC/MOBI support imports **text only** from unencrypted legacy Mobipocket (through version 7) and PalmDOC books, with uncompressed or PalmDOC-compressed text. UTF-8 and Windows-1252 Mobipocket text are supported; PalmDOC uses Windows-1252. The embedded Mobipocket title is used when present. Images, original formatting, links, author metadata, and original contents are not preserved. The converted text uses the normal paginated reader and saved positions. HUFF/CDIC compression, KF8, encryption, and non-book Palm applications are unsupported; convert those formats to EPUB where possible. Decoded PRC text is limited to 64 MiB. A PRC file alone is sufficient; companion OPF and cover files are not imported. Compatibility has been tested with synthetic fixtures; real-book and Android checks remain necessary.
- Reading positions use EPUB CFIs rather than rendered page numbers. Position changes are saved after a 300 ms debounce and flushed when leaving/backgrounding. Abrupt termination can lose the last uncommitted change.
- Books are identified by SHA-256 of their original bytes. Importing identical bytes under another filename reopens the existing entry. Different file bytes, including ZIP metadata, count as a different book.
- Input limit: 100 MiB; expanded archive limit: 250 MiB; entry limit: 10,000. Reading performance still depends on book complexity and device memory.
- Fixed-layout, DRM-protected, interactive/scripted EPUBs, and PDFs are unsupported. Font obfuscation does not reject a book; unsupported fonts can fall back. Remote book resources and external links are blocked. Embedded images and ordinary HTML/CSS are supported, subject to renderer compatibility.
- Browser storage is specific to an origin, including port. `localhost`, `127.0.0.1`, development, and preview can have separate shelves. Incognito storage is temporary. Persistent storage is requested where supported, but browser eviction is still possible.
- Clearing site/app data or uninstalling removes your local library and progress. Keep original EPUB files elsewhere. The app cannot recover deleted data.

### Code structure

`src/repository.ts` implements transactional persistence; `src/publication.ts` validates and prepares sandboxed publication content; `src/engine.ts` wraps epub.js; `src/progress.ts` serializes debounced saves. React screens use these contracts instead of reaching into the database or renderer. `src/platform.ts` owns offline registration and Capacitor lifecycle integration.

Dependency overrides replace epub.js's outdated transitive XML parser and the Capacitor CLI's outdated transitive UUID package. Keep those overrides under review when updating dependencies; run the full rendering suite and `npm audit` after upgrades. Publication XML is parsed with the browser's DOMParser and entity declarations are rejected.

---

## 简体中文

一款离线书架与分页电子书阅读器，基于 TypeScript、React、epub.js、Dexie 和 Capacitor 构建。支持导入纯文本 TXT、旧版 PRC/MOBI 书籍的文本，以及可重排、无 DRM 保护的 EPUB 2/3 文件。你可以调整字号和主题、跳转章节，并从上次保存的位置继续阅读。

界面支持英文和简体中文。在书架或 **Reading settings / 阅读设置** 中选择 **Language / 语言**，即可立即切换，包括提示消息和无障碍标签。语言选择保存在本机。尚未保存选择时，中文设备或浏览器默认使用简体中文，其他语言环境默认使用英文。切换语言会保留主题、字号和阅读位置，不会翻译书籍正文、书名、作者或书籍目录。

功能与行为规范见 [docs/spec.md](docs/spec.md)。验证结果及尚待完成的设备检查见 [docs/verification.md](docs/verification.md)。这两份文档目前为英文。

### 浏览器开发

使用 **Node.js 24 LTS**（最低 22.12）和 npm。本工作区曾使用 Node 26.4.0 / npm 11.17.0；推荐以 Node 24 作为开发基线。浏览器开发不需要 Android 工具链。

```powershell
npm ci
npm run dev
```

打开 Vite 输出的本地地址，通常为 `http://127.0.0.1:5173`。点击导入书籍按钮并选择文件。开发服务器不是用于离线使用的最终交付版本。

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` 中的生产站点必须通过 HTTPS 或 localhost 部署在站点根路径。哈希路由不需要服务器重写规则。首次成功联网访问后，Service Worker 会缓存应用外壳，以供离线使用。部署生成的 `sw.js` 时，应设置重新验证或禁止缓存的响应头；带哈希的静态资源可设置长期不可变缓存。旧版应用标签页关闭后，新版本才会激活。Capacitor 将资源打包到本机，不会注册浏览器 Service Worker。

### 浏览器集成测试

测试默认使用已安装的 Google Chrome，无需模拟器，也不需要单独下载 Chromium。

```powershell
npm run build
npm run test:e2e
```

Playwright 会启动本地生产预览服务器。测试使用隔离的浏览器配置，以及本项目原创、以 CC0 发布的合成 EPUB 测试文件。生成代码位于 `tests/fixtures.ts`，覆盖 EPUB 2/3、嵌套目录、Unicode 元数据、缺失元数据和恶意内容等情况，无需下载受版权保护的书籍。失败时的跟踪记录和截图保存在已被 Git 忽略的 `test-results/` 中。

### 在 Windows 上开发 Android 版本

仓库已包含生成的 `android/` 项目。日常开发可以在编辑器和浏览器中完成。移动端测试建议使用 Android 真机，而非模拟器。

固定的框架版本：

| 组件 | 版本 |
| --- | --- |
| React / React DOM | 19.3.1 |
| TypeScript | 7.0.2 |
| Vite | 8.3.4 |
| epub.js | 0.3.93 |
| Dexie | 4.4.6 |
| Capacitor core / Android / CLI | 8.5.3 |
| Capacitor App 插件 | 8.1.2 |
| Android Gradle 插件 | 8.13.0 |
| Gradle wrapper | 8.14.3 |
| Android SDK 编译 / 目标版本 | 36 |
| 最低 Android API | 24（Android 7.0）；请使用较新的 Android System WebView |
| Android 构建所需 Java | JDK 21 |

1. 安装 JDK 21 和 Android SDK 命令行工具，也可以通过 Android Studio 安装。将 `JAVA_HOME` 指向 JDK 21，并将其 `bin` 目录加入 `PATH`。
2. 将 `ANDROID_HOME` 设置为 SDK 目录。安装 `platforms;android-36`、`build-tools;36.0.0` 和 `platform-tools`，并接受 SDK 许可。也可以在已被 Git 忽略的 `android/local.properties` 中设置 `sdk.dir`。
3. 构建 Web 应用并同步原生资源及插件：

   ```powershell
   npm run android:sync
   ```

4. 无需打开 IDE，即可构建调试 APK：

   ```powershell
   npm run android:build
   ```

   构建脚本会在调用 Gradle 前检查 Java 和 SDK 配置。首次构建需要联网下载 Gradle/Maven 依赖。输出文件为 `android/app/build/outputs/apk/debug/app-debug.apk`。Gradle 最多使用两个工作进程，堆内存限制为 1.5 GiB；脚本不使用常驻守护进程。

5. 在手机上开启开发者选项和 USB 调试，连接电脑并授权，然后安装：

   ```powershell
   adb devices
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

   如果找不到 `adb`，请将 SDK 的 `platform-tools` 目录加入 `PATH`。Chrome 的 `chrome://inspect/#devices` 可以检查运行中的调试版 WebView。请在真机上执行验证文档中的 Android 检查步骤。

导入时，文件选择器会将文件复制到应用本地存储，不会请求广泛的存储权限。应用 ID 为 `com.epubreader.app`；上架前请确定永久应用标识和正式签名配置。调试 APK 仅用于开发。为明确仅在本机存储数据的策略，已禁用 Android 自动应用备份。

### 存储与支持的书籍

- 书籍、封面、阅读位置和设置保存在 IndexedDB 中。原始 EPUB 二进制数据与书架元数据分开保存。应用没有后端、同步、账户、分析统计或导出/备份功能。
- TXT 支持 UTF-8（有无 BOM 均可）和带 BOM 的 UTF-16。文件名作为书名，保留换行和缩进。文本会转换为 EPUB 存储，较长文件会拆分为带编号的部分，因此可以正常使用分页、主题和阅读进度保存功能。空文件、二进制文件和使用不支持编码的文本文件会显示错误。
- PRC/MOBI 支持从未加密的旧版 Mobipocket（最高版本 7）和 PalmDOC 书籍中**仅导入文本**，支持未压缩文本和 PalmDOC 压缩文本。Mobipocket 支持 UTF-8 和 Windows-1252；PalmDOC 使用 Windows-1252。若文件含有内嵌 Mobipocket 书名，将使用该书名。不保留图片、原始排版、链接、作者元数据和原始目录。转换后的文本使用常规分页阅读与位置保存功能。不支持 HUFF/CDIC 压缩、KF8、加密内容和非书籍类 Palm 应用；如可行，请先将这些格式转换为 EPUB。解码后的 PRC 文本上限为 64 MiB。只需导入 PRC 文件本身，不会导入配套 OPF 或封面文件。已使用合成测试文件验证兼容性，仍需进行真实书籍和 Android 检查。
- 阅读位置使用 EPUB CFI，而非渲染后的页码。位置变化经过 300 毫秒防抖后保存，离开阅读器或应用进入后台时会立即提交待保存内容。突然终止应用可能丢失最后一次尚未提交的位置变化。
- 书籍通过原始文件字节的 SHA-256 识别。即使文件名不同，导入内容完全相同的文件仍会打开已有条目。任何字节差异（包括 ZIP 元数据）都会被视为另一本书。
- 输入文件上限为 100 MiB，解压后总大小上限为 250 MiB，归档条目数上限为 10,000。实际阅读性能仍取决于书籍复杂度和设备内存。
- 不支持固定版式、DRM 保护、交互式或包含脚本的 EPUB，也不支持 PDF。字体混淆不会导致整本书被拒绝；不支持的字体可以使用替代字体。远程书籍资源和外部链接会被阻止。支持内嵌图片和普通 HTML/CSS，具体效果受渲染器兼容性限制。
- 浏览器存储按来源隔离，包括端口。因此 `localhost`、`127.0.0.1`、开发服务器和预览服务器可能各有独立书架。无痕模式中的存储是临时的。应用会在支持时申请持久化存储，但浏览器仍可能清理数据。
- 清除网站或应用数据、卸载应用都会删除本地书库和阅读进度。请在其他位置保留 EPUB 原始文件。应用无法恢复已删除的数据。

### 代码结构

`src/repository.ts` 实现事务式持久化；`src/publication.ts` 验证并准备沙盒中的书籍内容；`src/engine.ts` 封装 epub.js；`src/progress.ts` 按顺序处理经过防抖的保存操作。React 页面通过这些接口工作，不直接操作数据库或渲染器。`src/platform.ts` 负责离线注册和 Capacitor 生命周期集成。

依赖覆盖配置替换了 epub.js 过时的间接 XML 解析器依赖，以及 Capacitor CLI 过时的间接 UUID 依赖。升级依赖时应重新检查这些覆盖配置，并运行完整渲染测试和 `npm audit`。书籍 XML 使用浏览器的 DOMParser 解析，包含实体声明的内容会被拒绝。
