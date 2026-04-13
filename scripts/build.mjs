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
    if (!file.endsWith('.html')) continue;
    const text = fs.readFileSync(file, 'utf8').replaceAll('__IMMERSIVE_TRANSLATE_VERSION__', version);
    fs.writeFileSync(file, text);
  }
}

function buildFirefox() {
  const out = path.join(distDir, 'firefox');
  copyDir(srcDir, out);
  replaceVersionInHtml(out, firefoxManifest.version);
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
  return out;
}

function buildUserscript() {
  const outDir = path.join(distDir, 'userscript');
  fs.mkdirSync(outDir, { recursive: true });
  const files = [
    path.join(srcDir, 'userscript', 'immersive-lite.user.js'),
    path.join(srcDir, 'userscript', 'shim.js'),
    path.join(srcDir, 'lib', 'runtime.js'),
    path.join(srcDir, 'lib', 'languages.js'),
    path.join(srcDir, 'lib', 'config.js'),
    path.join(srcDir, 'lib', 'platformInfo.js'),
    path.join(srcDir, 'lib', 'i18n.js'),
    path.join(srcDir, 'lib', 'specialRules.js'),
    path.join(srcDir, 'background', 'translationCache.js'),
    path.join(srcDir, 'background', 'translationService.js'),
    path.join(srcDir, 'contentScript', 'showOriginal.js'),
    path.join(srcDir, 'contentScript', 'enhance.js'),
    path.join(srcDir, 'contentScript', 'pageTranslator.js'),
    path.join(srcDir, 'userscript', 'controller.js'),
  ];
  let output = '';
  for (const file of files) {
    let text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('immersive-lite.user.js')) {
      text = text.replaceAll('0.1.0', firefoxManifest.version);
    }
    output += text + '\n\n';
  }
  const target = path.join(outDir, 'immersive-lite.user.js');
  fs.writeFileSync(target, output);
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
