import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

const env = {...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome};
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const dest = path.resolve('LED-Field-Visits.apk');
fs.copyFileSync(built, dest);
console.log('APK written to', dest);
