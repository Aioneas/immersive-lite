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

rmSafe(distDir);
fs.mkdirSync(distDir, { recursive: true });
const firefoxOut = buildFirefox();
const chromeOut = buildChrome();

console.log('Built:');
console.log('-', firefoxOut);
console.log('-', chromeOut);
