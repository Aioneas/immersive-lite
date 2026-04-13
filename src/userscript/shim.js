"use strict";

(function () {
  const GM_SET = async (key, value) => {
    if (typeof GM !== "undefined" && GM.setValue) return await GM.setValue(key, value);
    if (typeof GM_setValue !== "undefined") return GM_setValue(key, value);
    localStorage.setItem(key, JSON.stringify(value));
  };

  const GM_GET = async (key, defaultValue) => {
    if (typeof GM !== "undefined" && GM.getValue) return await GM.getValue(key, defaultValue);
    if (typeof GM_getValue !== "undefined") return GM_getValue(key, defaultValue);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  };

  const GM_DEL = async (key) => {
    if (typeof GM !== "undefined" && GM.deleteValue) return await GM.deleteValue(key);
    if (typeof GM_deleteValue !== "undefined") return GM_deleteValue(key);
    localStorage.removeItem(key);
  };

  const storageKey = "immersive_lite_storage_v1";
  const storageListeners = [];
  const runtimeListeners = [];

  function guessLanguage(text) {
    if (!text) return document.documentElement.lang || navigator.language || "und";
    if (/[\u3040-\u30ff]/.test(text)) return "ja";
    if (/[\uac00-\ud7af]/.test(text)) return "ko";
    if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN";
    if (/[\u0400-\u04FF]/.test(text)) return "ru";
    return document.documentElement.lang || navigator.language || "en";
  }

  async function getStore() {
    return (await GM_GET(storageKey, {})) || {};
  }

  async function setStore(nextStore) {
    await GM_SET(storageKey, nextStore || {});
  }

  async function storageGet(keys, callback) {
    const store = await getStore();
    if (keys == null) return callback(store);
    if (typeof keys === "string") return callback({ [keys]: store[keys] });
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) out[key] = store[key];
      return callback(out);
    }
    callback(store);
  }

  async function storageSet(obj, callback) {
    const prev = await getStore();
    const next = { ...prev, ...obj };
    await setStore(next);
    const changes = {};
    for (const key of Object.keys(obj)) {
      changes[key] = { oldValue: prev[key], newValue: obj[key] };
    }
    storageListeners.forEach((fn) => fn(changes, "local"));
    if (callback) callback();
  }

  async function storageRemove(keys, callback) {
    const prev = await getStore();
    const next = { ...prev };
    const arr = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    for (const key of arr) {
      changes[key] = { oldValue: prev[key], newValue: undefined };
      delete next[key];
    }
    await setStore(next);
    storageListeners.forEach((fn) => fn(changes, "local"));
    if (callback) callback();
  }

  function dispatchRuntimeMessage(request, callback) {
    const sender = { tab: { id: 0, url: location.href, active: true, incognito: false } };
    let responded = false;
    const sendResponse = (resp) => {
      responded = true;
      if (callback) callback(resp);
    };
    for (const listener of runtimeListeners) {
      try {
        const ret = listener(request, sender, sendResponse);
        if (responded || ret === true) return;
      } catch (e) {
        console.error("[immersive-lite/userscript] runtime listener error", e);
      }
    }
    if (callback && !responded) callback(undefined);
  }

  globalThis.chrome = globalThis.chrome || {};
  chrome.extension = chrome.extension || { inIncognitoContext: false };
  chrome.runtime = chrome.runtime || {};
  chrome.runtime.getManifest = chrome.runtime.getManifest || (() => ({ version: "0.1.0", commands: {} }));
  chrome.runtime.onMessage = chrome.runtime.onMessage || { addListener(fn) { runtimeListeners.push(fn); } };
  chrome.runtime.sendMessage = function (request, callback) {
    if (request && request.action === "getTabHostName") return callback && callback(location.hostname);
    if (request && request.action === "getTabUrl") return callback && callback(location.href);
    if (request && request.action === "detectTabLanguage") return callback && callback(guessLanguage(document.body && document.body.innerText));
    if (request && request.action === "detectLanguage") return callback && callback(guessLanguage(request.text));
    if (request && request.action === "openOptionsPage") {
      if (globalThis.__IMMERSIVE_LITE_OPEN_SETTINGS__) globalThis.__IMMERSIVE_LITE_OPEN_SETTINGS__();
      return callback && callback(true);
    }
    return dispatchRuntimeMessage(request, callback);
  };

  chrome.storage = chrome.storage || {};
  chrome.storage.local = chrome.storage.local || {
    get: storageGet,
    set: storageSet,
    remove: storageRemove,
  };
  chrome.storage.onChanged = chrome.storage.onChanged || {
    addListener(fn) { storageListeners.push(fn); }
  };

  chrome.i18n = chrome.i18n || {};
  chrome.i18n.getAcceptLanguages = chrome.i18n.getAcceptLanguages || ((cb) => cb([navigator.language || "en"]));
  chrome.i18n.getUILanguage = chrome.i18n.getUILanguage || (() => navigator.language || "en");
  chrome.i18n.getMessage = chrome.i18n.getMessage || ((name, substitutions) => {
    if (Array.isArray(substitutions)) return [name].concat(substitutions).join(" ");
    if (substitutions) return String(name).replace("$1", substitutions);
    return name;
  });
})();
