// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      __IMMERSIVE_LITE_VERSION__
// @description  Core-only bilingual page translation with custom OpenAI-compatible API (no login/cloud/pricing).
// @author       Aioneas
// @match        *://*/*
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      *
// @downloadURL  https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js
// @updateURL    https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js
// @run-at       document-end
// ==/UserScript==

(async function () {
  "use strict";
