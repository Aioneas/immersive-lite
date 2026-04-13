#!/usr/bin/env node
// Patch official immersive-translate userscript to remove non-core features
// Input: original.user.js -> Output: immersive-lite.user.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'original.user.js');
const dst = path.join(__dirname, 'immersive-lite.user.js');

let code = fs.readFileSync(src, 'utf8');

// 1. Patch userscript metadata header
code = code.replace(
  /\/\/ @name\s+.*/,
  '// @name         Immersive Lite'
);
code = code.replace(
  /\/\/ @description\s+.*/,
  '// @description  Lightweight bilingual web translation. No login, no cloud, no tracking.'
);
code = code.replace(
  /\/\/ @homepageURL\s+.*/,
  '// @homepageURL    https://github.com/Aioneas/immersive-lite'
);
code = code.replace(
  /\/\/ @supportURL\s+.*/,
  '// @supportURL    https://github.com/Aioneas/immersive-lite/issues'
);
code = code.replace(
  /\/\/ @downloadURL\s+.*/,
  '// @downloadURL https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js'
);
code = code.replace(
  /\/\/ @updateURL\s+.*/,
  '// @updateURL https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js'
);

// 2. Block telemetry / analytics endpoints
// Replace google-analytics and telemetry report URLs with noop
code = code.replaceAll('www.google-analytics.com', 'localhost');
code = code.replaceAll('"enablePerformanceReport":!0', '"enablePerformanceReport":!1');
code = code.replaceAll('"enableSelfServiceReport":!0', '"enableSelfServiceReport":!1');
code = code.replaceAll('"telemetry":!0', '"telemetry":!1');

// 3. Neutralize login / user info fetching
// Make getUserInfo always return a fake pro user so no upgrade prompts appear
code = code.replace(
  /async function eme\(\)\{return new Promise\(e=>\{vt\.callHandler\("getUserInfo",\{\},t=>\{t\.data\?e\(t\.data\):e\(null\)\}\)\}\)\}/,
  'async function eme(){return {subscription:{plan:"pro"},token:"local-lite",email:"lite@local"}}'
);

// 4. Neutralize sync / cloud config fetching
// Replace config fetch URLs with localhost to silently fail
code = code.replaceAll('config.immersivetranslate.com', 'localhost');
code = code.replaceAll('config.imtintl.com', 'localhost');
code = code.replaceAll('api2.immersivetranslate.com', 'localhost');
code = code.replaceAll('api2.imtintl.com', 'localhost');
code = code.replaceAll('test-api2.immersivetranslate.com', 'localhost');
code = code.replaceAll('app.immersivetranslate.com', 'localhost');

// 5. Block analytics beacon
code = code.replaceAll('analytics.immersivetranslate.com', 'localhost');
code = code.replaceAll('analytics.imtintl.com', 'localhost');

// 6. Neutralize upgrade / pricing / login modals
// Replace functions that show upgrade/login modals with no-ops
const modalFunctions = [
  'showUpgradeProModal',
  'showLoginOrUpgradeProModal', 
  'showNotLoginModal',
];
for (const fn of modalFunctions) {
  // Pattern: function xyz(...){...} or xyz=function(...){...} or xyz=async function(...){...}
  // Since this is minified, we do a simpler approach: replace calls to these with no-ops
  const callPattern = new RegExp(`${fn}\\(`, 'g');
  code = code.replaceAll(callPattern, '(()=>{})(');
}

// 7. Remove pricing/donation page references
code = code.replaceAll('dash.immersivetranslate.com', 'localhost');
code = code.replaceAll('immersivetranslate.com/pricing', 'localhost/pricing');
code = code.replaceAll('immersivetranslate.com/auth', 'localhost/auth');

// 8. Patch: always treat user as "pro" to bypass feature gates
// Common pattern in minified code: check like `.plan==="pro"` or `subscription`
// We inject a global override early in the script
const proBypassSnippet = `
;(function(){
  // Immersive Lite: bypass subscription checks
  var _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string') {
      // Block requests to cloud/analytics/config endpoints
      if (url.includes('api2.immersivetranslate') || 
          url.includes('api2.imtintl') ||
          url.includes('config.immersivetranslate') ||
          url.includes('config.imtintl') ||
          url.includes('analytics.immersivetranslate') ||
          url.includes('google-analytics') ||
          url.includes('app.immersivetranslate')) {
        return Promise.resolve(new Response('{}', {status: 200, headers: {'content-type':'application/json'}}));
      }
    }
    return _origFetch.apply(this, arguments);
  };
})();
`;

// Insert the bypass right after the userscript header ends
const headerEnd = code.indexOf('// ==/UserScript==');
if (headerEnd !== -1) {
  const insertPos = code.indexOf('\n', headerEnd) + 1;
  code = code.slice(0, insertPos) + proBypassSnippet + code.slice(insertPos);
}

fs.writeFileSync(dst, code);
const origSize = fs.statSync(src).size;
const newSize = fs.statSync(dst).size;
console.log(`Patched: ${(origSize/1024).toFixed(0)}KB -> ${(newSize/1024).toFixed(0)}KB`);
console.log(`Output: ${dst}`);
