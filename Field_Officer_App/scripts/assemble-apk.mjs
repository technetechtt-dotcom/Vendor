import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const release = process.argv.includes('--release');
const studioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome = fs.existsSync(path.join(studioJbr, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
  ? studioJbr
  : process.env.JAVA_HOME;
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const androidDir = path.resolve('android');
const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!fs.existsSync(gradlew)) {
  console.error('Android project is missing. Run npx cap add android first.');
  process.exit(1);
}

const keystoreProps = path.join(androidDir, 'keystore.properties');
const hasKey = Boolean(process.env.LED_KEYSTORE) || fs.existsSync(keystoreProps);
if (release && !hasKey) {
  console.error('A release build needs the municipality\'s signing key.');
  console.error('Create android/keystore.properties (see android/keystore.properties.example),');
  console.error('or set LED_KEYSTORE, LED_KEYSTORE_PASSWORD, LED_KEY_ALIAS and LED_KEY_PASSWORD.');
  console.error('Run without --release to build a debug package for testing only.');
  process.exit(1);
}

const task = release ? 'assembleRelease' : 'assembleDebug';
const env = {...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome};
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [task, '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', release ? 'release' : 'debug', release ? 'app-release.apk' : 'app-debug.apk');
if (!fs.existsSync(built)) {
  console.error('Expected package not found at', built);
  process.exit(1);
}
const flavour = release ? 'release' : 'debug';
const dest = path.resolve(release ? 'LED-Field-Visits-release.apk' : 'LED-Field-Visits.apk');
fs.copyFileSync(built, dest);
console.log(`APK written to ${dest} (${flavour}${release ? ', signed with the municipal key' : ', debug-signed for testing only'})`);

// The register serves releases/LED-Field-Visits-<version>.apk. A release build
// publishes that exact name; a debug build must not silently overwrite it.
const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const version = String(packageJson.version || '0.0.0');
const released = path.resolve('releases', `LED-Field-Visits-${version}${release ? '' : '-debug'}.apk`);
fs.mkdirSync(path.dirname(released), {recursive: true});
fs.copyFileSync(built, released);
console.log('Versioned package written to', released);
if (!release) {
  console.log('NOTE: this package is debug-signed and is published under a -debug name.');
  console.log('The download link serves the release build. Run npm run apk:release to replace it.');
}
