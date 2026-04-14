import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

const firefoxManifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));

function rmSafe(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function replaceVersionInHtml(dir, version) {
  for (const file of walk(dir)) {
    if (file.endsWith('.html')) {
      const text = fs.readFileSync(file, 'utf8').replaceAll('__IMMERSIVE_TRANSLATE_VERSION__', version);
      fs.writeFileSync(file, text);
      continue;
    }
    if (file.endsWith('userscript/immersive-lite.user.js')) {
      const text = fs.readFileSync(file, 'utf8').replaceAll('__IMMERSIVE_LITE_VERSION__', version);
      fs.writeFileSync(file, text);
    }
  }
}

function getUserscriptFiles() {
  return [
    path.join(srcDir, 'userscript', 'immersive-lite.user.js'),
    path.join(srcDir, 'userscript', 'core.js'),
    path.join(srcDir, 'userscript', 'cache.js'),
    path.join(srcDir, 'userscript', 'dom-picker.js'),
    path.join(srcDir, 'userscript', 'provider-adapters.js'),
    path.join(srcDir, 'userscript', 'translator.js'),
    path.join(srcDir, 'userscript', 'settings.js'),
    path.join(srcDir, 'userscript', 'ui-fab.js'),
    path.join(srcDir, 'userscript', 'bootstrap.js'),
  ];
}

function bundleUserscript(version) {
  let output = '';
  for (const file of getUserscriptFiles()) {
    let text = fs.readFileSync(file, 'utf8');
    text = text.replaceAll('__IMMERSIVE_LITE_VERSION__', version);
    output += text + '\n\n';
  }
  return output;
}

function writeBundledUserscript(targetDir, version) {
  const userscriptDir = path.join(targetDir, 'userscript');
  fs.mkdirSync(userscriptDir, { recursive: true });
  for (const entry of fs.readdirSync(userscriptDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'immersive-lite.user.js') {
      fs.rmSync(path.join(userscriptDir, entry.name), { force: true });
    }
  }
  fs.writeFileSync(path.join(userscriptDir, 'immersive-lite.user.js'), bundleUserscript(version));
}

function buildFirefox() {
  const out = path.join(distDir, 'firefox');
  copyDir(srcDir, out);
  replaceVersionInHtml(out, firefoxManifest.version);
  writeBundledUserscript(out, firefoxManifest.version);
  return out;
}

function buildChrome() {
  const out = path.join(distDir, 'chrome');
  copyDir(srcDir, out);
  const mv2 = path.join(out, 'manifest.json');
  const mv3 = path.join(out, 'chrome_manifest.json');
  fs.renameSync(mv2, path.join(out, 'firefox_manifest.json'));
  fs.renameSync(mv3, mv2);
  const chromeManifest = JSON.parse(fs.readFileSync(mv2, 'utf8'));
  replaceVersionInHtml(out, chromeManifest.version);
  writeBundledUserscript(out, chromeManifest.version);
  return out;
}

function buildUserscript() {
  const outDir = path.join(distDir, 'userscript');
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, 'immersive-lite.user.js');
  fs.writeFileSync(target, bundleUserscript(firefoxManifest.version));
  return target;
}

rmSafe(distDir);
fs.mkdirSync(distDir, { recursive: true });
const firefoxOut = buildFirefox();
const chromeOut = buildChrome();
const userscriptOut = buildUserscript();

console.log('Built:');
console.log('-', firefoxOut);
console.log('-', chromeOut);
console.log('-', userscriptOut);
