import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
const version = /version "(\d+)/.exec(java.stderr ?? '')?.[1];
if (!version || Number(version) < 21) {
  console.error('Android builds require JDK 21. Install it and configure JAVA_HOME and PATH. See README.md.');
  process.exit(1);
}
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk && !existsSync(new URL('../android/local.properties', import.meta.url))) {
  console.error('Android SDK not configured. Set ANDROID_HOME or android/local.properties. See README.md.');
  process.exit(1);
}
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug', '--no-daemon', '--max-workers=2'], {
  cwd: fileURLToPath(new URL('../android', import.meta.url)), stdio: 'inherit', shell: process.platform === 'win32',
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
