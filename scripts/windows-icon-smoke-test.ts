import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const windows = packageJson.build?.win;
const nsis = packageJson.build?.nsis;
const resources = packageJson.build?.extraResources || [];
const electronMain = readFileSync('electron/main.ts', 'utf8');
const preload = readFileSync('electron/preload.ts', 'utf8');
const themeStore = readFileSync('src/stores/themeStore.ts', 'utf8');

assert.equal(windows?.icon, 'build/icon.ico');
assert.notEqual(windows?.signAndEditExecutable, false, 'Windows executable resource editing must remain enabled.');
assert.equal(nsis?.installerIcon, 'build/icon.ico');
assert.equal(nsis?.uninstallerIcon, 'build/icon.ico');
assert.equal(nsis?.installerHeaderIcon, 'build/icon.ico');
assert.equal(resources.some((item: { from?: string; to?: string }) => item.from === 'build/icon.ico' && item.to === 'icon.ico'), true);

const ico = readFileSync('build/icon.ico');
assert.equal(ico.readUInt16LE(0), 0, 'Invalid ICO reserved header.');
assert.equal(ico.readUInt16LE(2), 1, 'Invalid ICO image type.');
const count = ico.readUInt16LE(4);
assert.equal(count >= 6, true, `Windows ICO must contain multiple resolutions; found ${count}.`);

const sizes = new Set<number>();
for (let index = 0; index < count; index += 1) {
  const width = ico[6 + index * 16] || 256;
  const height = ico[7 + index * 16] || 256;
  assert.equal(width, height, 'Windows icon entries must be square.');
  sizes.add(width);
}
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  assert.equal(sizes.has(size), true, `Windows ICO is missing ${size}x${size}.`);
}

assert.match(electronMain, /nativeTheme\.themeSource = theme/);
assert.match(electronMain, /applyNativeTheme\(store\.get\('theme'\), false\)/);
assert.match(electronMain, /ipcMain\.handle\('theme:set'/);
assert.match(electronMain, /backgroundColor: nativeWindowBackground\(\)/);
assert.match(preload, /themeSet: \(theme: 'dark' \| 'light' \| 'system'\) => ipcRenderer\.invoke\('theme:set', theme\)/);
assert.match(themeStore, /window\.electronAPI\.themeSet\(theme\)/);

console.log(`Windows application icon and native theme smoke test passed (${[...sizes].sort((a, b) => a - b).join(', ')} px).`);
