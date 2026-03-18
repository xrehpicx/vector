#!/usr/bin/env node

import { execFileSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const sourceFile = join(packageDir, 'macos', 'VectorMenuBar.swift');
const repoRoot = resolve(packageDir, '..', '..');
const menuBarIcon1x = join(
  repoRoot,
  'cli',
  'macos',
  'assets',
  'vector-menubar.png',
);
const menuBarIcon2x = join(
  repoRoot,
  'cli',
  'macos',
  'assets',
  'vector-menubar@2x.png',
);
const nativeDir = join(packageDir, 'native');
const appDir = join(nativeDir, 'VectorMenuBar.app');
const contentsDir = join(appDir, 'Contents');
const macOSDir = join(contentsDir, 'MacOS');
const resourcesDir = join(contentsDir, 'Resources');
const executablePath = join(macOSDir, 'VectorMenuBar');
const packageJsonPath = join(packageDir, 'package.json');

if (process.platform !== 'darwin') {
  process.exit(0);
}

if (!existsSync(sourceFile)) {
  throw new Error(`Missing Swift source: ${sourceFile}`);
}

if (!existsSync(menuBarIcon1x) || !existsSync(menuBarIcon2x)) {
  throw new Error('Missing Vector menu bar icon assets.');
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(macOSDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const buildDir = join(nativeDir, '.build');
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const arm64Binary = join(buildDir, 'VectorMenuBar-arm64');
const x64Binary = join(buildDir, 'VectorMenuBar-x64');

buildTarget('arm64-apple-macos14.0', arm64Binary);
buildTarget('x86_64-apple-macos14.0', x64Binary);

execFileSync(
  'lipo',
  ['-create', '-output', executablePath, arm64Binary, x64Binary],
  {
    stdio: 'inherit',
  },
);
execFileSync('chmod', ['+x', executablePath], { stdio: 'inherit' });
rmSync(buildDir, { recursive: true, force: true });
copyFileSync(menuBarIcon1x, join(resourcesDir, 'vector-menubar.png'));
copyFileSync(menuBarIcon2x, join(resourcesDir, 'vector-menubar@2x.png'));

writeFileSync(
  join(contentsDir, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>VectorMenuBar</string>
  <key>CFBundleIdentifier</key>
  <string>com.vector.menubar</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>VectorMenuBar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${pkg.version}</string>
  <key>CFBundleVersion</key>
  <string>${pkg.version}</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`,
);

function buildTarget(target, outputPath) {
  execFileSync(
    'swiftc',
    ['-O', '-target', target, sourceFile, '-o', outputPath],
    { stdio: 'inherit' },
  );
}
