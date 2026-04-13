// ==UserScript==
// @name         Immersive Lite (Preview)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.1.0
// @description  Local-first lightweight bilingual web translation preview for Userscripts/Safari.
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM.deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      google.com
// @connect      translate.googleapis.com
// @connect      translate.yandex.net
// @connect      api.openai.com
// @connect      openrouter.ai
// @connect      api.deepseek.com
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";
  console.log("[immersive-lite/userscript] preview entry loaded");
  window.__IMMERSIVE_LITE_USER_SCRIPT__ = true;
})();
