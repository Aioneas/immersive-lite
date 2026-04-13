// ==UserScript==
// @name         Immersive Lite
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.1.0
// @description  Local-first lightweight bilingual web translation. Supports OpenAI-compatible third-party APIs.
// @author       Aioneas
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
// @homepageURL  https://github.com/Aioneas/immersive-lite
// @downloadURL  https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js
// @updateURL    https://raw.githubusercontent.com/Aioneas/immersive-lite/main/dist/userscript/immersive-lite.user.js
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";
  console.log("[immersive-lite] v0.1.0 loaded");
  window.__IMMERSIVE_LITE_USER_SCRIPT__ = true;
})();


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
  chrome.runtime.reload = chrome.runtime.reload || (() => {});
  chrome.runtime.getURL = chrome.runtime.getURL || ((path) => path);
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


"use strict";

const imtRuntime = (function () {
  function isExtension() {
    return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
  }

  function isUserscript() {
    return !isExtension() && (
      typeof GM_xmlhttpRequest !== "undefined" ||
      (typeof GM !== "undefined" && !!GM.xmlHttpRequest)
    );
  }

  function getMode() {
    if (isExtension()) return "extension";
    if (isUserscript()) return "userscript";
    return "web";
  }

  function hasBackgroundMessaging() {
    return isExtension();
  }

  function getMessage(name, substitutions) {
    if (isExtension() && chrome.i18n && chrome.i18n.getMessage) {
      return chrome.i18n.getMessage(name, substitutions);
    }
    return "";
  }

  function sendMessage(message, callback) {
    if (isExtension() && chrome.runtime && chrome.runtime.sendMessage) {
      return chrome.runtime.sendMessage(message, callback);
    }
    if (callback) callback(undefined);
  }

  function getResourceUrl(path) {
    if (isExtension() && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(path);
    }
    return path;
  }

  async function request(details) {
    if (isExtension()) {
      const response = await fetch(details.url, {
        method: details.method || "GET",
        headers: details.headers,
        body: details.body,
      });
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
        json: async function () { return JSON.parse(this.text); },
      };
    }

    if (typeof GM !== "undefined" && GM.xmlHttpRequest) {
      return await new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: details.method || "GET",
          url: details.url,
          headers: details.headers,
          data: details.body,
          onload: (resp) => resolve({
            ok: resp.status >= 200 && resp.status < 300,
            status: resp.status,
            text: resp.responseText,
            json: async function () { return JSON.parse(this.text); },
          }),
          onerror: reject,
        });
      });
    }

    if (typeof GM_xmlhttpRequest !== "undefined") {
      return await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: details.method || "GET",
          url: details.url,
          headers: details.headers,
          data: details.body,
          onload: (resp) => resolve({
            ok: resp.status >= 200 && resp.status < 300,
            status: resp.status,
            text: resp.responseText,
            json: async function () { return JSON.parse(this.text); },
          }),
          onerror: reject,
        });
      });
    }

    throw new Error("No available network adapter");
  }

  return {
    isExtension,
    isUserscript,
    getMode,
    hasBackgroundMessaging,
    getMessage,
    sendMessage,
    getResourceUrl,
    request,
  };
})();


"use strict";

const twpLang = (function () {
  const allLanguagesNames = {
    en: {
      af: "Afrikaans",
      sq: "Albanian",
      am: "Amharic",
      ar: "Arabic",
      hy: "Armenian",
      as: "Assamese",
      ay: "Aymara",
      az: "Azerbaijani",
      bm: "Bambara",
      eu: "Basque",
      be: "Belarusian",
      bn: "Bengali",
      bho: "Bhojpuri",
      bs: "Bosnian",
      bg: "Bulgarian",
      ca: "Catalan",
      ceb: "Cebuano",
      ny: "Chichewa",
      "zh-CN": "Chinese (Simplified)",
      "zh-TW": "Chinese (Traditional)",
      co: "Corsican",
      hr: "Croatian",
      cs: "Czech",
      da: "Danish",
      dv: "Dhivehi",
      doi: "Dogri",
      nl: "Dutch",
      en: "English",
      eo: "Esperanto",
      et: "Estonian",
      ee: "Ewe",
      tl: "Filipino",
      fi: "Finnish",
      fr: "French",
      fy: "Frisian",
      gl: "Galician",
      ka: "Georgian",
      de: "German",
      el: "Greek",
      gn: "Guarani",
      gu: "Gujarati",
      ht: "Haitian Creole",
      ha: "Hausa",
      haw: "Hawaiian",
      he: "Hebrew",
      hi: "Hindi",
      hmn: "Hmong",
      hu: "Hungarian",
      is: "Icelandic",
      ig: "Igbo",
      ilo: "Ilocano",
      id: "Indonesian",
      ga: "Irish",
      it: "Italian",
      ja: "Japanese",
      jv: "Javanese",
      kn: "Kannada",
      kk: "Kazakh",
      km: "Khmer",
      rw: "Kinyarwanda",
      gom: "Konkani",
      ko: "Korean",
      kri: "Krio",
      ku: "Kurdish (Kurmanji)",
      ckb: "Kurdish (Sorani)",
      ky: "Kyrgyz",
      lo: "Lao",
      la: "Latin",
      lv: "Latvian",
      ln: "Lingala",
      lt: "Lithuanian",
      lg: "Luganda",
      lb: "Luxembourgish",
      mk: "Macedonian",
      mai: "Maithili",
      mg: "Malagasy",
      ms: "Malay",
      ml: "Malayalam",
      mt: "Maltese",
      mi: "Maori",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (Manipuri)",
      lus: "Mizo",
      mn: "Mongolian",
      my: "Myanmar (Burmese)",
      ne: "Nepali",
      no: "Norwegian",
      or: "Odia (Oriya)",
      om: "Oromo",
      ps: "Pashto",
      fa: "Persian",
      pl: "Polish",
      pt: "Portuguese",
      pa: "Punjabi",
      qu: "Quechua",
      ro: "Romanian",
      ru: "Russian",
      sm: "Samoan",
      sa: "Sanskrit",
      gd: "Scots Gaelic",
      nso: "Sepedi",
      sr: "Serbian",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindhi",
      si: "Sinhala",
      sk: "Slovak",
      sl: "Slovenian",
      so: "Somali",
      es: "Spanish",
      su: "Sundanese",
      sw: "Swahili",
      sv: "Swedish",
      tg: "Tajik",
      ta: "Tamil",
      tt: "Tatar",
      te: "Telugu",
      th: "Thai",
      ti: "Tigrinya",
      ts: "Tsonga",
      tr: "Turkish",
      tk: "Turkmen",
      ak: "Twi",
      uk: "Ukrainian",
      ur: "Urdu",
      ug: "Uyghur",
      uz: "Uzbek",
      vi: "Vietnamese",
      cy: "Welsh",
      xh: "Xhosa",
      yi: "Yiddish",
      yo: "Yoruba",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    ar: {
      is: "الآيسلندية",
      az: "الأذرية",
      ur: "الأردية",
      hy: "الأرمنية",
      as: "الأسامية",
      es: "الإسبانية",
      eo: "الإسبرانتو",
      et: "الإستونية",
      af: "الأفريقانية",
      sq: "الألبانية",
      de: "الألمانية",
      am: "الأمهرية",
      en: "الإنجليزية",
      id: "الإندونيسية",
      or: "الأوديا (الأوريا)",
      om: "الأورومية",
      uz: "الأوزبكية",
      uk: "الأوكرانية",
      ug: "الأويغورية",
      ga: "الأيرلندية",
      it: "الإيطالية",
      ig: "الإيغبو",
      ilo: "الإيلوكانو",
      ay: "الأيمارا",
      ee: "الإيوي",
      eu: "الباسكية",
      ps: "الباشتوية",
      bm: "البامبارا",
      pt: "البرتغالية",
      bg: "البلغارية",
      pa: "البنجابية",
      bn: "البنغالية",
      bho: "البوجبورية",
      my: "البورمية",
      bs: "البوسنية",
      pl: "البولندية",
      be: "البيلاروسية",
      ta: "التاميلية",
      th: "التايلاندية",
      tt: "التتارية",
      tk: "التركمانية",
      tr: "التركية",
      ts: "التسونغا",
      cs: "التشيكية",
      ti: "التيغرينية",
      te: "التيلوغوية",
      gl: "الجاليكية",
      jv: "الجاوية",
      gn: "الجورانية",
      ka: "الجورجية",
      km: "الخميرية",
      xh: "الخوسا",
      da: "الدانمركية",
      doi: "الدوغرية",
      dv: "الديفهية",
      ru: "الروسية",
      ro: "الرومانية",
      zu: "الزولو",
      sm: "الساموانية",
      su: "الساندينيزية",
      nso: "السبيدية",
      sk: "السلوفاكية",
      sl: "السلوفينية",
      sd: "السندية",
      sa: "السنسكريتية",
      si: "السنهالية",
      sw: "السواحيلية",
      sv: "السويدية",
      ceb: "السيبيوانية",
      st: "السيسوتو",
      sn: "الشونا",
      sr: "الصربية",
      so: "الصومالية",
      "zh-TW": "الصينية (التقليدية)",
      "zh-CN": "الصينية (المبسطة)",
      tg: "الطاجيكية",
      he: "العبرية",
      ar: "العربية",
      gu: "الغوجاراتية",
      gd: "الغيلية الأسكتلندية",
      fa: "الفارسية",
      fr: "الفرنسية",
      fy: "الفريزية",
      tl: "الفلبينية",
      fi: "الفنلندية",
      vi: "الفيتنامية",
      ca: "القطلونية",
      ky: "القيرغيزية",
      kk: "الكازاخية",
      ckb: "الكردية (السورانية)",
      ku: "الكردية (الكرمانجية)",
      hr: "الكرواتية",
      kn: "الكنادية",
      co: "الكورسيكية",
      ko: "الكورية",
      gom: "الكونكانية",
      qu: "الكيتشوا",
      rw: "الكينيارواندية",
      lv: "اللاتفية",
      la: "اللاتينية",
      lo: "اللاوو",
      ht: "اللغة الكريولية الهايتية",
      lg: "اللوغندية",
      lb: "اللوكسمبورغية",
      lt: "الليتوانية",
      ln: "اللينغالا",
      mr: "الماراثية",
      ml: "المالايالامية",
      mt: "المالطيّة",
      mi: "الماورية",
      mai: "المايثيلية",
      mg: "المدغشقرية",
      mk: "المقدونية",
      ms: "الملايو",
      mn: "المنغولية",
      "mni-Mtei": "الميتية (المانيبورية)",
      lus: "الميزو",
      no: "النرويجية",
      ne: "النيبالية",
      hmn: "الهمونجية",
      hi: "الهندية",
      hu: "الهنغارية",
      ha: "الهوسا",
      nl: "الهولندية",
      cy: "الويلزية",
      ja: "اليابانية",
      yo: "اليورباية",
      el: "اليونانية",
      yi: "الييدية",
      ny: "تشيتشوا",
      ak: "توي",
      kri: "كريو",
      haw: "لغة هاواي",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    ca: {
      af: "afrikaans",
      ay: "aimara",
      sq: "albanès",
      de: "alemany",
      am: "amhàric",
      en: "anglès",
      ar: "àrab",
      hy: "armeni",
      as: "assamès",
      az: "àzeri",
      bm: "bambara",
      eu: "basc",
      bn: "bengalí",
      bho: "bhojpuri",
      be: "bielorús",
      my: "birmà",
      bs: "bosnià",
      bg: "búlgar",
      es: "castellà",
      ca: "català",
      ceb: "cebuà",
      gom: "concani",
      ko: "coreà",
      co: "cors",
      ht: "crioll d'Haití",
      hr: "croat",
      da: "danès",
      dv: "divehi",
      doi: "dogri",
      sk: "eslovac",
      sl: "eslovè",
      eo: "esperanto",
      et: "estonià",
      ee: "ewe",
      fi: "finès",
      fr: "francès",
      fy: "frisó",
      gd: "gaèlic escocès",
      gl: "gallec",
      cy: "gal·lès",
      lg: "ganda",
      ka: "georgià",
      el: "grec",
      gn: "guaraní",
      gu: "gujarati",
      ha: "haussa",
      haw: "hawaià",
      he: "hebreu",
      hi: "hindi",
      hmn: "hmong",
      hu: "hongarès",
      yi: "ídix",
      ig: "igbo",
      ilo: "ilocano",
      id: "indonesi",
      yo: "ioruba",
      ga: "irlandès",
      is: "islandès",
      it: "italià",
      ja: "japonès",
      jv: "javanès",
      kn: "kannada",
      kk: "kazakh",
      km: "khmer",
      ky: "kirguís",
      kri: "krio",
      ku: "kurd (Kurmanji)",
      ckb: "kurd (sorani)",
      lo: "laosià",
      lv: "letó",
      ln: "lingala",
      lt: "lituà",
      la: "llatí",
      lb: "luxemburguès",
      mk: "macedònic",
      mai: "maithili",
      ms: "malai",
      ml: "malaiàlam",
      mg: "malgaix",
      mt: "maltès",
      mi: "maori",
      mr: "marathi",
      "mni-Mtei": "meitei (manipurí)",
      lus: "mizo",
      mn: "mongol",
      nl: "neerlandès",
      ne: "nepalès",
      no: "noruec",
      or: "oriya",
      om: "oromo",
      ps: "paixtu",
      fa: "persa",
      pl: "polonès",
      pt: "portuguès",
      pa: "punjabi",
      qu: "quítxua",
      ro: "romanès",
      rw: "ruandès",
      ru: "rus",
      sm: "samoà",
      sa: "sànscrit",
      nso: "sepedi",
      sr: "serbi",
      sn: "shona",
      sd: "sindi",
      si: "singalès",
      so: "somali",
      st: "sotho",
      sw: "suahili",
      sv: "suec",
      su: "sundanès",
      tg: "tadjik",
      tl: "tagal",
      th: "tai",
      ta: "tàmil",
      tt: "tàtar",
      te: "telugu",
      ti: "tigrinya",
      ts: "tsonga",
      tr: "turc",
      tk: "turcman",
      ak: "twi",
      cs: "txec",
      uk: "ucraïnès",
      ug: "uigur",
      ur: "urdú",
      uz: "uzbek",
      vi: "vietnamita",
      xh: "xhosa",
      "zh-CN": "xinès (simplificat)",
      "zh-TW": "xinès (tradicional)",
      ny: "xixewa",
      zu: "zulú",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    "zh-CN": {
      sq: "阿尔巴尼亚语",
      ar: "阿拉伯语",
      am: "阿姆哈拉语",
      as: "阿萨姆语",
      az: "阿塞拜疆语",
      ee: "埃维语",
      ay: "艾马拉语",
      ga: "爱尔兰语",
      et: "爱沙尼亚语",
      or: "奥利亚语",
      om: "奥罗莫语",
      eu: "巴斯克语",
      be: "白俄罗斯语",
      bm: "班巴拉语",
      bg: "保加利亚语",
      is: "冰岛语",
      pl: "波兰语",
      bs: "波斯尼亚语",
      fa: "波斯语",
      bho: "博杰普尔语",
      af: "布尔语(南非荷兰语)",
      tt: "鞑靼语",
      da: "丹麦语",
      de: "德语",
      dv: "迪维希语",
      ti: "蒂格尼亚语",
      doi: "多格来语",
      ru: "俄语",
      fr: "法语",
      sa: "梵语",
      tl: "菲律宾语",
      fi: "芬兰语",
      fy: "弗里西语",
      km: "高棉语",
      ka: "格鲁吉亚语",
      gom: "贡根语",
      gu: "古吉拉特语",
      gn: "瓜拉尼语",
      kk: "哈萨克语",
      ht: "海地克里奥尔语",
      ko: "韩语",
      ha: "豪萨语",
      nl: "荷兰语",
      ky: "吉尔吉斯语",
      gl: "加利西亚语",
      ca: "加泰罗尼亚语",
      cs: "捷克语",
      kn: "卡纳达语",
      co: "科西嘉语",
      kri: "克里奥尔语",
      hr: "克罗地亚语",
      qu: "克丘亚语",
      ku: "库尔德语（库尔曼吉语）",
      ckb: "库尔德语（索拉尼）",
      la: "拉丁语",
      lv: "拉脱维亚语",
      lo: "老挝语",
      lt: "立陶宛语",
      ln: "林格拉语",
      lg: "卢干达语",
      lb: "卢森堡语",
      rw: "卢旺达语",
      ro: "罗马尼亚语",
      mg: "马尔加什语",
      mt: "马耳他语",
      mr: "马拉地语",
      ml: "马拉雅拉姆语",
      ms: "马来语",
      mk: "马其顿语",
      mai: "迈蒂利语",
      mi: "毛利语",
      "mni-Mtei": "梅泰语（曼尼普尔语）",
      mn: "蒙古语",
      bn: "孟加拉语",
      lus: "米佐语",
      my: "缅甸语",
      hmn: "苗语",
      xh: "南非科萨语",
      zu: "南非祖鲁语",
      ne: "尼泊尔语",
      no: "挪威语",
      pa: "旁遮普语",
      pt: "葡萄牙语",
      ps: "普什图语",
      ny: "齐切瓦语",
      ak: "契维语",
      ja: "日语",
      sv: "瑞典语",
      sm: "萨摩亚语",
      sr: "塞尔维亚语",
      nso: "塞佩蒂语",
      st: "塞索托语",
      si: "僧伽罗语",
      eo: "世界语",
      sk: "斯洛伐克语",
      sl: "斯洛文尼亚语",
      sw: "斯瓦希里语",
      gd: "苏格兰盖尔语",
      ceb: "宿务语",
      so: "索马里语",
      tg: "塔吉克语",
      te: "泰卢固语",
      ta: "泰米尔语",
      th: "泰语",
      tr: "土耳其语",
      tk: "土库曼语",
      cy: "威尔士语",
      ug: "维吾尔语",
      ur: "乌尔都语",
      uk: "乌克兰语",
      uz: "乌兹别克语",
      es: "西班牙语",
      he: "希伯来语",
      el: "希腊语",
      haw: "夏威夷语",
      sd: "信德语",
      hu: "匈牙利语",
      sn: "修纳语",
      hy: "亚美尼亚语",
      ig: "伊博语",
      ilo: "伊洛卡诺语",
      it: "意大利语",
      yi: "意第绪语",
      hi: "印地语",
      su: "印尼巽他语",
      id: "印尼语",
      jv: "印尼爪哇语",
      en: "英语",
      yo: "约鲁巴语",
      vi: "越南语",
      "zh-TW": "中文（繁体）",
      "zh-CN": "中文（简体）",
      ts: "宗加语",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    "zh-TW": {
      tr: "土耳其文",
      tk: "土庫曼文",
      "zh-TW": "中文 (繁體)",
      "zh-CN": "中文 (簡體)",
      da: "丹麥文",
      eu: "巴斯克文",
      ja: "日文",
      mi: "毛利文",
      jv: "爪哇文",
      eo: "世界語",
      gl: "加里西亞文",
      ca: "加泰羅尼亞文",
      kn: "卡納達文",
      ne: "尼泊爾文",
      af: "布爾文",
      fy: "弗利然文",
      gn: "瓜拉尼文",
      be: "白俄羅斯文",
      lt: "立陶宛文",
      ilo: "伊洛卡諾文",
      ig: "伊博文",
      is: "冰島文",
      hu: "匈牙利文",
      id: "印尼文",
      su: "印尼巽他文",
      hi: "印度文",
      gu: "印度古哈拉地文",
      ky: "吉爾吉斯文",
      lus: "米佐文",
      ay: "艾馬拉文",
      es: "西班牙文",
      qu: "克丘亞文",
      kri: "克里奧文",
      hr: "克羅埃西亞文",
      he: "希伯來文",
      el: "希臘文",
      hy: "亞美尼亞文",
      az: "亞塞拜然文",
      nso: "佩蒂文",
      ny: "奇切瓦文",
      bn: "孟加拉文",
      ts: "宗卡文",
      ps: "帕施圖文",
      la: "拉丁文",
      lv: "拉脫維亞文",
      ln: "林格拉文",
      fr: "法文",
      bs: "波士尼亞文",
      fa: "波斯文",
      pl: "波蘭文",
      fi: "芬蘭文",
      am: "阿姆哈拉文",
      ar: "阿拉伯文",
      sq: "阿爾巴尼亞文",
      as: "阿薩姆文",
      ru: "俄文",
      bg: "保加利亞文",
      sd: "信德文",
      xh: "南非柯薩文",
      zu: "南非祖魯文",
      kk: "哈薩克文",
      ak: "契維文",
      cy: "威爾斯文",
      co: "科西嘉文",
      hmn: "苗文",
      en: "英文",
      dv: "迪維希文",
      ee: "埃維文",
      haw: "夏威夷文",
      ku: "庫德文 (庫爾曼吉文)",
      ckb: "庫德文 (索拉尼文)",
      no: "挪威文",
      pa: "旁遮普文",
      th: "泰文",
      ta: "泰米爾文",
      te: "泰盧固文",
      ht: "海地克里奧文",
      lg: "烏干達文",
      uk: "烏克蘭文",
      uz: "烏茲別克文",
      ur: "烏爾都文",
      bm: "班巴拉文",
      so: "索馬里文",
      gom: "貢根文",
      mt: "馬耳他文",
      ms: "馬來文",
      mk: "馬其頓文",
      mg: "馬拉加斯文",
      mr: "馬拉地文",
      ml: "馬拉雅拉姆文",
      km: "高棉文",
      ceb: "宿霧文",
      cs: "捷克文",
      "mni-Mtei": "梅泰文 (曼尼普爾文)",
      sa: "梵文",
      sn: "紹納文",
      nl: "荷蘭文",
      bho: "博杰普爾文",
      ka: "喬治亞文",
      sw: "斯瓦希里文",
      sk: "斯洛伐克文",
      sl: "斯洛維尼亞文",
      tl: "菲律賓文",
      vi: "越南文",
      tg: "塔吉克文",
      sr: "塞爾維亞文",
      om: "奧羅莫文",
      yi: "意第緒文",
      et: "愛沙尼亞文",
      ga: "愛爾蘭文",
      sv: "瑞典文",
      st: "瑟索托文",
      it: "義大利文",
      pt: "葡萄牙文",
      ti: "蒂格里亞文",
      doi: "道格里文",
      ug: "維吾爾文",
      mn: "蒙古文",
      ha: "豪沙文",
      lo: "寮文",
      de: "德文",
      or: "歐利亞文 (奧里雅文)",
      my: "緬甸文",
      rw: "盧安達文",
      lb: "盧森堡文",
      si: "錫蘭文",
      yo: "優魯巴文",
      mai: "邁蒂利文",
      ko: "韓文",
      sm: "薩摩亞文",
      ro: "羅馬尼亞文",
      gd: "蘇格蘭的蓋爾文",
      tt: "韃靼文",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    hr: {
      af: "afrikaans",
      ay: "ajmarski",
      sq: "albanski",
      am: "amharik",
      ar: "arapski",
      hy: "armenski",
      as: "asamski",
      az: "azerbajdžanski",
      bm: "bambarski",
      eu: "baskijski",
      bn: "bengalski",
      bho: "bhojpurski",
      be: "bjeloruski",
      bs: "bosanski",
      bg: "bugarski",
      my: "burmanski",
      ceb: "cebuano",
      ny: "chichewa",
      cs: "češki",
      da: "danski",
      dv: "divehi",
      doi: "dogrijski",
      en: "engleski",
      eo: "esperanto",
      et: "estonski",
      ee: "eve",
      fi: "finski",
      fr: "francuski",
      fy: "frizijski",
      gl: "galski",
      el: "grčki",
      ka: "gruzijski",
      gn: "guarani",
      gu: "gujarati",
      ht: "haićansko-kreolski",
      ha: "hausa",
      haw: "havajski",
      he: "hebrejski",
      hi: "hindu",
      hmn: "hmong",
      hr: "hrvatski",
      ig: "igbo",
      ilo: "ilokanski",
      id: "indonezijski",
      ga: "irski",
      is: "islandski",
      ja: "japanski",
      jv: "javanski",
      yi: "jidiš",
      yo: "joruba",
      kn: "kannada",
      ca: "katalonski",
      kk: "kazaški",
      qu: "kečuanski",
      "zh-CN": "kineski (pojednostavljeni)",
      "zh-TW": "kineski (tradicionalni)",
      rw: "kinyarwanda",
      ky: "kirgistanski",
      km: "kmerski",
      gom: "konkanski",
      ko: "korejski",
      co: "korzički",
      kri: "krio",
      ku: "kurdski (kurmanji)",
      ckb: "kurdski (soranski)",
      lo: "laoski",
      la: "latinski",
      lv: "latvijski/letonski",
      ln: "lingala",
      lt: "litvanski",
      lg: "luganda",
      lb: "luksemburški",
      hu: "mađarski",
      mai: "maithili",
      mk: "makedonski",
      ml: "malajalam",
      ms: "malezijski",
      mg: "malgaški",
      mt: "malteški",
      mi: "maori",
      mr: "marati",
      "mni-Mtei": "meiteilon (manipurski)",
      lus: "mizo",
      mn: "mongolski",
      ne: "nepalski",
      nl: "nizozemski",
      no: "norveški",
      de: "njemački",
      or: "odijski (orijski)",
      om: "oromo",
      ps: "paštu",
      fa: "perzijski",
      pl: "poljski",
      pt: "portugalski",
      pa: "punjabi",
      ro: "rumunjski",
      ru: "ruski",
      sn: "sahona",
      sm: "samoanski",
      sa: "sanskrt",
      nso: "sepedi",
      st: "sesotski",
      sd: "sindi",
      si: "singalski",
      sk: "slovački",
      sl: "slovenski",
      so: "somalijski",
      sr: "srpski",
      su: "sundanski",
      sw: "svahili",
      gd: "škotski keltski",
      es: "španjolski",
      sv: "švedski",
      tg: "tadžik",
      tl: "tagalog",
      th: "tajlandski",
      it: "talijanski",
      ta: "tamilski",
      tt: "tatarski",
      te: "telugu",
      ti: "tigrinja",
      ts: "tsonga",
      tk: "turkmenski",
      tr: "turski",
      ak: "tvi",
      ug: "ujgurski",
      uk: "ukrajinski",
      ur: "urdu",
      uz: "uzbekistanski",
      cy: "velški",
      vi: "vijetnamski",
      xh: "xhosa",
      zu: "zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    cs: {
      af: "afrikánština",
      sq: "albánština",
      am: "amharština",
      en: "angličtina",
      ar: "arabština",
      hy: "arménština",
      as: "ásámština",
      ay: "aymarština",
      az: "ázerbájdžánština",
      bm: "bambarština",
      my: "barmština",
      eu: "baskičtina",
      be: "běloruština",
      bn: "bengálština",
      bho: "bhódžpurština",
      bs: "bosenština",
      bg: "bulharština",
      ceb: "cebuánština",
      cs: "čeština",
      ny: "čičevština",
      "zh-TW": "čínština (tradiční)",
      "zh-CN": "čínština (zjednodušená)",
      da: "dánština",
      doi: "dógrí",
      eo: "esperanto",
      et: "estonština",
      ee: "eweština",
      tl: "filipínština",
      fi: "finština",
      fr: "francouzština",
      fy: "fríština",
      gl: "galicijština",
      ka: "gruzínština",
      gn: "guaraní",
      gu: "gudžarátština",
      ht: "haitská kreolština",
      ha: "hauština",
      haw: "havajština",
      he: "hebrejština",
      hi: "hindština",
      hmn: "hmongština",
      nl: "holandština",
      hr: "chorvatština",
      ig: "igboština",
      ilo: "ilokánština",
      id: "indonéština",
      ga: "irština",
      is: "islandština",
      it: "italština",
      ja: "japonština",
      jv: "javánština",
      yi: "jidiš",
      yo: "jorubština",
      kn: "kannadština",
      ca: "katalánština",
      kk: "kazaština",
      qu: "kečuánština",
      km: "khmerština",
      gom: "konkánština",
      ko: "korejština",
      co: "korsičtina",
      kri: "kríjština",
      ku: "kurdština",
      ckb: "kurdština (sorání)",
      ky: "kyrgyzština",
      lo: "laoština",
      la: "latina",
      ln: "lingalština",
      lt: "litevština",
      lv: "lotyština",
      lb: "lucemburština",
      lg: "lugandština",
      hu: "maďarština",
      mai: "maithilština",
      mk: "makedonština",
      ml: "malajálamština",
      ms: "malajština",
      dv: "maledivština",
      mg: "malgaština",
      mt: "maltština",
      "mni-Mtei": "manipurština",
      mi: "maorština",
      mr: "marátština",
      lus: "mizoština",
      mn: "mongolština",
      de: "němčina",
      ne: "nepálština",
      no: "norština",
      om: "oromština",
      pa: "pandžábština",
      ps: "paštština",
      fa: "perština",
      pl: "polština",
      pt: "portugalština",
      ro: "rumunština",
      ru: "ruština",
      rw: "rwandština",
      el: "řečtina",
      sm: "samojská polynéština",
      sa: "sanskrt",
      nso: "sepedi",
      st: "sesothština",
      sd: "sindhijština",
      si: "sinhálština",
      gd: "skotská gaelština",
      sk: "slovenština",
      sl: "slovinština",
      so: "somálština",
      sr: "srbština",
      su: "sundánština",
      sw: "svahilština",
      sn: "šonština",
      es: "španělština",
      sv: "švédština",
      tg: "tádžičtina",
      ta: "tamilština",
      tt: "tatarština",
      te: "telužština",
      th: "thajština",
      ti: "tigrinština",
      ts: "tsongština",
      tr: "turečtina",
      tk: "turkmenština",
      ak: "twiština",
      ug: "ujgurština",
      uk: "ukrajinština",
      ur: "urdština",
      or: "urijština",
      uz: "uzbečtina",
      cy: "velština",
      vi: "vietnamština",
      xh: "xhoština",
      zu: "zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    da: {
      af: "Afrikaans",
      sq: "Albansk",
      am: "Amharisk",
      ar: "Arabisk",
      hy: "Armensk",
      az: "Aserbajdsjansk",
      as: "Assamesisk",
      ay: "Aymara",
      bm: "Bambara",
      eu: "Baskisk",
      bn: "Bengali",
      bho: "Bhojpuri",
      bs: "Bosnisk",
      bg: "Bulgarsk",
      my: "Burmesisk",
      ceb: "Cebuano",
      ny: "Chichewa",
      da: "Dansk",
      dv: "Dhivehi",
      doi: "Dogri",
      en: "Engelsk",
      eo: "Esperanto",
      et: "Estisk",
      ee: "Ewe",
      fi: "Finsk",
      fr: "Fransk",
      fy: "Frisisk",
      gl: "Galicisk",
      ka: "Georgisk",
      el: "Græsk",
      gn: "Guarani",
      gu: "Gujarati",
      ht: "Haitisk kreolsk",
      ha: "Hausa",
      haw: "Hawaiiansk",
      he: "Hebraisk",
      hi: "Hindi",
      hmn: "Hmong",
      be: "Hviderussisk",
      ig: "Igbo",
      ilo: "Ilokano",
      id: "Indonesisk",
      ga: "Irsk",
      is: "Islandsk",
      it: "Italiensk",
      ja: "Japansk",
      jv: "Javanesisk",
      yi: "Jiddisch",
      kn: "Kannada",
      kk: "Kasakhisk",
      ca: "Katalansk",
      km: "Khmer",
      "zh-CN": "Kinesisk (forenklet)",
      "zh-TW": "Kinesisk (traditionelt)",
      rw: "Kinyarwanda",
      ky: "Kirgisk",
      gom: "Konkani",
      ko: "Koreansk",
      co: "Korsikansk",
      kri: "Krio",
      hr: "Kroatisk",
      ku: "Kurdisk (kurmanji)",
      ckb: "Kurdisk (sorani)",
      lo: "Laotisk",
      la: "Latin",
      lv: "Lettisk",
      ln: "Lingala",
      lt: "Litauisk",
      lg: "Luganda",
      lb: "Luxembourgsk",
      mai: "Maithili",
      mk: "Makedonsk",
      mg: "Malagassisk",
      ms: "Malajisk",
      ml: "Malayalam",
      mt: "Maltesisk",
      mi: "Maori",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (manipuri)",
      lus: "Mizo",
      mn: "Mongolsk",
      nl: "Nederlandsk",
      ne: "Nepalesisk",
      no: "Norsk",
      or: "Odia (oriya)",
      om: "Oromo",
      ps: "Pashto",
      fa: "Persisk",
      pl: "Polsk",
      pt: "Portugisisk",
      pa: "Punjabi",
      qu: "Quechua",
      ro: "Rumænsk",
      ru: "Russisk",
      sm: "Samoansk",
      sa: "Sanskrit",
      nso: "Sepedi",
      sr: "Serbisk",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindhi",
      si: "Sinhala",
      gd: "Skotsk gælisk",
      sk: "Slovakisk",
      sl: "Slovensk",
      so: "Somalisk",
      es: "Spansk",
      su: "Sundanesisk",
      sv: "Svensk",
      sw: "Swahili",
      tg: "Tadsjikisk",
      tl: "Tagalog",
      ta: "Tamil",
      tt: "Tatarisk",
      te: "Telugu",
      th: "Thailandsk",
      ti: "Tigrinyansk",
      cs: "Tjekkisk",
      ts: "Tsonga",
      tk: "Turkmensk",
      ak: "Twi",
      tr: "Tyrkisk",
      de: "Tysk",
      ug: "Uighursk",
      uk: "Ukrainsk",
      hu: "Ungarsk",
      ur: "Urdu",
      uz: "Usbekisk",
      vi: "Vietnamesisk",
      cy: "Walisisk",
      xh: "Xhosa",
      yo: "Yoruba",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    nl: {
      af: "Afrikaans",
      sq: "Albanees",
      am: "Amharisch",
      ar: "Arabisch",
      hy: "Armeens",
      as: "Assamees",
      ay: "Aymara",
      az: "Azerbeidzjaans",
      bm: "Bambara",
      eu: "Baskisch",
      be: "Belarussisch",
      bn: "Bengaals",
      bho: "Bhojpuri",
      my: "Birmaans",
      bs: "Bosnisch",
      bg: "Bulgaars",
      ca: "Catalaans",
      ceb: "Cebuano",
      ny: "Chichewa",
      "zh-TW": "Chinees (traditioneel)",
      "zh-CN": "Chinees (vereenvoudigd)",
      co: "Corsicaans",
      da: "Deens",
      dv: "Dhivehi",
      doi: "Dogri",
      de: "Duits",
      en: "Engels",
      eo: "Esperanto",
      et: "Ests",
      ee: "Ewe",
      fi: "Fins",
      fr: "Frans",
      fy: "Fries",
      gl: "Galicisch",
      ka: "Georgisch",
      el: "Grieks",
      gn: "Guarani",
      gu: "Gujarati",
      ht: "Haïtiaans Creools",
      ha: "Hausa",
      haw: "Hawaïaans",
      he: "Hebreeuws",
      hi: "Hindi",
      hmn: "Hmong",
      hu: "Hongaars",
      ga: "Iers",
      ig: "Igbo",
      is: "IJslands",
      ilo: "Ilocano",
      id: "Indonesisch",
      it: "Italiaans",
      ja: "Japans",
      jv: "Javaans",
      yi: "Jiddisch",
      kn: "Kannada",
      kk: "Kazachs",
      km: "Khmer",
      rw: "Kinyarwanda",
      ky: "Kirgizisch",
      ku: "Koerdisch (Kurmanji)",
      ckb: "Koerdisch (Sorani)",
      gom: "Konkani",
      ko: "Koreaans",
      kri: "Krio",
      hr: "Kroatisch",
      lo: "Lao",
      la: "Latijn",
      lv: "Lets",
      ln: "Lingala",
      lt: "Litouws",
      lg: "Luganda",
      lb: "Luxemburgs",
      mk: "Macedonisch",
      mai: "Maithili",
      mg: "Malagasi",
      ml: "Malayalam",
      ms: "Maleis",
      mt: "Maltees",
      mi: "Maori",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (Manipuri)",
      lus: "Mizo",
      mn: "Mongools",
      nl: "Nederlands",
      ne: "Nepalees",
      no: "Noors",
      or: "Odia (Oriya)",
      ug: "Oeigoers",
      uk: "Oekraïens",
      uz: "Oezbeeks",
      om: "Oromo",
      ps: "Pashto",
      fa: "Perzisch",
      pl: "Pools",
      pt: "Portugees",
      pa: "Punjabi",
      qu: "Quechua",
      ro: "Roemeens",
      ru: "Russisch",
      sm: "Samoaans",
      sa: "Sanskriet",
      gd: "Schots Keltisch",
      nso: "Sepedi",
      sr: "Servisch",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindhi",
      si: "Sinhala",
      sk: "Slovaaks",
      sl: "Sloveens",
      su: "Soendanees",
      so: "Somalisch",
      es: "Spaans",
      sw: "Swahili",
      tg: "Tadzjieks",
      tl: "Tagalog",
      ta: "Tamil",
      tt: "Tataars",
      te: "Telugu",
      th: "Thai",
      ti: "Tigrinya",
      cs: "Tsjechisch",
      ts: "Tsonga",
      tk: "Turkmeens",
      tr: "Turks",
      ak: "Twi",
      ur: "Urdu",
      vi: "Vietnamees",
      cy: "Wels",
      xh: "Xhosa",
      yo: "Yoruba",
      zu: "Zoeloe",
      sv: "Zweeds",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    fi: {
      af: "afrikaans",
      ay: "aimara",
      sq: "albania",
      am: "amhara",
      ar: "arabia",
      hy: "armenia",
      as: "assami",
      az: "azeri",
      bm: "bambara",
      eu: "baski",
      bn: "bengali",
      bho: "bhodžpuri",
      bs: "bosnia",
      bg: "bulgaria",
      my: "burma",
      ceb: "cebu",
      dv: "divehi",
      doi: "dogri",
      en: "englanti",
      es: "espanja",
      eo: "esperanto",
      ee: "ewe",
      fy: "friisi",
      gl: "galicia",
      ka: "gruusia",
      gn: "guarani",
      gu: "gujarati",
      ht: "haitinkreoli",
      ha: "hausa",
      haw: "havaiji",
      he: "heprea",
      hi: "hindi",
      hmn: "hmong",
      nl: "hollanti",
      ig: "igbo",
      ga: "iiri",
      ilo: "ilokano",
      id: "indonesia",
      is: "islanti",
      it: "italia",
      jv: "jaava",
      ja: "japani",
      yi: "jiddiš",
      yo: "joruba",
      kn: "kannada",
      ca: "katalaani",
      kk: "kazakki",
      qu: "ketšua",
      km: "khmer",
      "zh-TW": "kiina (perinteinen)",
      "zh-CN": "kiina (yksinkertaistettu)",
      rw: "kinyarwanda",
      gom: "konkani",
      ko: "korea",
      co: "korsika",
      el: "kreikka",
      kri: "krio",
      hr: "kroatia",
      ku: "kurdi (kurmandži)",
      ckb: "kurdi (soranî)",
      cy: "kymri",
      ky: "kyrgyz",
      lo: "lao",
      la: "latina",
      lv: "latvia",
      lt: "liettua",
      ln: "lingala",
      lg: "luganda",
      lb: "luxemburg",
      mai: "maithili",
      mk: "makedonia",
      mg: "malagasy",
      ms: "malaiji",
      ml: "malayalam",
      mt: "malta",
      mi: "maori",
      mr: "marathi",
      "mni-Mtei": "meiteilon (manipuri)",
      lus: "mizo",
      mn: "mongolia",
      ne: "nepali",
      ny: "njandža",
      no: "norja",
      or: "odia (orija)",
      om: "oromo",
      ps: "pashto",
      fa: "persia",
      pt: "portugali",
      pa: "punjabi",
      pl: "puola",
      fr: "ranska",
      ro: "romania",
      sv: "ruotsi",
      de: "saksa",
      sm: "samoa",
      sa: "sanskriitti",
      nso: "sepedi",
      sr: "serbia",
      st: "sesotho",
      sn: "shona",
      sd: "sindhi",
      si: "sinhali",
      gd: "skottigaeli",
      sk: "slovakia",
      sl: "slovenia",
      so: "somali",
      su: "sundaneesi",
      fi: "suomi",
      sw: "swahili",
      tg: "tadžikki",
      tl: "tagalog",
      ta: "tamili",
      da: "tanska",
      tt: "tataari",
      te: "telugu",
      th: "thai",
      ti: "tigrinja",
      cs: "tsekki",
      ts: "tsonga",
      tr: "turkki",
      tk: "turkmeeni",
      ak: "twi",
      ug: "uiguuri",
      uk: "ukraina",
      hu: "unkari",
      ur: "urdu",
      uz: "uzbekki",
      be: "valkovenäjä",
      ru: "venäjä",
      vi: "vietnam",
      et: "viro",
      xh: "xhosa",
      zu: "zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    fr: {
      af: "afrikaans",
      sq: "albanais",
      de: "allemand",
      am: "amharique",
      en: "anglais",
      ar: "arabe",
      hy: "arménien",
      as: "assamais",
      ay: "aymara",
      az: "azéri",
      bm: "bambara",
      eu: "basque",
      bn: "bengali",
      bho: "bhodjpouri",
      be: "biélorusse",
      my: "birman",
      bs: "bosniaque",
      bg: "bulgare",
      ca: "catalan",
      ceb: "cebuano",
      ny: "chichewa",
      "zh-CN": "chinois (simplifié)",
      "zh-TW": "chinois (traditionnel)",
      si: "cingalais",
      ko: "coréen",
      co: "corse",
      ht: "créole haïtien",
      hr: "croate",
      da: "danois",
      dv: "divéhi",
      doi: "dogri",
      es: "espagnol",
      eo: "espéranto",
      et: "estonien",
      ee: "ewe",
      fi: "finnois",
      fr: "français",
      fy: "frison",
      gd: "gaélique (écosse)",
      gl: "galicien",
      cy: "gallois",
      ka: "géorgien",
      el: "grec",
      gn: "guarani",
      gu: "gujarati",
      ha: "haoussa",
      haw: "hawaïen",
      he: "hébreu",
      hi: "hindi",
      hmn: "hmong",
      hu: "hongrois",
      ig: "igbo",
      ilo: "ilocano",
      id: "indonésien",
      ga: "irlandais",
      is: "islandais",
      it: "italien",
      ja: "japonais",
      jv: "javanais",
      kn: "kannada",
      kk: "kazakh",
      km: "khmer",
      rw: "kinyarwanda",
      ky: "kirghiz",
      gom: "konkani",
      kri: "krio",
      ku: "kurde (kurmandji)",
      ckb: "kurde (sorani)",
      lo: "laotien",
      la: "latin",
      lv: "letton",
      ln: "lingala",
      lt: "lituanien",
      lg: "luganda",
      lb: "luxembourgeois",
      mk: "macédonien",
      mai: "maïthili",
      ms: "malaisien",
      ml: "malayalam",
      mg: "malgache",
      mt: "maltais",
      mi: "maori",
      mr: "marathi",
      "mni-Mtei": "meitei (manipuri)",
      lus: "mizo",
      mn: "mongol",
      nl: "néerlandais",
      ne: "népalais",
      no: "norvégien",
      or: "odia (oriya)",
      om: "oromo",
      ug: "ouïgour",
      uz: "ouzbek",
      ps: "pachtô",
      pa: "panjabi",
      fa: "persan",
      tl: "philippin",
      pl: "polonais",
      pt: "portugais",
      qu: "quechua",
      ro: "roumain",
      ru: "russe",
      sm: "samoan",
      sa: "sanscrit",
      nso: "sepedi",
      sr: "serbe",
      st: "sesotho",
      sn: "shona",
      sd: "sindhî",
      sk: "slovaque",
      sl: "slovène",
      so: "somali",
      su: "soundanais",
      sv: "suédois",
      sw: "swahili",
      tg: "tadjik",
      ta: "tamoul",
      tt: "tatar",
      cs: "tchèque",
      te: "telugu",
      th: "thaï",
      ti: "tigrigna",
      ts: "tsonga",
      tr: "turc",
      tk: "turkmène",
      ak: "twi",
      uk: "ukrainien",
      ur: "urdu",
      vi: "vietnamien",
      xh: "xhosa",
      yi: "yiddish",
      yo: "yorouba",
      zu: "zoulou",
      ba: "bashkir",
      cv: "chuvash",
      mrj: "hill mari",
      kazlat: "kazakh (latin)",
      mhr: "mari",
      pap: "papiamento",
      udm: "udmurt",
      uzbcyr: "uzbek (cyrillic)",
      sah: "yakut",
    },
    de: {
      af: "Afrikaans",
      sq: "Albanisch",
      am: "Amharisch",
      ar: "Arabisch",
      hy: "Armenisch",
      az: "Aserbaidschanisch",
      as: "Assamesisch",
      ay: "Aymara",
      bm: "Bambara",
      eu: "Baskisch",
      be: "Belarussisch",
      bn: "Bengalisch",
      bho: "Bhojpuri",
      my: "Birmanisch",
      bs: "Bosnisch",
      bg: "Bulgarisch",
      ceb: "Cebuano",
      ny: "Chichewa",
      "zh-TW": "Chinesisch (traditionell)",
      "zh-CN": "Chinesisch (vereinfacht)",
      da: "Dänisch",
      de: "Deutsch",
      dv: "Dhivehi",
      doi: "Dogri",
      en: "Englisch",
      eo: "Esperanto",
      et: "Estnisch",
      ee: "Ewe",
      tl: "Filipino",
      fi: "Finnisch",
      fr: "Französisch",
      fy: "Friesisch",
      gl: "Galizisch",
      ka: "Georgisch",
      el: "Griechisch",
      gn: "Guarani",
      gu: "Gujarati",
      ht: "Haitianisch",
      ha: "Hausa",
      haw: "Hawaiisch",
      he: "Hebräisch",
      hi: "Hindi",
      hmn: "Hmong",
      ig: "Igbo",
      ilo: "Ilokano",
      id: "Indonesisch",
      ga: "Irisch",
      is: "Isländisch",
      it: "Italienisch",
      ja: "Japanisch",
      jv: "Javanisch",
      yi: "Jiddisch",
      kn: "Kannada",
      kk: "Kasachisch",
      ca: "Katalanisch",
      km: "Khmer",
      rw: "Kinyarwanda",
      ky: "Kirgisisch",
      gom: "Konkani",
      ko: "Koreanisch",
      co: "Korsisch",
      kri: "Krio",
      hr: "Kroatisch",
      ku: "Kurdisch (Kurmandschi)",
      ckb: "Kurdisch (Sorani)",
      lo: "Lao",
      la: "Lateinisch",
      lv: "Lettisch",
      ln: "Lingala",
      lt: "Litauisch",
      lg: "Luganda",
      lb: "Luxemburgisch",
      mai: "Maithili",
      mg: "Malagasy",
      ml: "Malayalam",
      ms: "Malaysisch",
      mt: "Maltesisch",
      mi: "Maori",
      mr: "Marathi",
      mk: "Mazedonisch",
      "mni-Mtei": "Meitei (Manipuri)",
      lus: "Mizo",
      mn: "Mongolisch",
      ne: "Nepalesisch",
      nl: "Niederländisch",
      no: "Norwegisch",
      or: "Odia (Oriya)",
      om: "Oromo",
      ps: "Paschtu",
      fa: "Persisch",
      pl: "Polnisch",
      pt: "Portugiesisch",
      pa: "Punjabi",
      qu: "Quechua",
      ro: "Rumänisch",
      ru: "Russisch",
      sm: "Samoanisch",
      sa: "Sanskrit",
      gd: "Schottisch-Gälisch",
      sv: "Schwedisch",
      nso: "Sepedi",
      sr: "Serbisch",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindhi",
      si: "Singhalesisch",
      sk: "Slowakisch",
      sl: "Slowenisch",
      so: "Somali",
      es: "Spanisch",
      su: "Sundanesisch",
      sw: "Swahili",
      tg: "Tadschikisch",
      ta: "Tamil",
      tt: "Tatarisch",
      te: "Telugu",
      th: "Thailändisch",
      ti: "Tigrinya",
      cs: "Tschechisch",
      ts: "Tsonga",
      tr: "Türkisch",
      tk: "Turkmenisch",
      ak: "Twi",
      ug: "Uigurisch",
      uk: "Ukrainisch",
      hu: "Ungarisch",
      ur: "Urdu",
      uz: "Usbekisch",
      vi: "Vietnamesisch",
      cy: "Walisisch",
      xh: "Xhosa",
      yo: "Yoruba",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    el: {
      en: "Αγγλικά",
      az: "Αζερμπαϊτζανικά",
      ay: "Αϊμάρα",
      sq: "Αλβανικά",
      am: "Αμχαρικά",
      ar: "Αραβικά",
      hy: "Αρμενικά",
      as: "Ασαμικά",
      af: "Αφρικάανς",
      eu: "Βασκικά",
      bn: "Βεγγαλική",
      vi: "Βιετναμεζικά",
      my: "Βιρμανικά",
      bs: "Βοσνιακά",
      bg: "Βουλγαρικά",
      gd: "Γαελικά Σκοτίας",
      gl: "Γαλικιακά",
      fr: "Γαλλικά",
      de: "Γερμανικά",
      ka: "Γεωργιανά",
      yi: "Γίντις",
      yo: "Γιορούμπα",
      gn: "Γκουαρανί",
      gu: "Γκουτζαρατικά",
      da: "Δανικά",
      he: "Εβραϊκά",
      el: "Ελληνικά",
      ee: "Έουε",
      et: "Εσθονικά",
      eo: "Εσπεράντο",
      xh: "Ζόσα",
      zu: "Ζουλού",
      ja: "Ιαπωνικά",
      ig: "Ίγκμπο",
      ilo: "Ιλοκάνο",
      id: "Ινδονησιακά",
      ga: "Ιρλανδικά",
      is: "Ισλανδικά",
      es: "Ισπανικά",
      it: "Ιταλικά",
      kk: "Καζακστανικά",
      kn: "Κανάντα",
      ca: "Καταλανικά",
      qu: "Κέτσουα",
      "zh-CN": "Κινεζικά (Απλοποιημένα)",
      "zh-TW": "Κινεζικά (Παραδοσιακά)",
      rw: "Κινιαρουάντα",
      ky: "Κιργιζιανά",
      gom: "Κονκανικά",
      ko: "Κορεατικά",
      co: "Κορσικανικά",
      ku: "Κουρδικά (Κουρμαντζί)",
      ckb: "Κουρδικά (Σορανί)",
      ht: "Κρεόλ Αϊτής",
      kri: "Κρίο",
      hr: "Κροατικά",
      lo: "Λάο",
      la: "Λατινικά",
      lv: "Λετονικά",
      be: "Λευκορωσικά",
      lt: "Λιθουανικά",
      ln: "Λινγκάλα",
      lg: "Λουγκάντα",
      lb: "Λουξεμβουργιανά",
      mai: "Μαϊτίλι",
      mg: "Μαλαγάσι",
      ml: "Μαλαγιάλαμ",
      ms: "Μαλέι",
      mt: "Μαλτεζικά",
      mi: "Μαορί",
      mr: "Μαραθικά",
      "mni-Mtei": "Μεϊτέιλον (Μανιπούρι)",
      lus: "Μίζο",
      mn: "Μογγολικά",
      bm: "Μπαμπάρα",
      bho: "Μποτζπούρι",
      ne: "Νεπαλικά",
      no: "Νορβηγικά",
      dv: "Ντιβέχι",
      doi: "Ντογκρί",
      nl: "Ολλανδικά",
      or: "Όντια (Ορίγια)",
      om: "Ορομό",
      cy: "Ουαλικά",
      hu: "Ουγγρικά",
      uz: "Ουζμπεκικά",
      ug: "Ουιγούρ",
      uk: "Ουκρανικά",
      ur: "Ουρντού",
      pa: "Παντζάμπι",
      ps: "Πάστο",
      fa: "Περσικά",
      pl: "Πολωνικά",
      pt: "Πορτογαλικά",
      ro: "Ρουμανικά",
      ru: "Ρωσικά",
      sm: "Σαμοανικά",
      sa: "Σανσκριτικά",
      ceb: "Σεμπουάνο",
      nso: "Σεπέντι",
      sr: "Σερβικά",
      st: "Σεσότο",
      sd: "Σίντι",
      si: "Σινχάλα",
      mk: "Σλαβομακεδονικά",
      sk: "Σλοβακικά",
      sl: "Σλοβενικά",
      so: "Σομαλικά",
      sn: "Σόνα",
      sw: "Σουαχίλι",
      sv: "Σουηδικά",
      su: "Σούντα",
      tg: "Ταζικιστανικά",
      th: "Ταϊλανδεζικά",
      ta: "Ταμίλ",
      tt: "Ταταρικά",
      te: "Τελούγκου",
      jv: "Τζαβανεζικά",
      ti: "Τιγρινιακά",
      ak: "Τουί",
      tr: "Τουρκικά",
      tk: "Τουρκμενικά",
      cs: "Τσεχικά",
      ny: "Τσιτσέουα",
      ts: "Τσόνγκα",
      tl: "Φιλιππινέζικα",
      fi: "Φινλανδικά",
      fy: "Φριζιανά",
      haw: "Χαβαϊκά",
      ha: "Χάουσα",
      hi: "Χίντι",
      km: "Χμερ",
      hmn: "Χμονγκ",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    he: {
      or: "אודיה (אוריה)",
      ee: "אווה",
      uz: "אוזבקית",
      ug: "אויגור",
      uk: "אוקראינית",
      ur: "אורדו",
      om: "אורומו",
      az: "אזרית",
      ig: "איגבו",
      it: "איטלקית",
      ay: "איימרה",
      ilo: "אילוקאנו",
      id: "אינדונזית",
      is: "איסלנדית",
      ga: "אירית",
      sq: "אלבנית",
      am: "אמהרית",
      en: "אנגלית",
      as: "אסאמית",
      et: "אסטונית",
      eo: "אספרנטו",
      af: "אפריקאנס",
      hy: "ארמנית",
      bm: "באמבארה",
      eu: "באסקית",
      bho: "בוג'פורית",
      bg: "בולגרית",
      bs: "בוסנית",
      my: "בורמזית",
      be: "בלארוסית",
      bn: "בנגלית",
      jv: "ג'אווה",
      ka: "גאורגית",
      gn: "גוארני",
      gu: "גוג'ראטית",
      gl: "גליציאנית",
      de: "גרמנית",
      doi: "דוגרי",
      dv: "דיווהי",
      da: "דנית",
      ha: "האוסה",
      haw: "הוואית",
      nl: "הולנדית",
      hu: "הונגרית",
      hi: "הינדי",
      hmn: "המונג",
      cy: "וולשית",
      vi: "וייטנאמית",
      zu: "זולו",
      km: "חמר",
      tg: "טג'יקית",
      ak: "טווי",
      tr: "טורקית",
      tk: "טורקמנית",
      tt: "טטארית",
      te: "טלוגו",
      ta: "טמילית",
      ts: "טסונגה",
      el: "יוונית",
      yo: "יורובה",
      yi: "יידיש",
      ja: "יפנית",
      ku: "כורדית (כורמנג'ית)",
      ckb: "כורדית (סורנית)",
      lo: "לאו",
      lg: "לוגאנדה",
      lb: "לוקסמבורגית",
      lv: "לטבית",
      la: "לטינית",
      lt: "ליטאית",
      ln: "לינגאלה",
      mi: "מאורית",
      mai: "מאיטילי",
      mn: "מונגולית",
      lus: "מיזו",
      "mni-Mtei": "מייטילון (מניפורית)",
      ml: "מלאיאלאם",
      ms: "מלאית",
      mg: "מלגשית",
      mt: "מלטית",
      mk: "מקדונית",
      mr: "מראטהית",
      no: "נורווגית",
      ne: "נפאלית",
      ceb: "סבואנו",
      sw: "סוואהילית",
      so: "סומלית",
      su: "סונדית",
      sd: "סינדהי",
      si: "סינהלית",
      "zh-TW": "סינית (מסורתית)",
      "zh-CN": "‏סינית (פשוטה)",
      sl: "סלובנית",
      sk: "סלובקית",
      sm: "סמואית",
      sa: "סנסקריט",
      st: "ססוטו",
      nso: "ספדי",
      es: "ספרדית",
      gd: "סקוטית גאלית",
      sr: "סרבית",
      he: "עברית",
      ar: "ערבית",
      pl: "פולנית",
      pa: "פונג'אבית",
      pt: "פורטוגזית",
      tl: "פיליפינית",
      fi: "פינית",
      fy: "פריזית",
      fa: "פרסית",
      ps: "פשטו",
      ny: "צ'יצ'ווה",
      cs: "צ'כית",
      fr: "צרפתית",
      kn: "קאנאדה",
      gom: "קונקאני",
      xh: "קוסה",
      ko: "קוריאנית",
      co: "קורסיקאית",
      kk: "קזאחית",
      ca: "קטלאנית",
      rw: "קינירואנדה",
      ky: "קירגיזית",
      qu: "קצ'ואה",
      hr: "קרואטית",
      ht: "קריאולית האיטית",
      kri: "קריו",
      ro: "רומנית",
      ru: "רוסית",
      sv: "שוודית",
      sn: "שונה",
      th: "תאית",
      ti: "תיגרינית",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    hi: {
      en: "अंग्रेज़ी",
      az: "अज़रबैजानी",
      af: "अफ़्रीकांस",
      ar: "अरबी",
      sq: "अल्बेनियन",
      as: "असमिया",
      is: "आइसलैंडिक",
      ay: "आयमारा",
      ga: "आयरिश",
      hy: "आर्मेनियन",
      id: "इंडोनेशियन",
      ig: "इग्बो",
      it: "इटैलियन",
      ilo: "इलोकानो",
      uz: "उज़्बेक",
      ur: "उर्दू",
      ee: "एवे",
      et: "एस्तोनियन",
      eo: "एस्पेरांटो",
      am: "ऐम्हेरिक",
      or: "ओडिया (उड़िया)",
      om: "ओरोमो",
      kk: "कज़ाख़",
      kn: "कन्नड़",
      rw: "किनयारवांडा",
      ky: "किरगिज़",
      ku: "कुर्दिश (कुर्मांजी)",
      ckb: "कुर्दिश (सोरानी)",
      qu: "केचुवा",
      ca: "कैटेलन",
      gom: "कोंकणी",
      ko: "कोरियन",
      co: "कोर्सिकन",
      xh: "कोसा",
      kri: "क्रीओ",
      hr: "क्रोएशियन",
      km: "खमेर",
      gn: "गुआरनी",
      gu: "गुजराती",
      gl: "गैलिशियन",
      el: "ग्रीक",
      ny: "चिचेवा",
      "zh-TW": "चीनी (पारंपरिक)",
      "zh-CN": "चीनी (सरल)",
      cs: "चेक",
      de: "जर्मन",
      ja: "जापानी",
      zu: "ज़ुलु",
      jv: "जैवेनीज़",
      ka: "जॉर्जियन",
      nl: "डच",
      da: "डैनिश",
      doi: "डोगरी",
      ta: "तमिल",
      tg: "ताजिक",
      tt: "तातार",
      ti: "तिग्रिन्या",
      tr: "तुर्क",
      tk: "तुर्कमेन",
      te: "तेलुगु",
      ak: "त्वी",
      th: "थाई",
      dv: "दिवेही",
      ne: "नेपाली",
      no: "नॉर्वेजियन",
      pa: "पंजाबी",
      ps: "पश्तो",
      pt: "पुर्तगाली",
      pl: "पोलिश",
      fa: "फारसी",
      fi: "फ़िनिश",
      tl: "फ़िलिपीनो",
      fy: "फ़्रिसियन",
      fr: "फ़्रेंच",
      my: "बर्मी",
      bn: "बांग्ला",
      bm: "बांबारा",
      bg: "बुल्गारियन",
      be: "बेलारूसीयन",
      eu: "बैस्क",
      bs: "बोस्नियन",
      bho: "भोजपुरी",
      mn: "मंगोलियन",
      mr: "मराठी",
      ms: "मलय",
      ml: "मलयालम",
      mi: "माऔरी",
      mt: "माल्टी",
      lus: "मिज़ो",
      mg: "मेलागासी",
      mk: "मेसीडोनियन",
      "mni-Mtei": "मैतैलोन (मणिपुरी)",
      mai: "मैथिली",
      yi: "यिडिश",
      uk: "यूक्रेनियन",
      yo: "योरुबा",
      ru: "रूसी",
      ro: "रोमेनियन",
      lb: "लक्ज़मबर्गिश",
      lo: "लाओ",
      lv: "लातवियन",
      ln: "लिंगाला",
      lt: "लिथुआनियन",
      lg: "लुगांडा",
      la: "लैटिन",
      vi: "वियतनामी",
      ug: "वीगर",
      cy: "वेल्श",
      sn: "शोना",
      su: "संडनीज़",
      sa: "संस्कृत",
      sm: "समोआई",
      sr: "सर्बियाई",
      si: "सिंहला",
      sd: "सिन्धी",
      nso: "सेपेडी",
      ceb: "सेबुआनो",
      st: "सेसोथो",
      so: "सोमाली",
      ts: "सौंगा",
      gd: "स्कॉट्स गेलिक",
      es: "स्पैनिश",
      sk: "स्लोवाक",
      sl: "स्लोवेनियन",
      sw: "स्वाहिली",
      sv: "स्वीडिश",
      hu: "हंगरियन",
      hmn: "हमॉन्ग",
      haw: "हवायन",
      hi: "हिन्दी",
      he: "हीब्रू",
      ht: "हैतियन क्रिओल",
      ha: "हौसा",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    hu: {
      af: "afrikaans",
      ay: "ajmara",
      sq: "albán",
      am: "amhara",
      en: "angol",
      ar: "arab",
      as: "asszámi",
      az: "azeri",
      bm: "bambara",
      eu: "baszk",
      be: "belorusz",
      bn: "bengáli",
      bho: "bhodzspuri",
      bg: "bolgár",
      bs: "bosnyák",
      my: "burmai",
      ceb: "cebuano",
      ny: "chichewa",
      cs: "cseh",
      da: "dán",
      dv: "divehi (maldív)",
      doi: "dogri",
      eo: "eszperantó",
      et: "észt",
      ee: "ewe",
      tl: "filippínó",
      fi: "finn",
      fr: "francia",
      fy: "fríz",
      gl: "galíciai",
      el: "görög",
      ka: "grúz",
      gn: "guarani",
      gu: "gudzsaráti",
      ht: "haiti kreol",
      ha: "hausza",
      haw: "hawaii",
      he: "héber",
      hi: "hindi",
      hmn: "hmong",
      nl: "holland",
      hr: "horvát",
      ig: "igbo",
      ilo: "ilokano",
      id: "indonéz",
      ga: "ír",
      is: "izlandi",
      ja: "japán",
      jv: "jávai",
      yi: "jiddis",
      yo: "joruba",
      kn: "kannada",
      ca: "katalán",
      kk: "kazah",
      qu: "kecsua",
      km: "khmer",
      "zh-CN": "kínai (egyszerűsített)",
      "zh-TW": "kínai (hagyományos)",
      rw: "kinyarwanda",
      ky: "kirgiz",
      gom: "konkani",
      ko: "koreai",
      co: "korzikai",
      kri: "krio",
      ku: "kurd (kurmanji)",
      ckb: "kurd (szoráni)",
      lo: "lao",
      la: "latin",
      pl: "lengyel",
      lv: "lett",
      ln: "lingala",
      lt: "litván",
      lg: "luganda",
      lb: "luxemburgi",
      mk: "macedón",
      hu: "magyar",
      mai: "maithili",
      mg: "malagaszi",
      ms: "maláj",
      ml: "malajálam",
      mt: "máltai",
      mi: "maori",
      mr: "maráthi",
      "mni-Mtei": "meiteilon (manipuri)",
      lus: "mizo",
      mn: "mongol",
      de: "német",
      ne: "nepáli",
      no: "norvég",
      or: "odia (orija)",
      it: "olasz",
      om: "oromo",
      ru: "orosz",
      hy: "örmény",
      pa: "pandzsábi",
      ps: "pastu",
      fa: "perzsa",
      pt: "portugál",
      ro: "román",
      nso: "sepedi",
      sn: "shona",
      gd: "skót-gael",
      es: "spanyol",
      sv: "svéd",
      sm: "szamoai",
      sa: "szanszkrit",
      sr: "szerb",
      sd: "szindhi",
      si: "szinhala",
      sk: "szlovák",
      sl: "szlovén",
      so: "szomáli",
      st: "szoto",
      sw: "szuahéli",
      su: "szundanéz",
      tg: "tadzsik",
      ta: "tamil",
      tt: "tatár",
      te: "telugu",
      th: "thai",
      ti: "tigrinya",
      tr: "török",
      ts: "tsonga",
      tk: "türkmén",
      ak: "twi",
      ug: "ujgur",
      uk: "ukrán",
      ur: "urdu",
      uz: "üzbég",
      vi: "vietnami",
      cy: "walesi",
      xh: "xhosa",
      zu: "zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    it: {
      af: "Afrikaans",
      sq: "Albanese",
      am: "Amarico",
      ar: "Arabo",
      hy: "Armeno",
      as: "Assamese",
      ay: "Aymara",
      az: "Azero",
      bm: "Bambara",
      eu: "Basco",
      bn: "Bengalese",
      bho: "Bhojpuri",
      be: "Bielorusso",
      my: "Birmano",
      bs: "Bosniaco",
      bg: "Bulgaro",
      ca: "Catalano",
      ceb: "Cebuano",
      cs: "Ceco",
      ny: "Chichewa",
      ky: "Chirghiso",
      ak: "Ci",
      "zh-CN": "Cinese (semplificato)",
      "zh-TW": "Cinese (tradizionale)",
      ko: "Coreano",
      co: "Corso",
      ht: "Creolo haitiano",
      hr: "Croato",
      ku: "Curdo (Kurmanji)",
      ckb: "Curdo (Sorani)",
      da: "Danese",
      dv: "Dhivehi",
      doi: "Dogri",
      he: "Ebraico",
      eo: "Esperanto",
      et: "Estone",
      ee: "Ewe",
      tl: "Filippino",
      fi: "Finlandese",
      fr: "Francese",
      fy: "Frisone",
      gd: "Gaelico scozzese",
      gl: "Galiziano",
      cy: "Gallese",
      ka: "Georgiano",
      ja: "Giapponese",
      jv: "Giavanese",
      el: "Greco",
      gn: "Guaraní",
      gu: "Gujarati",
      ha: "Hausa",
      haw: "Hawaiano",
      hi: "Hindi",
      hmn: "Hmong",
      ig: "Igbo",
      ilo: "Ilocano",
      id: "Indonesiano",
      en: "Inglese",
      ga: "Irlandese",
      is: "Islandese",
      it: "Italiano",
      kn: "Kannada",
      kk: "Kazako",
      km: "Khmer",
      rw: "Kinyarwanda",
      gom: "Konkani",
      kri: "Krio",
      lo: "Lao",
      la: "Latino",
      lv: "Lettone",
      ln: "Lingala",
      lt: "Lituano",
      lg: "Luganda",
      lb: "Lussemburghese",
      mk: "Macedone",
      mai: "Maithili",
      ml: "Malayalam",
      ms: "Malese",
      mg: "Malgascio",
      mt: "Maltese",
      mi: "Maori",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (Manipuri)",
      lus: "Mizo",
      mn: "Mongolo",
      ne: "Nepalese",
      no: "Norvegese",
      or: "Odia (Oriya)",
      nl: "Olandese",
      om: "Oromo",
      ps: "Pashto",
      fa: "Persiano",
      pl: "Polacco",
      pt: "Portoghese",
      pa: "Punjabi",
      qu: "Quechua",
      ro: "Rumeno",
      ru: "Russo",
      sm: "Samoano",
      sa: "Sanscrito",
      nso: "Sepedi",
      sr: "Serbo",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindhi",
      si: "Singalese",
      sk: "Slovacco",
      sl: "Sloveno",
      so: "Somalo",
      es: "Spagnolo",
      su: "Sundanese",
      sv: "Svedese",
      sw: "Swahili",
      tg: "Tagico",
      ta: "Tamil",
      tt: "Tataro",
      de: "Tedesco",
      te: "Telugu",
      th: "Thai",
      ti: "Tigrino",
      ts: "Tsonga",
      tr: "Turco",
      tk: "Turcomanno",
      uk: "Ucraino",
      ug: "Uiguro",
      hu: "Ungherese",
      ur: "Urdu",
      uz: "Uzbeco",
      vi: "Vietnamita",
      xh: "Xhosa",
      yi: "Yiddish",
      yo: "Yoruba",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    ja: {
      is: "アイスランド語",
      ay: "アイマラ語",
      ga: "アイルランド語",
      az: "アゼルバイジャン語",
      as: "アッサム語",
      af: "アフリカーンス語",
      am: "アムハラ語",
      ar: "アラビア語",
      sq: "アルバニア語",
      hy: "アルメニア語",
      it: "イタリア語",
      yi: "イディッシュ語",
      ig: "イボ語",
      ilo: "イロカノ語",
      id: "インドネシア語",
      ug: "ウイグル語",
      cy: "ウェールズ語",
      uk: "ウクライナ語",
      uz: "ウズベク語",
      ur: "ウルドゥ語",
      ee: "エウェ語",
      et: "エストニア語",
      eo: "エスペラント語",
      nl: "オランダ語",
      or: "オリヤ語",
      om: "オロモ語",
      kk: "カザフ語",
      ca: "カタルーニャ語",
      gl: "ガリシア語",
      kn: "カンナダ語",
      rw: "キニヤルワンダ語",
      el: "ギリシャ語",
      ky: "キルギス語",
      gn: "グアラニ語",
      gu: "グジャラート語",
      km: "クメール語",
      kri: "クリオ語",
      ku: "クルド語（クルマンジー）",
      ckb: "クルド語（ソラニー）",
      hr: "クロアチア語",
      qu: "ケチュア語",
      xh: "コーサ語",
      co: "コルシカ語",
      gom: "コンカニ語",
      sm: "サモア語",
      sa: "サンスクリット語",
      jv: "ジャワ語",
      ka: "ジョージア語（グルジア語）",
      sn: "ショナ語",
      sd: "シンド語",
      si: "シンハラ語",
      sv: "スウェーデン語",
      zu: "ズールー語",
      gd: "スコットランド ゲール語",
      es: "スペイン語",
      sk: "スロバキア語",
      sl: "スロベニア語",
      sw: "スワヒリ語",
      su: "スンダ語",
      ceb: "セブアノ語",
      nso: "セペディ語",
      sr: "セルビア語",
      st: "ソト語",
      so: "ソマリ語",
      th: "タイ語",
      tl: "タガログ語",
      tg: "タジク語",
      tt: "タタール語",
      ta: "タミル語",
      cs: "チェコ語",
      ny: "チェワ語",
      ts: "ツォンガ語",
      ti: "ティグリニャ語",
      dv: "ディベヒ語",
      te: "テルグ語",
      da: "デンマーク語",
      de: "ドイツ語",
      ak: "トゥイ語",
      doi: "ドグリ語",
      tk: "トルクメン語",
      tr: "トルコ語",
      ne: "ネパール語",
      no: "ノルウェー語",
      ht: "ハイチ語",
      ha: "ハウサ語",
      ps: "パシュト語",
      eu: "バスク語",
      haw: "ハワイ語",
      hu: "ハンガリー語",
      pa: "パンジャブ語",
      bm: "バンバラ語",
      hi: "ヒンディー語",
      fi: "フィンランド語",
      fr: "フランス語",
      fy: "フリジア語",
      bg: "ブルガリア語",
      vi: "ベトナム語",
      he: "ヘブライ語",
      be: "ベラルーシ語",
      fa: "ペルシャ語",
      bn: "ベンガル語",
      bho: "ボージュプリー語",
      pl: "ポーランド語",
      bs: "ボスニア語",
      pt: "ポルトガル語",
      mai: "マイティリー語",
      mi: "マオリ語",
      mk: "マケドニア語",
      mr: "マラーティー語",
      mg: "マラガシ語",
      ml: "マラヤーラム語",
      mt: "マルタ語",
      ms: "マレー語",
      lus: "ミゾ語",
      my: "ミャンマー語（ビルマ語）",
      "mni-Mtei": "メイテイ語（マニプリ語）",
      mn: "モンゴル語",
      hmn: "モン語",
      yo: "ヨルバ語",
      lo: "ラオ語",
      la: "ラテン語",
      lv: "ラトビア語",
      lt: "リトアニア語",
      ln: "リンガラ語",
      ro: "ルーマニア語",
      lg: "ルガンダ語",
      lb: "ルクセンブルク語",
      ru: "ロシア語",
      en: "英語",
      ko: "韓国語",
      "zh-CN": "中国語（簡体）",
      "zh-TW": "中国語（繁体）",
      ja: "日本語",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    ko: {
      gl: "갈리시아어",
      gn: "과라니어",
      gu: "구자라트어",
      el: "그리스어",
      nl: "네덜란드어",
      ne: "네팔어",
      no: "노르웨이어",
      da: "덴마크어",
      doi: "도그리어",
      de: "독일어",
      dv: "디베히어",
      lo: "라오어",
      lv: "라트비아어",
      la: "라틴어",
      ru: "러시아어",
      lg: "루간다어",
      ro: "루마니아어",
      lb: "룩셈부르크어",
      lt: "리투아니아어",
      ln: "링갈라어",
      mr: "마라티어",
      mi: "마오리어",
      mai: "마이틸어",
      mk: "마케도니아어",
      mg: "말라가시어",
      ml: "말라얄람어",
      ms: "말레이어",
      "mni-Mtei": "메이테이어(마니푸르어)",
      mt: "몰타어",
      mn: "몽골어",
      hmn: "몽어",
      my: "미얀마어(버마어)",
      lus: "미조어",
      eu: "바스크어",
      bm: "밤바라어",
      vi: "베트남어",
      be: "벨라루스어",
      bn: "벵골어",
      bs: "보스니아어",
      bho: "보즈푸리어",
      nso: "북소토어",
      bg: "불가리아어",
      sm: "사모아어",
      sa: "산스크리트",
      sr: "세르비아어",
      ceb: "세부아노어",
      st: "세소토어",
      so: "소말리아어",
      sn: "쇼나어",
      su: "순다어",
      sw: "스와힐리어",
      sv: "스웨덴어",
      gd: "스코틀랜드 게일어",
      es: "스페인어",
      sk: "슬로바키아어",
      sl: "슬로베니아어",
      sd: "신디어",
      si: "싱할라어",
      ar: "아랍어",
      hy: "아르메니아어",
      as: "아삼어",
      ay: "아이마라어",
      is: "아이슬란드어",
      ht: "아이티 크리올어",
      ga: "아일랜드어",
      az: "아제르바이잔어",
      af: "아프리칸스어",
      sq: "알바니아어",
      am: "암하라어",
      et: "에스토니아어",
      eo: "에스페란토어",
      ee: "에웨어",
      en: "영어",
      om: "오로모어",
      or: "오리야어",
      yo: "요루바어",
      ur: "우르두어",
      uz: "우즈베크어",
      uk: "우크라이나어",
      cy: "웨일즈어",
      ug: "위구르어",
      ig: "이그보어",
      yi: "이디시어",
      it: "이탈리아어",
      id: "인도네시아어",
      ilo: "일로카노어",
      ja: "일본어",
      jv: "자바어",
      ka: "조지아어",
      zu: "줄루어",
      "zh-CN": "중국어(간체)",
      "zh-TW": "중국어(번체)",
      ny: "체와어",
      cs: "체코어",
      ts: "총가어",
      kk: "카자흐어",
      ca: "카탈로니아어",
      kn: "칸나다어",
      qu: "케추아어",
      co: "코르시카어",
      xh: "코사어",
      gom: "콘칸어",
      ckb: "쿠르드어(소라니)",
      ku: "쿠르드어(쿠르만지)",
      hr: "크로아티아어",
      kri: "크리오어",
      km: "크메르어",
      rw: "키냐르완다어",
      ky: "키르기스어",
      ta: "타밀어",
      tg: "타지크어",
      tt: "타타르어",
      th: "태국어",
      tr: "터키어",
      te: "텔루구어",
      tk: "투르크멘어",
      ak: "트위어",
      ti: "티그리냐어",
      ps: "파슈토어",
      pa: "펀자브어",
      fa: "페르시아어",
      pt: "포르투갈어",
      pl: "폴란드어",
      fr: "프랑스어",
      fy: "프리지아어",
      fi: "핀란드어",
      tl: "필리핀어",
      haw: "하와이어",
      ha: "하우사어",
      ko: "한국어",
      hu: "헝가리어",
      he: "히브리어",
      hi: "힌디어",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    fa: {
      az: "آذرباﻳﺠﺎﻧﻰ",
      as: "آسامی",
      sq: "آلبانیایی",
      de: "آلمانی",
      ay: "آیمارا",
      ur: "اردو",
      hy: "ارمنی",
      uz: "ازبکی",
      es: "اسپانیایی",
      eo: "اسپرانتو",
      et: "استونيايی",
      sk: "اسلواکی",
      sl: "اسلونیایی",
      af: "افریکانس",
      uk: "اکراينی",
      am: "امهری",
      id: "اندونزيايی",
      en: "انگلیسی",
      or: "اودیه (اوریه)",
      om: "اورومو",
      ee: "اوه‌ای",
      ug: "اویغوری",
      it: "ایتالیایی",
      ga: "ایرلندی",
      is: "ايسلندی",
      ig: "ایگبو",
      ilo: "ایلوکانو",
      eu: "باسکی",
      bm: "بامبارا",
      my: "برمه‌ای",
      be: "بلاروسی",
      bg: "بلغاری",
      bn: "بنگالی",
      bho: "بوجپوری",
      bs: "بوسنیایی",
      pt: "پرتغالی",
      ps: "پشتو",
      pa: "پنجابی",
      tt: "تاتار",
      tg: "تاجیک",
      ta: "تاميلی",
      th: "تايلندی",
      tk: "ترکمنی",
      tr: "ترکی استانبولی",
      ts: "تسونگا",
      te: "تلوگو",
      ak: "تویی",
      ti: "تیگرینیا",
      jv: "جاوه‌ای",
      cs: "چک",
      ny: "چوایی",
      "zh-CN": "چینی (ساده‌شده)",
      "zh-TW": "چینی (سنتی)",
      km: "خمری",
      xh: "خوسایی",
      da: "دانمارکی",
      doi: "دوگری",
      dv: "دیوهی",
      ru: "روسی",
      ro: "رومانيايی",
      zu: "زولو",
      ja: "ژاپنی",
      sm: "ساموایی",
      sa: "سانسکریت",
      ceb: "سبوانو",
      sd: "سندی",
      sw: "سواحیلی",
      sv: "سوئدی",
      st: "سوتو",
      nso: "سوتوی",
      su: "سودانی",
      so: "سومالیایی",
      si: "سینهالی",
      sn: "شونا",
      sr: "صربی",
      he: "عبری",
      ar: "عربی",
      fa: "فارسی",
      fr: "فرانسوی",
      fy: "فريسی",
      fi: "فنلاندی",
      tl: "فیلیپینی",
      ky: "قرقیزی",
      kk: "قزاقی",
      ca: "کاتالان",
      kn: "کانارا",
      qu: "کچوآ",
      ht: "کرئول هائیتی",
      ckb: "کردی (سورانی)",
      ku: "کردی (کرمانجی)",
      co: "كرسی",
      hr: "کرواتی",
      ko: "کره‌ای",
      kri: "کریو",
      gom: "کونکانی",
      rw: "کینیارواندا",
      gl: "گالیسی",
      gd: "گاليک اسکاتلندی",
      gu: "گجراتی",
      ka: "گرجی",
      gn: "گوارانی",
      lo: "لائوسی",
      la: "لاتين",
      lv: "لتونيايی",
      lg: "لوگاندا",
      lb: "لوگزامبورگی",
      pl: "لهستانی",
      lt: "ليتوانيايی",
      ln: "لینگالا",
      mi: "مائوری",
      mg: "مالاگاسی",
      ml: "مالایالمی",
      ms: "مالايی",
      mt: "مالتی",
      mai: "مایتهیلی",
      hu: "مجاری",
      mr: "مراتی",
      mn: "مغولی",
      mk: "مقدونيه‌ای",
      "mni-Mtei": "می‌تِیلون (مانیپوری)",
      lus: "میزو",
      ne: "نپالی",
      no: "نروژی",
      cy: "ولزی",
      vi: "ويتنامی",
      haw: "هاوایی",
      nl: "هلندی",
      hmn: "همونگ",
      hi: "هندی",
      ha: "هوسه",
      yi: "یدیشی",
      yo: "یوروبایی",
      el: "يونانی",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    pl: {
      af: "afrikaans",
      ay: "ajmara",
      sq: "albański",
      am: "amharski",
      en: "angielski",
      ar: "arabski",
      as: "asamski",
      az: "azerski",
      bm: "bambara",
      eu: "baskijski",
      bn: "bengalski",
      bho: "bhodźpuri",
      be: "białoruski",
      my: "birmański",
      bs: "bośniacki",
      bg: "bułgarski",
      ceb: "cebuański",
      "zh-TW": "chiński (tradycyjny)",
      "zh-CN": "chiński (uproszczony)",
      hr: "chorwacki",
      cs: "czeski",
      ny: "cziczewa",
      dv: "dhivehi",
      doi: "dogri",
      da: "duński",
      eo: "esperanto",
      et: "estoński",
      ee: "ewe",
      tl: "filipiński",
      fi: "fiński",
      fr: "francuski",
      fy: "fryzyjski",
      gl: "galicyjski",
      el: "grecki",
      ka: "gruziński",
      gn: "guarani",
      gu: "gudżarati",
      ha: "hausa",
      haw: "hawajski",
      he: "hebrajski",
      hi: "hindi",
      es: "hiszpański",
      hmn: "hmong",
      ig: "igbo",
      ilo: "ilokański",
      id: "indonezyjski",
      ga: "irlandzki",
      is: "islandzki",
      ja: "japoński",
      jv: "jawajski",
      yi: "jidysz",
      yo: "joruba",
      kn: "kannada",
      ca: "kataloński",
      kk: "kazachski",
      qu: "keczua",
      km: "khmerski",
      ky: "kirgiski",
      gom: "konkani",
      ko: "koreański",
      co: "korsykański",
      ht: "kreolski (Haiti)",
      kri: "krio",
      ku: "kurdyjski (kurmandżi)",
      ckb: "kurdyjski (sorani)",
      lo: "laotański",
      ln: "lingala",
      lt: "litewski",
      lg: "luganda",
      lb: "luksemburski",
      la: "łaciński",
      lv: "łotewski",
      mk: "macedoński",
      mai: "maithili",
      ml: "malajalam",
      ms: "malajski",
      mg: "malgaski",
      mt: "maltański",
      mi: "maori",
      mr: "marathi",
      "mni-Mtei": "meiteilon (manipuri)",
      lus: "mizo",
      mn: "mongolski",
      ne: "nepalski",
      nl: "niderlandzki",
      de: "niemiecki",
      no: "norweski",
      or: "odia (orija)",
      hy: "ormiański",
      om: "oromo",
      ps: "paszto",
      pa: "pendżabski",
      fa: "perski",
      pl: "polski",
      pt: "portugalski",
      ru: "rosyjski",
      rw: "ruanda-rundi",
      ro: "rumuński",
      sm: "samoański",
      sa: "sanskryt",
      nso: "sepedi",
      sr: "serbski",
      st: "sesotho",
      sn: "shona",
      sd: "sindhi",
      sk: "słowacki",
      sl: "słoweński",
      so: "somalijski",
      sw: "suahili",
      su: "sundajski",
      si: "syngaleski",
      gd: "szkocki gaelicki",
      sv: "szwedzki",
      tg: "tadżycki",
      th: "tajski",
      ta: "tamilski",
      tt: "tatarski",
      te: "telugu",
      ti: "tigrinia",
      ts: "tsonga",
      tr: "turecki",
      tk: "turkmeński",
      ak: "twi",
      ug: "ujgurski",
      uk: "ukraiński",
      ur: "urdu",
      uz: "uzbecki",
      cy: "walijski",
      hu: "węgierski",
      vi: "wietnamski",
      it: "włoski",
      xh: "xhosa",
      zu: "zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    "pt-PT": {
      af: "Afrikaans",
      ay: "Aimará",
      sq: "Albanês",
      de: "Alemão",
      am: "Amárico",
      ar: "Árabe",
      hy: "Arménio",
      as: "Assamês",
      az: "Azerbaijano",
      bm: "Bambara",
      eu: "Basco",
      bn: "Bengali",
      bho: "Bhojpuri",
      be: "Bielorusso",
      my: "Birmanês",
      bs: "Bósnio",
      bg: "Búlgaro",
      kn: "Canarim",
      ca: "Catalão",
      kk: "Cazaque",
      ceb: "Cebuano",
      cs: "Checo",
      ny: "Chichewa",
      "zh-CN": "Chinês (Simplificado)",
      "zh-TW": "Chinês (Tradicional)",
      si: "Cingalês",
      gom: "Concani",
      ko: "Coreano",
      co: "Corso",
      ht: "Crioulo Haitiano",
      hr: "Croata",
      ku: "Curdo (kurmanji)",
      ckb: "Curdo (sorani)",
      da: "Dinamarquês",
      dv: "Divehi",
      doi: "Dogri",
      sk: "Eslovaco",
      sl: "Esloveno",
      es: "Espanhol",
      eo: "Esperanto",
      et: "Estónio",
      ee: "Ewe",
      tl: "Filipino",
      fi: "Finlandês",
      fr: "Francês",
      fy: "Frísio",
      gd: "Gaélico da Escócia",
      gl: "Galego",
      cy: "Galês",
      ka: "Georgiano",
      el: "Grego",
      gn: "Guarani",
      gu: "Gujarati",
      ha: "Haúça",
      haw: "Havaiano",
      he: "Hebraico",
      hi: "Hindu",
      hmn: "Hmong",
      nl: "Holandês",
      hu: "Húngaro",
      ig: "Ibo",
      yi: "Iídiche",
      ilo: "Ilocano",
      id: "Indonésio",
      en: "Inglês",
      yo: "Ioruba",
      ga: "Irlandês",
      is: "Islandês",
      it: "Italiano",
      ja: "Japonês",
      jv: "Javanês",
      km: "Khmer",
      rw: "Kinyarwanda",
      kri: "Krio",
      lo: "Laosiano",
      la: "Latim",
      lv: "Letão",
      ln: "Lingala",
      lt: "Lituano",
      lg: "Luganda",
      lb: "Luxemburguês",
      mk: "Macedónio",
      mai: "Maithili",
      ml: "Malaiala",
      ms: "Malaio",
      mg: "Malgaxe",
      mt: "Maltês",
      mi: "Maori",
      mr: "Marata",
      "mni-Mtei": "Meiteilon (manipuri)",
      lus: "Mizo",
      mn: "Mongol",
      ne: "Nepalês",
      no: "Norueguês",
      or: "Oriá (oriya)",
      om: "Oromo",
      ps: "Pastó",
      fa: "Persa",
      pl: "Polaco",
      pt: "Português",
      pa: "Punjabi",
      qu: "Quíchua",
      ky: "Quirguistanês",
      ro: "Romeno",
      ru: "Russo",
      sm: "Samoano",
      sa: "Sânscrito",
      nso: "Sepedi",
      sr: "Sérvio",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindi",
      so: "Somali",
      sw: "Suaíli",
      su: "Sudanês",
      sv: "Sueco",
      th: "Tailandês",
      tg: "Tajique",
      ta: "Tâmil",
      tt: "Tártaro",
      te: "Telugu",
      ti: "Tigrino",
      ts: "Tsonga",
      tr: "Turco",
      tk: "Turcomano",
      ak: "Twi",
      uk: "Ucraniano",
      ug: "Uigur",
      ur: "Urdu",
      uz: "Usbeque",
      vi: "Vietnamita",
      xh: "Xhosa",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    "pt-BR": {
      af: "Africâner",
      ay: "Aimará",
      sq: "Albanês",
      de: "Alemão",
      am: "Amárico",
      ar: "Árabe",
      hy: "Armênio",
      as: "Assamês",
      az: "Azerbaijano",
      bm: "Bambara",
      eu: "Basco",
      bn: "Bengali",
      be: "Bielorrusso",
      my: "Birmanês",
      bho: "Boiapuri",
      bs: "Bósnio",
      bg: "Búlgaro",
      kn: "Canarês",
      ca: "Catalão",
      kk: "Cazaque",
      ceb: "Cebuano",
      ny: "Chicheua",
      "zh-CN": "Chinês (simplificado)",
      "zh-TW": "Chinês (tradicional)",
      sn: "Chona",
      si: "Cingalês",
      gom: "Concani",
      ko: "Coreano",
      co: "Corso",
      ht: "Crioulo haitiano",
      hr: "Croata",
      ku: "Curdo (kurmanji)",
      ckb: "Curdo (sorâni)",
      da: "Dinamarquês",
      dv: "Diveí",
      doi: "Dogri",
      sk: "Eslovaco",
      sl: "Esloveno",
      es: "Espanhol",
      eo: "Esperanto",
      et: "Estoniano",
      tl: "Filipino",
      fi: "Finlandês",
      fr: "Francês",
      fy: "Frísio",
      gd: "Gaélico escocês",
      gl: "Galego",
      cy: "Galês",
      ka: "Georgiano",
      el: "Grego",
      gn: "Guarani",
      gu: "Guzerate",
      ha: "Hauçá",
      haw: "Havaiano",
      he: "Hebraico",
      hi: "Hindi",
      hmn: "Hmong",
      nl: "Holandês",
      hu: "Húngaro",
      ig: "Igbo",
      yi: "Iídiche",
      ilo: "Ilocano",
      id: "Indonésio",
      en: "Inglês",
      yo: "Iorubá",
      ga: "Irlandês",
      is: "Islandês",
      it: "Italiano",
      ja: "Japonês",
      jv: "Javanês",
      ee: "Jeje",
      km: "Khmer",
      kri: "Krio",
      lo: "Laosiano",
      la: "Latim",
      lv: "Letão",
      ln: "Lingala",
      lt: "Lituano",
      lg: "Luganda",
      lb: "Luxemburguês",
      mk: "Macedônio",
      mai: "Maithili",
      ml: "Malaiala",
      ms: "Malaio",
      mg: "Malgaxe",
      mt: "Maltês",
      mi: "Maori",
      mr: "Marata",
      "mni-Mtei": "Meiteilon (manipuri)",
      lus: "Mizo",
      mn: "Mongol",
      ne: "Nepalês",
      no: "Norueguês",
      or: "Oriá",
      om: "Oromo",
      ps: "Pachto",
      fa: "Persa",
      pl: "Polonês",
      pt: "Português",
      pa: "Punjabi",
      qu: "Quíchua",
      rw: "Quiniaruanda",
      ky: "Quirguiz",
      ro: "Romeno",
      ru: "Russo",
      sm: "Samoano",
      sa: "Sânscrito",
      nso: "Sepedi",
      sr: "Sérvio",
      st: "Sessoto",
      sd: "Sindi",
      so: "Somali",
      sw: "Suaíli",
      sv: "Sueco",
      su: "Sundanês",
      tg: "Tadjique",
      th: "Tailandês",
      ta: "Tâmil",
      tt: "Tártaro",
      cs: "Tcheco",
      te: "Telugo",
      ti: "Tigrínia",
      ts: "Tsonga",
      tr: "Turco",
      tk: "Turcomano",
      ak: "Twi",
      uk: "Ucraniano",
      ug: "Uigur",
      ur: "Urdu",
      uz: "Uzbeque",
      vi: "Vietnamita",
      xh: "Xhosa",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    ro: {
      af: "Afrikaans",
      sq: "Albaneză",
      am: "Amharică",
      ar: "Arabă",
      hy: "Armeană",
      as: "Asameză",
      ay: "Aymara",
      az: "Azerbaidjană",
      bm: "Bambara",
      eu: "Bască",
      bn: "Bengali",
      bho: "Bhojpuri",
      be: "Bielorusă",
      my: "Birmană",
      bs: "Bosniacă",
      bg: "Bulgară",
      ca: "Catalană",
      ceb: "Cebuană",
      cs: "Cehă",
      ny: "Chichewa",
      "zh-CN": "Chineză (Simplificată)",
      "zh-TW": "Chineză (Tradițională)",
      ko: "Coreeană",
      co: "Corsicană",
      ht: "Creolă haitiană",
      hr: "Croată",
      da: "Daneză",
      dv: "Dhivehi",
      doi: "Dogri",
      he: "Ebraică",
      en: "Engleză",
      eo: "Esperanto",
      et: "Estonă",
      ee: "Ewe",
      tl: "Filipineză",
      fi: "Finlandeză",
      fr: "Franceză",
      fy: "Frizonă",
      cy: "Galeză",
      gd: "Galica scoțiană",
      gl: "Galiciană",
      de: "Germană",
      el: "Greacă",
      ka: "Gruzină",
      gn: "Guarani",
      gu: "Gujarati",
      ha: "Hausa",
      haw: "Hawaiiană",
      hi: "Hindi",
      hmn: "Hmong",
      yi: "Idiș",
      ig: "Igbo",
      ilo: "Ilocano",
      id: "Indoneziană",
      ga: "Irlandeză",
      is: "Islandeză",
      it: "Italiană",
      ja: "Japoneză",
      jv: "Javaneză",
      kn: "Kannada",
      kk: "Kazahă",
      ky: "Kârgâză",
      km: "Khmeră",
      rw: "Kinyarwanda",
      gom: "Konkană",
      kri: "Krio",
      ku: "Kurdă (Kurmanji)",
      ckb: "Kurdă (Sorani)",
      lo: "Laoțiană",
      la: "Latină",
      lv: "Letonă",
      ln: "Lingala",
      lt: "Lituaniană",
      lg: "Luganda",
      lb: "Luxemburgheză",
      mk: "Macedoneană",
      hu: "Maghiară",
      mai: "Maithilă",
      ms: "Malaeză",
      ml: "Malayalam",
      mg: "Malgașă",
      mt: "Malteză",
      mi: "Maori",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (Manipuri)",
      lus: "Mizo",
      mn: "Mongolă",
      nl: "Neerlandeză",
      ne: "Nepaleză",
      no: "Norvegiană",
      or: "Odia (Oriya)",
      om: "Oromo",
      ps: "Pashto",
      fa: "Persană",
      pl: "Poloneză",
      pt: "Portugheză",
      pa: "Punjabi",
      qu: "Quechua",
      ro: "Română",
      ru: "Rusă",
      sm: "Samoană",
      sa: "Sanscrită",
      sr: "Sârbă",
      nso: "Sepedi",
      st: "Sesotho",
      sn: "Shonă",
      sd: "Sindhi",
      si: "Singhaleză",
      sk: "Slovacă",
      sl: "Slovenă",
      so: "Somali",
      es: "Spaniolă",
      sv: "Suedeză",
      su: "Sundaneză",
      sw: "Swahili",
      tg: "Tadjică",
      ta: "Tamilă",
      tt: "Tătară",
      te: "Telugu",
      th: "Thailandeză",
      ti: "Tigrină",
      ts: "Tsonga",
      tr: "Turcă",
      tk: "Turkmenă",
      ak: "Twi",
      uk: "Ucraineană",
      ug: "Uigură",
      ur: "Urdu",
      uz: "Uzbecă",
      vi: "Vietnameză",
      xh: "Xhosa",
      yo: "Yoruba",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    ru: {
      az: "азербайджанский",
      ay: "аймара",
      sq: "албанский",
      am: "амхарский",
      en: "английский",
      ar: "арабский",
      hy: "армянский",
      as: "ассамский",
      af: "африкаанс",
      bm: "бамбара",
      eu: "баскский",
      be: "белорусский",
      bn: "бенгальский",
      my: "бирманский",
      bg: "болгарский",
      bs: "боснийский",
      bho: "бходжпури",
      cy: "валлийский",
      hu: "венгерский",
      vi: "вьетнамский",
      haw: "гавайский",
      gl: "галисийский",
      el: "греческий",
      ka: "грузинский",
      gn: "гуарани",
      gu: "гуджарати",
      da: "датский",
      doi: "догри",
      zu: "зулу",
      he: "иврит",
      ig: "игбо",
      yi: "идиш",
      ilo: "илоканский",
      id: "индонезийский",
      ga: "ирландский",
      is: "исландский",
      es: "испанский",
      it: "итальянский",
      yo: "йоруба",
      kk: "казахский",
      kn: "каннада",
      ca: "каталанский",
      qu: "кечуа",
      ky: "киргизский",
      "zh-TW": "китайский (традиционный)",
      "zh-CN": "китайский (упрощенный)",
      gom: "конкани",
      ko: "корейский",
      co: "корсиканский",
      xh: "коса",
      ht: "креольский (гаити)",
      kri: "крио",
      ku: "курдский (курманджи)",
      ckb: "курдский (сорани)",
      km: "кхмерский",
      lo: "лаосский",
      la: "латинский",
      lv: "латышский",
      ln: "лингала",
      lt: "литовский",
      lg: "луганда",
      lb: "люксембургский",
      mai: "майтхили",
      mk: "македонский",
      mg: "малагасийский",
      ms: "малайский",
      ml: "малаялам",
      dv: "мальдивский",
      mt: "мальтийский",
      mi: "маори",
      mr: "маратхи",
      "mni-Mtei": "мейтейлон (манипури)",
      lus: "мизо",
      mn: "монгольский",
      de: "немецкий",
      ne: "непальский",
      nl: "нидерландский",
      no: "норвежский",
      or: "ория",
      om: "оромо",
      pa: "панджаби",
      fa: "персидский",
      pl: "польский",
      pt: "португальский",
      ps: "пушту",
      rw: "руанда",
      ro: "румынский",
      ru: "русский",
      sm: "самоанский",
      sa: "санскрит",
      ceb: "себуанский",
      nso: "сепеди",
      sr: "сербский",
      st: "сесото",
      si: "сингальский",
      sd: "синдхи",
      sk: "словацкий",
      sl: "словенский",
      so: "сомалийский",
      sw: "суахили",
      su: "сунданский",
      tg: "таджикский",
      th: "тайский",
      ta: "тамильский",
      tt: "татарский",
      te: "телугу",
      ti: "тигринья",
      ts: "тсонга",
      tr: "турецкий",
      tk: "туркменский",
      uz: "узбекский",
      ug: "уйгурский",
      uk: "украинский",
      ur: "урду",
      tl: "филиппинский",
      fi: "финский",
      fr: "французский",
      fy: "фризский",
      ha: "хауса",
      hi: "хинди",
      hmn: "хмонг",
      hr: "хорватский",
      ak: "чви",
      ny: "чева",
      cs: "чешский",
      sv: "шведский",
      sn: "шона",
      gd: "шотландский (гэльский)",
      ee: "эве",
      eo: "эсперанто",
      et: "эстонский",
      jv: "яванский",
      ja: "японский",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    sl: {
      af: "afrikanščina",
      ay: "ajmarščina",
      sq: "albanščina",
      am: "amharščina",
      en: "angleščina",
      ar: "arabščina",
      hy: "armenščina",
      as: "asamščina",
      az: "azerbajdžanščina",
      bm: "bambarščina",
      eu: "baskovščina",
      be: "beloruščina",
      bn: "bengalščina",
      bho: "bojpurščina",
      bg: "bolgarščina",
      bs: "bosanščina",
      my: "burmanščina",
      cs: "češčina",
      ny: "čevščina",
      da: "danščina",
      dv: "diveščina",
      doi: "dogri",
      eo: "esperanto",
      et: "estonščina",
      ee: "evejščina",
      fi: "finščina",
      fr: "francoščina",
      fy: "frizijščina",
      gl: "galicijščina",
      el: "grščina",
      ka: "gruzinščina",
      gu: "gudžaratščina",
      gn: "gvaranščina",
      ht: "haitijska kreolščina",
      haw: "havajščina",
      ha: "havščina",
      he: "hebrejščina",
      hi: "hindijščina",
      hmn: "hmonščina",
      hr: "hrvaščina",
      ig: "igboščina",
      ilo: "ilokanščina",
      id: "indonezijščina",
      ga: "irščina",
      is: "islandščina",
      it: "italijanščina",
      ja: "japonščina",
      jv: "javanščina",
      yi: "jidiščina",
      yo: "jorubščina",
      kn: "kanareščina",
      ca: "katalonščina",
      kk: "kazaščina",
      qu: "kečvanščina",
      rw: "kinjarvandščina",
      ky: "kirgiščina",
      "zh-CN": "kitajščina (poenostavljena)",
      "zh-TW": "kitajščina (tradicionalna)",
      km: "kmerščina",
      gom: "konkanščina",
      ko: "korejščina",
      co: "korziščina",
      xh: "koščina",
      kri: "krijščina",
      ku: "kurdščina (kurmandži)",
      ckb: "kurdščina (soranščina)",
      lo: "laoščina",
      la: "latinščina",
      lv: "latvijščina",
      ln: "lingala",
      lt: "litovščina",
      lg: "lugandščina",
      lb: "luksemburščina",
      hu: "madžarščina",
      mai: "maitilščina",
      mk: "makedonščina",
      mg: "malagaščina",
      ml: "malajalščina",
      ms: "malajščina",
      mt: "malteščina",
      mi: "maorščina",
      mr: "maratščina",
      "mni-Mtei": "meiteilon (manipurščina)",
      lus: "mizojščina",
      mn: "mongolščina",
      de: "nemščina",
      ne: "nepalščina",
      nl: "nizozemščina",
      no: "norveščina",
      or: "odijščina (orijščina)",
      om: "oromščina",
      pa: "pandžabščina",
      ps: "paštunščina",
      fa: "perzijščina",
      pl: "poljščina",
      pt: "portugalščina",
      ro: "romunščina",
      ru: "ruščina",
      sm: "samoanščina",
      sa: "sanskrt",
      ceb: "sebuanščina",
      nso: "sepedščina",
      st: "sesotščina",
      sd: "sindščina",
      si: "singalščina",
      sk: "slovaščina",
      sl: "slovenščina",
      so: "somalščina",
      sr: "srbščina",
      su: "sundanščina",
      sw: "svahilščina",
      gd: "škotska gelščina",
      sn: "šonščina",
      es: "španščina",
      sv: "švedščina",
      tg: "tadžiščina",
      tl: "tagaloščina",
      th: "tajščina",
      ta: "tamilščina",
      tt: "tatarščina",
      te: "teluščina",
      ti: "tigrinjščina",
      ts: "tsongščina",
      tk: "turkmenščina",
      tr: "turščina",
      ak: "tviščina",
      ug: "ujgurščina",
      uk: "ukrajinščina",
      ur: "urdujščina",
      uz: "uzbeščina",
      cy: "valižanščina",
      vi: "vietnamščina",
      zu: "zulujščina",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    es: {
      af: "afrikáans",
      ay: "aimara",
      sq: "albanés",
      de: "alemán",
      am: "amhárico",
      ar: "árabe",
      hy: "armenio",
      as: "asamés",
      az: "azerí",
      bm: "bambara",
      bn: "bengalí",
      bho: "bhoyapurí",
      be: "bielorruso",
      my: "birmano",
      bs: "bosnio",
      bg: "búlgaro",
      km: "camboyano",
      kn: "canarés",
      ca: "catalán",
      ceb: "cebuano",
      cs: "checo",
      ny: "chichewa",
      "zh-CN": "chino (simplificado)",
      "zh-TW": "chino (tradicional)",
      si: "cingalés",
      ko: "coreano",
      co: "corso",
      ht: "criollo haitiano",
      hr: "croata",
      da: "danés",
      dv: "divehi",
      doi: "dogri",
      sk: "eslovaco",
      sl: "esloveno",
      es: "español",
      eo: "esperanto",
      et: "estonio",
      eu: "euskera",
      ee: "ewé",
      fi: "finlandés",
      fr: "francés",
      fy: "frisio",
      gd: "gaélico escocés",
      cy: "galés",
      gl: "gallego",
      ka: "georgiano",
      el: "griego",
      gn: "guaraní",
      gu: "gujarati",
      ha: "hausa",
      haw: "hawaiano",
      he: "hebreo",
      hi: "hindi",
      hmn: "hmong",
      hu: "húngaro",
      ig: "igbo",
      ilo: "ilocano",
      id: "indonesio",
      en: "inglés",
      ga: "irlandés",
      is: "islandés",
      it: "italiano",
      ja: "japonés",
      jv: "javanés",
      kk: "kazajo",
      rw: "kinyarwanda",
      ky: "kirguís",
      gom: "konkaní",
      kri: "krio",
      ku: "kurdo (kurmanyi)",
      ckb: "kurdo (sorani)",
      lo: "lao",
      la: "latín",
      lv: "letón",
      ln: "lingala",
      lt: "lituano",
      lg: "luganda",
      lb: "luxemburgués",
      mk: "macedonio",
      mai: "maithili",
      ml: "malayalam",
      ms: "malayo",
      mg: "malgache",
      mt: "maltés",
      mi: "maorí",
      mr: "maratí",
      "mni-Mtei": "meiteilon (manipuri)",
      lus: "mizo",
      mn: "mongol",
      nl: "neerlandés",
      ne: "nepalí",
      no: "noruego",
      or: "oriya",
      om: "oromo",
      pa: "panyabí",
      ps: "pastún",
      fa: "persa",
      pl: "polaco",
      pt: "portugués",
      qu: "quechua",
      ro: "rumano",
      ru: "ruso",
      sm: "samoano",
      sa: "sánscrito",
      nso: "sepedi",
      sr: "serbio",
      st: "sesoto",
      sn: "shona",
      sd: "sindhi",
      so: "somalí",
      sw: "suajili",
      sv: "sueco",
      su: "sundanés",
      tl: "tagalo",
      th: "tailandés",
      ta: "tamil",
      tt: "tártaro",
      tg: "tayiko",
      te: "telugu",
      ti: "tigriña",
      ts: "tsonga",
      tr: "turco",
      tk: "turkmeno",
      ak: "twi",
      uk: "ucraniano",
      ug: "uigur",
      ur: "urdu",
      uz: "uzbeco",
      vi: "vietnamita",
      xh: "xhosa",
      yi: "yidis",
      yo: "yoruba",
      zu: "zulú",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    sv: {
      af: "afrikaans",
      sq: "albanska",
      am: "amhariska",
      ar: "arabiska",
      hy: "armeniska",
      as: "assamesiska",
      ay: "aymara",
      az: "azerbajdzjanska",
      bm: "bambara",
      eu: "baskiska",
      bn: "bengali",
      bho: "bhojpuri",
      bs: "bosniska",
      bg: "bulgariska",
      my: "burmesiska",
      ceb: "cebuano",
      ny: "chichewa",
      da: "danska",
      dv: "divehi",
      doi: "dogri",
      en: "engelska",
      eo: "esperanto",
      et: "estniska",
      ee: "ewe",
      tl: "filippinska",
      fi: "finska",
      fr: "franska",
      fy: "frisiska",
      gd: "gaeliska",
      gl: "galiciska",
      ka: "georgiska",
      el: "grekiska",
      gn: "guarani",
      gu: "gujarati",
      ht: "haitiska",
      ha: "hausa",
      haw: "hawaiianska",
      he: "hebreiska",
      hi: "hindi",
      hmn: "hmong",
      ig: "igbo",
      ilo: "ilocano",
      id: "indonesiska",
      ga: "irländska",
      is: "isländska",
      it: "italienska",
      ja: "japanska",
      jv: "javanesiska",
      yi: "jiddisch",
      kn: "kanaresiska",
      ca: "katalanska",
      kk: "kazakiska",
      km: "khmer",
      "zh-CN": "kinesiska (förenklad)",
      "zh-TW": "kinesiska (traditionell)",
      rw: "kinyarwanda",
      ky: "kirgiziska",
      gom: "konkani",
      ko: "koreanska",
      co: "korsiska",
      kri: "krio",
      hr: "kroatiska",
      ku: "kurdiska (kurmanji)",
      ckb: "kurdiska (sorani)",
      lo: "laotiska",
      la: "latin",
      lv: "lettiska",
      ln: "lingala",
      lt: "litauiska",
      lg: "luganda",
      lb: "luxemburgska",
      mai: "maithili",
      mk: "makedonska",
      mg: "malagassiska",
      ml: "malayalam",
      ms: "malaysiska",
      mt: "maltesiska",
      mi: "maori",
      mr: "marathi",
      "mni-Mtei": "meitei (manipuri)",
      lus: "mizo",
      mn: "mongoliska",
      nl: "nederländska",
      ne: "nepali",
      no: "norska",
      or: "odia (oriya)",
      om: "oromo",
      ps: "pashto",
      fa: "persiska",
      pl: "polska",
      pt: "portugisiska",
      pa: "punjabi",
      qu: "quechua",
      ro: "rumänska",
      ru: "ryska",
      sm: "samoanska",
      sa: "sanskrit",
      nso: "sepedi",
      sr: "serbiska",
      st: "sesotho",
      sn: "shona",
      sd: "sindhi",
      si: "singalesiska",
      sk: "slovakiska",
      sl: "slovenska",
      so: "somaliska",
      es: "spanska",
      su: "sundanesiska",
      sv: "svenska",
      sw: "swahili",
      tg: "tadzjikiska",
      ta: "tamil",
      tt: "tatariska",
      te: "telugu",
      th: "thailändska",
      ti: "tigrinja",
      cs: "tjeckiska",
      ts: "tsonga",
      tr: "turkiska",
      tk: "turkmeniska",
      ak: "twi",
      de: "tyska",
      ug: "uiguriska",
      uk: "ukrainska",
      hu: "ungerska",
      ur: "urdu",
      uz: "uzbekiska",
      vi: "vietnamesiska",
      be: "vitryska",
      cy: "walesiska",
      xh: "xhosa",
      yo: "yoruba",
      zu: "zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    th: {
      gom: "กงกณี",
      el: "กรีก",
      gn: "กวารานี",
      kn: "กันนาดา",
      gl: "กาลิเชียน",
      gd: "เกลิกสกอต",
      ko: "เกาหลี",
      km: "เขมร",
      kri: "คริโอ",
      co: "คอร์สิกา",
      kk: "คาซัค",
      ca: "คาตาลัน",
      rw: "คินยารวันดา",
      ky: "คีร์กิซ",
      gu: "คุชราต",
      qu: "เคชัว",
      ku: "เคิร์ด (กุรมันชี)",
      ckb: "เคิร์ด (โซรานี)",
      xh: "โคซา",
      hr: "โครเอเชีย",
      ka: "จอร์เจีย",
      "zh-TW": "จีน (ตัวเต็ม)",
      "zh-CN": "จีน (ตัวย่อ)",
      jv: "ชวา",
      ny: "ชิเชวา",
      cs: "เช็ก",
      sn: "โชนา",
      ts: "ซองกา",
      sm: "ซามัว",
      ceb: "ซีบัวโน",
      su: "ซุนดา",
      zu: "ซูลู",
      st: "เซโซโท",
      sr: "เซอร์เบียน",
      nso: "โซโทเหนือ",
      so: "โซมาลี",
      ja: "ญี่ปุ่น",
      nl: "ดัตช์",
      dv: "ดิเวฮิ",
      da: "เดนมาร์ก",
      doi: "โดกรี",
      tr: "ตุรกี",
      te: "เตลูกู",
      tk: "เติร์กเมน",
      ta: "ทมิฬ",
      ak: "ทวิ",
      tg: "ทาจิก",
      tt: "ทาทาร์",
      ti: "ทีกรินยา",
      th: "ไทย",
      no: "นอร์เวย์",
      ne: "เนปาล",
      bs: "บอสเนีย",
      bm: "บัมบารา",
      bg: "บัลแกเรีย",
      eu: "บาสก์",
      bn: "เบงกอล",
      be: "เบลารุส",
      pa: "ปัญจาป",
      fa: "เปอร์เซีย",
      pt: "โปรตุเกส",
      pl: "โปแลนด์",
      fr: "ฝรั่งเศส",
      ps: "พาชตู",
      fy: "ฟริเชียน",
      fi: "ฟินแลนด์",
      tl: "ฟิลิปปินส์",
      bho: "โภชปุรี",
      hmn: "ม้ง",
      "mni-Mtei": "มณีปุระ (มานิพูรี)",
      mn: "มองโกเลีย",
      mt: "มัลทีส",
      mk: "มาซีโดเนีย",
      mr: "มาราฐี",
      mg: "มาลากาซี",
      ml: "มาลายาลัม",
      ms: "มาเลย์",
      lus: "มิโซ",
      mi: "เมารี",
      my: "เมียนมา (พม่า)",
      mai: "ไมถิลี",
      yi: "ยิดดิช",
      uk: "ยูเครน",
      de: "เยอรมัน",
      yo: "โยรูบา",
      ru: "รัสเซีย",
      ro: "โรมาเนีย",
      la: "ละติน",
      lb: "ลักเซมเบิร์ก",
      lv: "ลัตเวีย",
      lo: "ลาว",
      ln: "ลิงกาลา",
      lt: "ลิทัวเนีย",
      lg: "ลูกันดา",
      cy: "เวลส์",
      vi: "เวียดนาม",
      es: "สเปน",
      sk: "สโลวัก",
      sl: "สโลวีเนีย",
      sw: "สวาฮิลี",
      sv: "สวีเดน",
      sa: "สันสกฤต",
      si: "สิงหล",
      sd: "สินธี",
      en: "อังกฤษ",
      am: "อัมฮาริก",
      as: "อัสสัม",
      az: "อาร์เซอร์ไบจัน",
      hy: "อาร์เมเนีย",
      ar: "อาหรับ",
      ig: "อิกโบ",
      it: "อิตาลี",
      id: "อินโดนีเซีย",
      ilo: "อีโลกาโน",
      ee: "อีเว",
      ug: "อุยกูร์",
      uz: "อุสเบกิสถาน",
      ur: "อูรดู",
      et: "เอสโทเนีย",
      eo: "เอสเปอแรนโต",
      af: "แอฟริกา",
      sq: "แอลเบเนีย",
      or: "โอเดีย (โอริยา)",
      om: "โอโรโม",
      is: "ไอซ์แลนด์",
      ay: "ไอมารา",
      ga: "ไอร์แลนด์",
      hu: "ฮังการี",
      ha: "ฮัวซา",
      haw: "ฮาวาย",
      hi: "ฮินดี",
      he: "ฮีบรู",
      ht: "เฮติครีโอล",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    tr: {
      af: "Afrikaanca",
      de: "Almanca",
      ar: "Arapça",
      sq: "Arnavutça",
      as: "Assamca",
      ay: "Aymaraca",
      az: "Azerbaycan dili",
      bm: "Bambara",
      eu: "Baskça",
      be: "Belarusça",
      bn: "Bengalce",
      bho: "Bhojpuri",
      bs: "Boşnakça",
      bg: "Bulgarca",
      my: "Burmaca",
      jv: "Cava dili",
      ceb: "Cebuano",
      ny: "Chicheva",
      cs: "Çekçe",
      "zh-CN": "Çince (Basitleştirilmiş)",
      "zh-TW": "Çince (Geleneksel)",
      da: "Danca",
      dv: "Dhivehi",
      doi: "Dogri",
      id: "Endonezce",
      hy: "Ermenice",
      eo: "Esperanto",
      et: "Estonyaca",
      ee: "Ewe",
      fa: "Farsça",
      nl: "Felemenkçe",
      tl: "Filipince",
      fi: "Fince",
      fr: "Fransızca",
      fy: "Frizce",
      cy: "Galce",
      gl: "Galiçyaca",
      gn: "Guarani",
      gu: "Güceratça",
      ka: "Gürcüce",
      am: "Habeşçe",
      ht: "Haiti Kreyolu",
      ha: "Hausa dili",
      haw: "Hawai dili",
      hr: "Hırvatça",
      hi: "Hintçe",
      hmn: "Hmong",
      xh: "Hosa",
      ig: "İbo dili",
      he: "İbranice",
      ilo: "İlokano",
      en: "İngilizce",
      ga: "İrlandaca",
      gd: "İskoç Gaelcesi",
      es: "İspanyolca",
      sv: "İsveççe",
      it: "İtalyanca",
      is: "İzlandaca",
      ja: "Japonca",
      km: "Kamboçyaca",
      kn: "Kannada",
      ca: "Katalanca",
      kk: "Kazakça",
      qu: "Keçuva",
      ky: "Kırgızca",
      gom: "Konkani",
      ko: "Korece",
      co: "Korsikaca",
      kri: "Krio",
      ku: "Kürtçe (Kurmançça)",
      ckb: "Kürtçe (Sorani)",
      lo: "Laoca",
      la: "Latince",
      pl: "Lehçe",
      lv: "Letonca",
      ln: "Lingala",
      lt: "Litvanca",
      lg: "Luganda",
      lb: "Lüksemburgca",
      hu: "Macarca",
      mai: "Maithili",
      mk: "Makedonca",
      ml: "Malayalam",
      ms: "Malayca",
      mg: "Malgaşça",
      mt: "Maltaca",
      mi: "Maori dili",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (Manipuri)",
      lus: "Mizo",
      mn: "Moğolca",
      ne: "Nepalce",
      no: "Norveççe",
      or: "Odiya (Oriya)",
      om: "Oromo",
      uz: "Özbekçe",
      pa: "Pencapça",
      ps: "Peştuca",
      pt: "Portekizce",
      ro: "Romence",
      rw: "Ruandaca",
      ru: "Rusça",
      sm: "Samoaca",
      sa: "Sanskritçe",
      nso: "Sepedi",
      st: "Sesotho dili",
      si: "Seylanca",
      sn: "Shona",
      sr: "Sırpça",
      sd: "Sint",
      sk: "Slovakça",
      sl: "Slovence",
      so: "Somalice",
      su: "Sundanizce",
      sw: "Svahili dili",
      tg: "Tacikce",
      ta: "Tamil",
      tt: "Tatarca",
      th: "Tayca",
      te: "Telugu dili",
      ti: "Tigrinya dili",
      ts: "Tsongaca",
      tr: "Türkçe",
      tk: "Türkmence",
      ak: "Twi dili",
      uk: "Ukraynaca",
      ur: "Urduca",
      ug: "Uygurca",
      vi: "Vietnamca",
      yi: "Yidce",
      yo: "Yoruba",
      el: "Yunanca",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    uk: {
      az: "азербайджанська",
      ay: "аймарська",
      sq: "албанська",
      am: "амхарська",
      en: "англійська",
      ar: "арабська",
      as: "ассамська",
      af: "африкаанс",
      bm: "бамбара",
      eu: "баскська",
      bn: "бенгальська",
      be: "білоруська",
      my: "бірманська",
      bg: "болгарська",
      bs: "боснійська",
      bho: "бходжпурі",
      vi: "в’єтнамська",
      cy: "валлійська",
      hy: "вірменська",
      haw: "гавайська",
      ht: "гаїтянська креольська",
      hi: "гінді",
      el: "грецька",
      ka: "грузинська",
      gn: "гуарані",
      gl: "ґалісійська",
      gu: "ґуджаратська",
      da: "данська",
      dv: "дівехі",
      doi: "догрі",
      ee: "еве",
      eo: "есперанто",
      et: "естонська",
      zu: "зулу",
      he: "іврит",
      ig: "ігбо (ібо)",
      yi: "ідиш",
      ilo: "ілоканська",
      id: "індонезійська",
      ga: "ірландська",
      is: "ісландська",
      es: "іспанська",
      it: "італійська",
      yo: "йоруба",
      kk: "казахська",
      km: "камбоджійська",
      kn: "каннада",
      ca: "каталанська",
      qu: "кечуа",
      ky: "киргизька",
      "zh-CN": "китайська (спрощена)",
      "zh-TW": "китайська (традиційна)",
      gom: "конкані",
      ko: "корейська",
      co: "корсиканська",
      kri: "кріо",
      ku: "курдська (курманджі)",
      ckb: "курдська (сорані)",
      xh: "кхоса",
      lo: "лаоська",
      la: "латинська",
      lv: "латиська",
      lt: "литовська",
      ln: "лінгала",
      lg: "луганда",
      lb: "люксембурзька",
      mai: "майтхілі",
      mk: "македонська",
      mg: "малагасійська",
      ms: "малайська",
      ml: "малаялам",
      mt: "мальтійська",
      mi: "маорі",
      mr: "маратхі",
      "mni-Mtei": "мейтейлон (маніпурі)",
      lus: "мізо",
      mn: "монгольська",
      ne: "непальська",
      nl: "нідерландська",
      de: "німецька",
      no: "норвезька",
      or: "одія (орія)",
      om: "оромо",
      pa: "панджабська",
      fa: "перська",
      pl: "польська",
      pt: "португальська",
      ps: "пушту",
      ru: "російська",
      rw: "руандійська",
      ro: "румунська",
      sm: "самоанська",
      sa: "санскрит",
      ceb: "себуано",
      nso: "сепеді",
      sr: "сербська",
      st: "сесото",
      si: "сингальська",
      sd: "сіндхі",
      sk: "словацька",
      sl: "словенська",
      so: "сомалі",
      sw: "суахілі",
      su: "сунданська",
      tg: "таджицька",
      th: "тайська",
      ta: "тамільська",
      tt: "татарська",
      te: "телуґу",
      ti: "тигринcька",
      ts: "тсонга",
      tr: "турецька",
      tk: "туркменська",
      hu: "угорська",
      uz: "узбецька",
      ug: "уйгурська",
      uk: "українська",
      ur: "урду",
      tl: "філіппінська",
      fi: "фінська",
      fr: "французька",
      fy: "фризька",
      ha: "хауса",
      hmn: "хмонг",
      hr: "хорватська",
      ak: "чві",
      cs: "чеська",
      ny: "чичева",
      sv: "шведська",
      sn: "шона",
      gd: "шотландська (ґельська)",
      jv: "яванська",
      ja: "японська",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    vi: {
      ar: "Ả Rập",
      sq: "Albania",
      am: "Amharic",
      en: "Anh",
      hy: "Armenia",
      as: "Assam",
      ay: "Aymara",
      az: "Azerbaijan",
      pl: "Ba Lan",
      fa: "Ba Tư",
      bm: "Bambara",
      xh: "Bantu",
      eu: "Basque",
      be: "Belarus",
      bn: "Bengal",
      bho: "Bhojpuri",
      bs: "Bosnia",
      pt: "Bồ Đào Nha",
      bg: "Bulgaria",
      ca: "Catalan",
      ceb: "Cebuano",
      ny: "Chichewa",
      co: "Corsi",
      ht: "Creole (Haiti)",
      hr: "Croatia",
      dv: "Dhivehi",
      he: "Do Thái",
      doi: "Dogri",
      da: "Đan Mạch",
      de: "Đức",
      et: "Estonia",
      ee: "Ewe",
      tl: "Filipino",
      fy: "Frisia",
      gd: "Gael Scotland",
      gl: "Galicia",
      ka: "George",
      gn: "Guarani",
      gu: "Gujarat",
      nl: "Hà Lan",
      af: "Hà Lan (Nam Phi)",
      ko: "Hàn",
      ha: "Hausa",
      haw: "Hawaii",
      hi: "Hindi",
      hmn: "Hmong",
      hu: "Hungary",
      el: "Hy Lạp",
      is: "Iceland",
      ig: "Igbo",
      ilo: "Ilocano",
      id: "Indonesia",
      ga: "Ireland",
      jv: "Java",
      kn: "Kannada",
      kk: "Kazakh",
      km: "Khmer",
      rw: "Kinyarwanda",
      gom: "Konkani",
      kri: "Krio",
      ku: "Kurd (Kurmanji)",
      ckb: "Kurd (Sorani)",
      ky: "Kyrgyz",
      lo: "Lào",
      la: "Latinh",
      lv: "Latvia",
      ln: "Lingala",
      lt: "Litva",
      lg: "Luganda",
      lb: "Luxembourg",
      ms: "Mã Lai",
      mk: "Macedonia",
      mai: "Maithili",
      mg: "Malagasy",
      ml: "Malayalam",
      mt: "Malta",
      mi: "Maori",
      mr: "Marathi",
      "mni-Mtei": "Meiteilon (Manipuri)",
      lus: "Mizo",
      mn: "Mông Cổ",
      my: "Myanmar",
      no: "Na Uy",
      ne: "Nepal",
      ru: "Nga",
      ja: "Nhật",
      or: "Odia (Oriya)",
      om: "Oromo",
      ps: "Pashto",
      sa: "Phạn",
      fr: "Pháp",
      fi: "Phần Lan",
      pa: "Punjab",
      qu: "Quechua",
      eo: "Quốc tế ngữ",
      ro: "Rumani",
      sm: "Samoa",
      cs: "Séc",
      nso: "Sepedi",
      sr: "Serbia",
      st: "Sesotho",
      sn: "Shona",
      sd: "Sindhi",
      si: "Sinhala",
      sk: "Slovak",
      sl: "Slovenia",
      so: "Somali",
      su: "Sunda",
      sw: "Swahili",
      tg: "Tajik",
      ta: "Tamil",
      tt: "Tatar",
      es: "Tây Ban Nha",
      te: "Telugu",
      th: "Thái",
      tr: "Thổ Nhĩ Kỳ",
      sv: "Thụy Điển",
      ti: "Tigrinya",
      "zh-CN": "Trung (Giản thể)",
      "zh-TW": "Trung (Phồn thể)",
      ts: "Tsonga",
      tk: "Turkmen",
      ak: "Twi",
      uk: "Ukraina",
      ur: "Urdu",
      ug: "Uyghur",
      uz: "Uzbek",
      vi: "Việt",
      cy: "Xứ Wales",
      it: "Ý",
      yi: "Yiddish",
      yo: "Yoruba",
      zu: "Zulu",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
    is: {
      af: "afríkanska",
      ay: "aímaríska",
      sq: "albanska",
      am: "amharíska",
      ar: "arabíska",
      hy: "armenska",
      az: "aserska",
      as: "assamska",
      bm: "bambara",
      eu: "baskneska",
      bn: "bengalska",
      bho: "bhojpuri",
      bs: "bosníska",
      bg: "búlgarska",
      my: "búrmíska",
      ny: "chichewa",
      da: "danska",
      dv: "dhivehi",
      doi: "dogri",
      et: "eistneska",
      en: "enska",
      eo: "esperantó",
      ee: "ewe",
      tl: "filippseyska",
      fi: "finnska",
      fr: "franska",
      fy: "frísneska",
      gl: "galisíska",
      ka: "georgíska",
      el: "gríska",
      gu: "gujarati",
      gn: "gvaraní",
      ht: "haítískt kreólamál",
      haw: "havaíska",
      ha: "hása",
      he: "hebreska",
      hi: "hindí",
      hmn: "hmong",
      nl: "hollenska",
      be: "hvítrússneska",
      ig: "igbó",
      ilo: "ilokano",
      id: "indónesíska",
      ga: "írska",
      is: "íslenska",
      it: "ítalska",
      ja: "japanska",
      jv: "javíska",
      yi: "jiddíska",
      yo: "jorúba",
      kn: "kannada",
      kk: "kasakstanska",
      ca: "katalónska",
      km: "khmer",
      rw: "kinjarvanda",
      ky: "kirgisíska",
      "zh-CN": "kínverska (einfölduð)",
      "zh-TW": "kínverska (hefðbundin)",
      gom: "konkani",
      co: "korsíska",
      ko: "kóreska",
      kri: "krio",
      hr: "króatíska",
      ku: "kúrdíska (kurmanji)",
      ckb: "kúrdíska (soraní)",
      lo: "lao",
      la: "latína",
      lv: "lettneska",
      ln: "lingala",
      lt: "litháíska",
      lg: "lúganda",
      lb: "lúxemborgska",
      mai: "maithili",
      mk: "makedónska",
      mg: "malagasíska",
      ms: "malajíska",
      ml: "malayalam",
      mt: "maltneska",
      mi: "maoríska",
      mr: "maratí",
      "mni-Mtei": "meiteilon (manipuri)",
      lus: "mizo",
      mn: "mongólska",
      ne: "nepalska",
      no: "norska",
      or: "odía (oriya)",
      om: "oromo",
      ps: "pashto",
      fa: "persneska",
      pt: "portúgalska",
      pl: "pólska",
      pa: "punjabi",
      qu: "quechua",
      ro: "rúmenska",
      ru: "rússneska",
      sm: "samóska",
      sa: "sanskrít",
      ceb: "sebúanó",
      nso: "sepedi",
      sr: "serbneska",
      st: "sesótó",
      sn: "shona",
      sd: "sindhí",
      si: "sinhala",
      gd: "skosk-gelíska",
      sk: "slóvakíska",
      sl: "slóvenska",
      so: "sómalska",
      es: "spænska",
      zu: "súlú",
      su: "súndíska",
      sw: "svahílí",
      sv: "sænska",
      tg: "tadsjikíska",
      th: "taílenska",
      ta: "tamílska",
      tt: "tatarska",
      te: "telugu",
      cs: "tékkneska",
      ti: "tigriníska",
      ts: "tsonga",
      tk: "túrkmenska",
      ak: "twi",
      tr: "tyrkneska",
      hu: "ungverska",
      ug: "uyghur",
      uk: "úkraínska",
      ur: "úrdú",
      uz: "úsbekíska",
      cy: "velska",
      vi: "víetnamska",
      xh: "xhosa",
      de: "þýska",
      ba: "Bashkir",
      cv: "Chuvash",
      mrj: "Hill Mari",
      kazlat: "Kazakh (Latin)",
      mhr: "Mari",
      pap: "Papiamento",
      udm: "Udmurt",
      uzbcyr: "Uzbek (Cyrillic)",
      sah: "Yakut",
    },
  };

  const twpLang = {};

  twpLang.SupportedLanguages = {
    google: [
      "af",
      "sq",
      "am",
      "ar",
      "hy",
      "as",
      "ay",
      "az",
      "bm",
      "eu",
      "be",
      "bn",
      "bho",
      "bs",
      "bg",
      "ca",
      "ceb",
      "ny",
      "zh-CN",
      "zh-TW",
      "co",
      "hr",
      "cs",
      "da",
      "dv",
      "doi",
      "nl",
      "en",
      "eo",
      "et",
      "ee",
      "tl",
      "fi",
      "fr",
      "fy",
      "gl",
      "ka",
      "de",
      "el",
      "gn",
      "gu",
      "ht",
      "ha",
      "haw",
      "he",
      "hi",
      "hmn",
      "hu",
      "is",
      "ig",
      "ilo",
      "id",
      "ga",
      "it",
      "ja",
      "jv",
      "kn",
      "kk",
      "km",
      "rw",
      "gom",
      "ko",
      "kri",
      "ku",
      "ckb",
      "ky",
      "lo",
      "la",
      "lv",
      "ln",
      "lt",
      "lg",
      "lb",
      "mk",
      "mai",
      "mg",
      "ms",
      "ml",
      "mt",
      "mi",
      "mr",
      "mni-Mtei",
      "lus",
      "mn",
      "my",
      "ne",
      "no",
      "or",
      "om",
      "ps",
      "fa",
      "pl",
      "pt",
      "pa",
      "qu",
      "ro",
      "ru",
      "sm",
      "sa",
      "gd",
      "nso",
      "sr",
      "st",
      "sn",
      "sd",
      "si",
      "sk",
      "sl",
      "so",
      "es",
      "su",
      "sw",
      "sv",
      "tg",
      "ta",
      "tt",
      "te",
      "th",
      "ti",
      "ts",
      "tr",
      "tk",
      "ak",
      "uk",
      "ur",
      "ug",
      "uz",
      "vi",
      "cy",
      "xh",
      "yi",
      "yo",
      "zu",
    ],
    yandex: [
      "af",
      "sq",
      "am",
      "ar",
      "hy",
      "az",
      "ba",
      "eu",
      "be",
      "bn",
      "bs",
      "bg",
      "my",
      "ca",
      "ceb",
      "zh-CN", // zh
      "cv",
      "hr",
      "cs",
      "da",
      "nl",
      "en",
      "eo",
      "et",
      "fi",
      "fr",
      "gl",
      "ka",
      "de",
      "el",
      "gu",
      "ht",
      "he",
      "mrj",
      "hi",
      "hu",
      "is",
      "id",
      "ga",
      "it",
      "ja",
      "jv",
      "kn",
      "kk",
      "kazlat",
      "km",
      "ko",
      "ky",
      "lo",
      "la",
      "lv",
      "lt",
      "lb",
      "mk",
      "mg",
      "ms",
      "ml",
      "mt",
      "mi",
      "mr",
      "mhr",
      "mn",
      "ne",
      "no",
      "pap",
      "fa",
      "pl",
      "pt",
      "pa",
      "ro",
      "ru",
      "gd",
      "sr",
      "si",
      "sk",
      "sl",
      "es",
      "su",
      "sw",
      "sv",
      "tl",
      "tg",
      "ta",
      "tt",
      "te",
      "th",
      "tr",
      "udm",
      "uk",
      "ur",
      "uz",
      "uzbcyr",
      "vi",
      "cy",
      "xh",
      "sah",
      "yi",
      "zu",
    ],
    bing: [
      "af",
      "sq",
      "am",
      "ar",
      "hy",
      "as",
      "az",
      "bn",
      "ba",
      "eu",
      "bs",
      "bg",
      "yue",
      "ca",
      "lzh",
      "zh-CN",
      "zh-TW",
      "hr",
      "cs",
      "da",
      "prs",
      "dv",
      "nl",
      "en",
      "et",
      "fo",
      "fj",
      "tl",
      "fi",
      "fr",
      "fr-CA",
      "gl",
      "ka",
      "de",
      "el",
      "gu",
      "ht",
      "he",
      "hi",
      "hmn",
      "hu",
      "is",
      "id",
      "ikt",
      "iu",
      "iu-Latn",
      "ga",
      "it",
      "ja",
      "kn",
      "kk",
      "km",
      "tlh-Latn",
      "ko",
      "ku",
      "ckb",
      "ky",
      "lo",
      "lv",
      "lt",
      "mk",
      "mg",
      "ms",
      "ml",
      "mt",
      "mi",
      "mr",
      "mn",
      "mn-Mong",
      "my",
      "ne",
      "no",
      "or",
      "ps",
      "fa",
      "pl",
      "pt",
      "pt-PT",
      "pa",
      "otq",
      "ro",
      "ru",
      "sm",
      "sr",
      "sr-Latn",
      "sk",
      "sl",
      "so",
      "es",
      "sw",
      "sv",
      "ty",
      "ta",
      "tt",
      "te",
      "th",
      "bo",
      "ti",
      "to",
      "tr",
      "tk",
      "uk",
      "hsb",
      "ur",
      "ug",
      "uz",
      "vi",
      "cy",
      "yua",
      "zu",
    ],
    deepl: [
      "bg",
      "zh-CN", // zh
      "cs",
      "da",
      "nl",
      "en", // en-US
      "en-US",
      "en-GB",
      "et",
      "fi",
      "fr",
      "de",
      "el",
      "hu",
      "id",
      "it",
      "ja",
      "lv",
      "lt",
      "pl",
      "pt", // pt-BR
      "pt-PT",
      "pt-BR",
      "ro",
      "ru",
      "sk",
      "sl",
      "es",
      "sv",
      "tr",
      "uk",
    ],
  };

  twpLang.UILanguages = Object.keys(allLanguagesNames);
  twpLang.TargetLanguages = Object.keys(allLanguagesNames["en"]);

  /**
   * get the list of localized languages for the current browser language
   * @returns {string[]} languageList
   */
  twpLang.getLanguageList = function () {
    let uiLanguage = chrome.i18n.getUILanguage();
    uiLanguage = twpLang.fixUILanguageCode(uiLanguage) || "en";
    return allLanguagesNames[uiLanguage];
  };

  twpLang.SupportedLanguages["openai_compatible"] = [...twpLang.SupportedLanguages.google];

  /** @type {Map<string, string>} */
  const alternatives = new Map();
  const pageTranslationServices = ["google", "yandex", "openai_compatible"];
  /**
   * gets an alternate translation service if the selected translation service does not support the current target language.
   * @param {string} lang
   * @param {string} serviceName
   * @param {boolean} forPageTranslation
   * @returns {string} alternativeServiceName
   */
  twpLang.getAlternativeService = function getAlternativeService(
    lang,
    serviceName,
    forPageTranslation = false
  ) {
    lang = twpLang.fixTLanguageCode(lang);
    if (!twpLang.SupportedLanguages[serviceName])
      return pageTranslationServices[0];
    if (
      forPageTranslation &&
      pageTranslationServices.indexOf(serviceName) === -1
    )
      serviceName = pageTranslationServices[0];
    if (twpLang.SupportedLanguages[serviceName].indexOf(lang) !== -1)
      return serviceName;
    for (const sn in twpLang.SupportedLanguages) {
      if (sn === serviceName) continue;
      if (forPageTranslation && pageTranslationServices.indexOf(sn) === -1)
        continue;
      const langs = twpLang.SupportedLanguages[sn];
      if (langs.indexOf(lang) !== -1) {
        alternatives.set(lang, sn);
        return sn;
      }
    }
    return pageTranslationServices[0];
  };

  /**
   * convert langCode to languageName
   * @example
   * twpLang.codeToLanguage("de")
   * // returns "German"
   * twpLang.codeToLanguage("und")
   * // returns "Unknown" -- chrome.i18n.getMessage("msgUnknownLanguage")
   * @param {string} langCode
   * @returns {string} languageName
   */
  twpLang.codeToLanguage = function (langCode) {
    if (langCode === "und") {
      return chrome.i18n.getMessage("msgUnknownLanguage");
    }

    const languageList = twpLang.getLanguageList();
    langCode = twpLang.fixTLanguageCode(langCode);

    return langCode ? languageList[langCode] : "";
  };

  /**
   * fix the UI language code
   * @param {string} langCode
   * @returns {string} langCode
   */
  twpLang.fixUILanguageCode = function (langCode) {
    if (typeof langCode !== "string") return;

    function getReplacer(langCode) {
      switch (langCode) {
        case "pt":
          return "pt-BR";
        case "zh":
          return "zh-CN";
        default:
          return;
      }
    }

    if (twpLang.UILanguages.indexOf(langCode) === -1) {
      if (langCode.indexOf("-") !== -1) {
        langCode = langCode.split("-")[0];
        if (twpLang.UILanguages.indexOf(langCode) === -1) {
          return getReplacer(langCode);
        }
      } else {
        return getReplacer(langCode);
      }
    }

    return langCode;
  };

  /**
   * fix the target language code
   * @param {string} langCode
   * @returns {string} langCode
   */
  twpLang.fixTLanguageCode = function (langCode) {
    if (typeof langCode !== "string") return;

    if (langCode === "zh" || langCode==='zh-Hans') {
      return "zh-CN";
    } else if (langCode === "zh-Hant" || langCode === "zh-HK") {
      return "zh-TW";
    } else if (langCode === "iw") {
      return "he";
    } else if (langCode === "jw") {
      return "jv";
    }

    if (twpLang.TargetLanguages.indexOf(langCode) === -1) {
      if (langCode.indexOf("-") !== -1) {
        langCode = langCode.split("-")[0];
        if (twpLang.TargetLanguages.indexOf(langCode) === -1) {
          return;
        }
      } else {
        return;
      }
    }

    return langCode;
  };

  /**
   * check if langCode is RTL
   * @example
   * twpLang.isRtlLanguage("ckb")
   * // returns true
   * twpLang.isRtlLanguage("en")
   * // returns false
   * @param {string} langCode
   * @returns {boolean} isRTL
   */
  twpLang.isRtlLanguage = function (langCode) {
    const rtl_langs = [
      "am",
      "ar",
      "ckb",
      "dv",
      "fa",
      "ha",
      "he",
      "ku",
      "ps",
      "ur",
      "yi",
    ];
    return rtl_langs.indexOf(langCode) !== -1;
  };

  return twpLang;
})();


"use strict";

const twpConfig = (function () {
  /** @type {function[]} */
  const observers = [];
  const defaultTargetLanguages = ["zh-CN"];
  /**
   * all configName available
   * @typedef {"pageTranslatorService" | "textTranslatorService" | "ttsSpeed" | "enableDeepL" | "targetLanguage" | "targetLanguageTextTranslation" | "targetLanguages" | "alwaysTranslateSites" | "neverTranslateSites" | "sitesToTranslateWhenHovering" | "langsToTranslateWhenHovering" | "alwaysTranslateLangs" | "neverTranslateLangs" | "customDictionary" | "showTranslatePageContextMenu" | "showTranslateSelectedContextMenu" | "showButtonInTheAddressBar" | "showOriginalTextWhenHovering" | "showTranslateSelectedButton" | "showPopupMobile" | "useOldPopup" | "darkMode" | "popupBlueWhenSiteIsTranslated" | "popupPanelSection" | "showReleaseNotes" | "dontShowIfPageLangIsTargetLang" | "dontShowIfPageLangIsUnknown" | "dontShowIfSelectedTextIsTargetLang" | "dontShowIfSelectedTextIsUnknown" | "hotkeys" | "expandPanelTranslateSelectedText" | "translateTag_pre" | "dontSortResults" | "translateDynamicallyCreatedContent" | "autoTranslateWhenClickingALink" | "translateSelectedWhenPressTwice" | "translateTextOverMouseWhenPressTwice" | "translateClickingOnce" | "openaiCompatible"} DefaultConfigNames
   */
  const defaultConfig = {
    pageTranslatorService: "google", // google yandex openai_compatible
    textTranslatorService: "google", // google yandex bing deepl
    ttsSpeed: 1.0,
    enableDeepL: "yes",
    isTranslateTitle: "no",
    targetLanguage: null,
    targetLanguageTextTranslation: null,
    targetLanguages: [],
    alwaysTranslateSites: [],
    neverTranslateSites: [],
    specialRules: [],
    sitesToTranslateWhenHovering: [],
    langsToTranslateWhenHovering: [],
    alwaysTranslateLangs: [],
    neverTranslateLangs: [],
    customDictionary: new Map(),
    showTranslatePageContextMenu: "yes",
    showButtonInTheAddressBar: "yes",
    isShowDualLanguage: "yes",
    dualStyle:"none",
    customDualStyle:"",
    showPopupMobile: "yes",
    useOldPopup: "yes",
    darkMode: "auto",
    popupBlueWhenSiteIsTranslated: "yes",
    popupPanelSection: 1,
    showReleaseNotes: "no",
    hotkeys: {},
    translateTag_pre: "yes",
    dontSortResults: "no",
    translateDynamicallyCreatedContent: "yes",
    autoTranslateWhenClickingALink: "no",
    openaiCompatible: {
      providerPreset: "openai",
      baseUrl: "https://api.openai.com",
      apiKey: "",
      model: "gpt-4o-mini",
      fallbackService: "google",
      extraHeaders: {},
      systemPrompt: "You are a translation engine. Translate the given HTML content into the target language faithfully. Preserve HTML structure, inline placeholders, and ordering. Return only translated HTML."
    }
  };
  const config = structuredClone(defaultConfig);

  let onReadyObservers = [];
  let configIsReady = false;
  let onReadyResolvePromise;
  const onReadyPromise = new Promise(
    (resolve) => (onReadyResolvePromise = resolve)
  );

  /**
   * this function is executed when de config is ready
   */
  function readyConfig() {
    configIsReady = true;
    onReadyObservers.forEach((callback) => callback());
    onReadyObservers = [];
    onReadyResolvePromise();
  }

  const twpConfig = {};

  /**
   * create a listener to run when the settings are ready
   * @param {function} callback
   * @returns {Promise}
   */
  twpConfig.onReady = function (callback) {
    if (callback) {
      if (configIsReady) {
        callback();
      } else {
        onReadyObservers.push(callback);
      }
    }
    return onReadyPromise;
  };

  /**
   * get the value of a config
   * @example
   * twpConfig.get("targetLanguages")
   * // returns ["en", "es", "de"]
   * @param {DefaultConfigNames} name
   * @returns {*} value
   */
  twpConfig.get = function (name) {
    return config[name];
  };

  /**
   * set the value of a config
   * @example
   * twpConfig.set("showReleaseNotes", "no")
   * @param {DefaultConfigNames} name
   * @param {*} value
   */
  twpConfig.set = function (name, value) {
    // @ts-ignore
    config[name] = value;
    const obj = {};
    obj[name] = toObjectOrArrayIfTypeIsMapOrSet(value);
    chrome.storage.local.set(obj);
    observers.forEach((callback) => callback(name, value));
  };

  /**
   * export config as JSON string
   * @returns {string} configJSON
   */
  twpConfig.export = function () {
    const r = {
      timeStamp: Date.now(),
      version: chrome.runtime.getManifest().version,
    };

    for (const key in defaultConfig) {
      //@ts-ignore
      r[key] = toObjectOrArrayIfTypeIsMapOrSet(twpConfig.get(key));
    }

    return JSON.stringify(r, null, 4);
  };

  /**
   * import config and reload the extension
   * @param {string} configJSON
   */
  twpConfig.import = function (configJSON) {
    const newconfig = JSON.parse(configJSON);

    for (const key in defaultConfig) {
      if (typeof newconfig[key] !== "undefined") {
        let value = newconfig[key];
        value = fixObjectType(key, value);
        //@ts-ignore
        twpConfig.set(key, value);
      }
    }

    if (
      typeof browser !== "undefined" &&
      typeof browser.commands !== "undefined"
    ) {
      for (const name in config.hotkeys) {
        browser.commands.update({
          name: name,
          shortcut: config.hotkeys[name],
        });
      }
    }

    chrome.runtime.reload();
  };

  /**
   * restore the config to default and reaload the extension
   */
  twpConfig.restoreToDefault = function () {
    // try to reset the keyboard shortcuts
    if (
      typeof browser !== "undefined" &&
      typeof browser.commands !== "undefined"
    ) {
      for (const name of Object.keys(
        chrome.runtime.getManifest().commands || {}
      )) {
        const info = chrome.runtime.getManifest().commands[name];
        if (info.suggested_key && info.suggested_key.default) {
          browser.commands.update({
            name: name,
            shortcut: info.suggested_key.default,
          });
        } else {
          browser.commands.update({
            name: name,
            shortcut: "",
          });
        }
      }
    }

    twpConfig.import(JSON.stringify(defaultConfig));
  };

  /**
   * create a listener to run when a config changes
   * @param {function} callback
   */
  twpConfig.onChanged = function (callback) {
    observers.push(callback);
  };

  // listen to storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    twpConfig.onReady(function () {
      if (areaName === "local") {
        for (const name in changes) {
          const newValue = changes[name].newValue;
          if (config[name] !== newValue) {
            config[name] = fixObjectType(name, newValue);
            observers.forEach((callback) => callback(name, newValue));
          }
        }
      }
    });
  });

  // load config
  chrome.i18n.getAcceptLanguages((acceptedLanguages) => {
    chrome.storage.local.get(null, (onGot) => {
      // load config; convert object/array to map/set if necessary
      for (const name in onGot) {
        config[name] = fixObjectType(name, onGot[name]);
      }

      // if there are any targetLanguage undefined, replace them
      if (config.targetLanguages.some((tl) => !tl)) {
        config.targetLanguages = [...defaultTargetLanguages];
        chrome.storage.local.set({
          targetLanguages: config.targetLanguages,
        });
      }

      // Probably at this point it doesn't have 3 target languages.

      // try to get the 3 target languages through the user defined languages in the browser configuration.
      for (let lang of acceptedLanguages) {
        if (config.targetLanguages.length >= 1) break;
        lang = twpLang.fixTLanguageCode(lang);
        if (lang && config.targetLanguages.indexOf(lang) === -1) {
          config.targetLanguages.push(lang);
        }
      }

      // then try to use de array defaultTargetLanguages ["en", "es", "de"]
      for (const lang in defaultTargetLanguages) {
        if (config.targetLanguages.length >= 1) break;
        if (
          config.targetLanguages.indexOf(defaultTargetLanguages[lang]) === -1
        ) {
          config.targetLanguages.push(defaultTargetLanguages[lang]);
        }
      }

      // if targetLanguages is bigger than 3 remove the surplus
      while (config.targetLanguages.length > 1) config.targetLanguages.pop();

      /*
      // remove the duplicates languages
      config.targetLanguages = [... new Set(config.targetLanguages)]
      //*
      // then try to use de array defaultTargetLanguages ["en", "es", "de"]
      for (const lang of defaultTargetLanguages) {
        if (config.targetLanguages.length >= 3) break;
        if (config.targetLanguages.indexOf(lang) === -1) {
          config.targetLanguages.push(lang);
        }
      }
      //*/

      // if targetLanguage does not exits in targetLanguages, then set it to targetLanguages[0]
      if (
        !config.targetLanguage ||
        config.targetLanguages.indexOf(config.targetLanguage) === -1
      ) {
        config.targetLanguage = config.targetLanguages[0];
      }

      // if targetLanguageTextTranslation does not exits in targetLanguages, then set it to targetLanguages[0]
      if (
        !config.targetLanguageTextTranslation ||
        config.targetLanguages.indexOf(config.targetLanguageTextTranslation) ===
          -1
      ) {
        config.targetLanguageTextTranslation = config.targetLanguages[0];
      }

      // fix targetLanguages
      config.targetLanguages = config.targetLanguages.map((lang) =>
        twpLang.fixTLanguageCode(lang)
      );
      // fix neverTranslateLangs
      config.neverTranslateLangs = config.neverTranslateLangs.map((lang) =>
        twpLang.fixTLanguageCode(lang)
      );
      // fix alwaysTranslateLangs
      config.alwaysTranslateLangs = config.alwaysTranslateLangs.map((lang) =>
        twpLang.fixTLanguageCode(lang)
      );
      // fix targetLanguage
      config.targetLanguage = twpLang.fixTLanguageCode(config.targetLanguage);
      // fix targetLanguageTextTranslation
      config.targetLanguageTextTranslation = twpLang.fixTLanguageCode(
        config.targetLanguageTextTranslation
      );

      // if targetLanguage does not exits in targetLanguages, then set it to targetLanguages[0]
      if (config.targetLanguages.indexOf(config.targetLanguage) === -1) {
        config.targetLanguage = config.targetLanguages[0];
      }
      // if targetLanguageTextTranslation does not exits in targetLanguages, then set it to targetLanguages[0]
      if (
        config.targetLanguages.indexOf(config.targetLanguageTextTranslation) ===
        -1
      ) {
        config.targetLanguageTextTranslation = config.targetLanguages[0];
      }

      // try to save de keyboard shortcuts in the config
      if (typeof chrome.commands !== "undefined") {
        chrome.commands.getAll((results) => {
          try {
            for (const result of results) {
              config.hotkeys[result.name] = result.shortcut;
            }
            twpConfig.set("hotkeys", config.hotkeys);
          } catch (e) {
            console.error(e);
          } finally {
            readyConfig();
          }
        });
      } else {
        readyConfig();
      }
    });
  });

  function addInArray(configName, value) {
    const array = twpConfig.get(configName);
    if (array.indexOf(value) === -1) {
      array.push(value);
      twpConfig.set(configName, array);
    }
  }

  function addInMap(configName, key, value) {
    let map = twpConfig.get(configName);
    if (typeof map.get(key) === "undefined") {
      map.set(key, value);
      twpConfig.set(configName, map);
    }
  }

  function removeFromArray(configName, value) {
    const array = twpConfig.get(configName);
    const index = array.indexOf(value);
    if (index > -1) {
      array.splice(index, 1);
      twpConfig.set(configName, array);
    }
  }

  function removeFromMap(configName, key) {
    const map = twpConfig.get(configName);
    if (typeof map.get(key) !== "undefined") {
      map.delete(key);
      twpConfig.set(configName, map);
    }
  }

  twpConfig.addSiteToTranslateWhenHovering = function (hostname) {
    addInArray("sitesToTranslateWhenHovering", hostname);
  };

  twpConfig.removeSiteFromTranslateWhenHovering = function (hostname) {
    removeFromArray("sitesToTranslateWhenHovering", hostname);
  };

  twpConfig.addLangToTranslateWhenHovering = function (lang) {
    addInArray("langsToTranslateWhenHovering", lang);
  };

  twpConfig.removeLangFromTranslateWhenHovering = function (lang) {
    removeFromArray("langsToTranslateWhenHovering", lang);
  };

  twpConfig.addSiteToAlwaysTranslate = function (hostname) {
    addInArray("alwaysTranslateSites", hostname);
    removeFromArray("neverTranslateSites", hostname);
  };
  twpConfig.removeSiteFromAlwaysTranslate = function (hostname) {
    removeFromArray("alwaysTranslateSites", hostname);
  };
  twpConfig.addSiteToNeverTranslate = function (hostname) {
    addInArray("neverTranslateSites", hostname);
    removeFromArray("alwaysTranslateSites", hostname);
    removeFromArray("sitesToTranslateWhenHovering", hostname);
  };
  twpConfig.addRuleToSpecialRules = function (hostname) {
    addInArray("specialRules", hostname);
  };
  twpConfig.addKeyWordTocustomDictionary = function (key, value) {
    addInMap("customDictionary", key, value);
  };
  twpConfig.removeSiteFromNeverTranslate = function (hostname) {
    removeFromArray("neverTranslateSites", hostname);
  };
  twpConfig.removeRuleFromSpecialRules = function (hostname) {
    removeFromArray("specialRules", hostname);
  };
  twpConfig.removeKeyWordFromcustomDictionary = function (keyWord) {
    removeFromMap("customDictionary", keyWord);
  };
  twpConfig.addLangToAlwaysTranslate = function (lang, hostname) {
    addInArray("alwaysTranslateLangs", lang);
    removeFromArray("neverTranslateLangs", lang);

    if (hostname) {
      removeFromArray("neverTranslateSites", hostname);
    }
  };
  twpConfig.removeLangFromAlwaysTranslate = function (lang) {
    removeFromArray("alwaysTranslateLangs", lang);
  };
  twpConfig.addLangToNeverTranslate = function (lang, hostname) {
    addInArray("neverTranslateLangs", lang);
    removeFromArray("alwaysTranslateLangs", lang);
    removeFromArray("langsToTranslateWhenHovering", lang);

    if (hostname) {
      removeFromArray("alwaysTranslateSites", hostname);
    }
  };
  twpConfig.removeLangFromNeverTranslate = function (lang) {
    removeFromArray("neverTranslateLangs", lang);
  };

  /**
   * Add a new lang to the targetLanguages and remove the last target language. If the language is already in the targetLanguages then move it to the first position
   * @example
   * addTargetLanguage("de")
   * @param {string} lang - langCode
   * @returns
   */
  function addTargetLanguage(lang) {
    const targetLanguages = twpConfig.get("targetLanguages");
    lang = twpLang.fixTLanguageCode(lang);
    if (!lang) return;

    const index = targetLanguages.indexOf(lang);
    if (index === -1) {
      targetLanguages.unshift(lang);
      targetLanguages.pop();
    } else {
      targetLanguages.splice(index, 1);
      targetLanguages.unshift(lang);
    }

    twpConfig.set("targetLanguages", targetLanguages);
  }

  /**
   * set lang as target language for page translation only (not text translation)
   *
   * if the lang in not in targetLanguages then call addTargetLanguage
   * @example
   * twpConfig.setTargetLanguage("de",  true)
   * @param {string} lang - langCode
   * @param {boolean} forTextToo - also call setTargetLanguageTextTranslation
   * @returns
   */
  twpConfig.setTargetLanguage = function (lang, forTextToo = false) {
    const targetLanguages = twpConfig.get("targetLanguages");
    lang = twpLang.fixTLanguageCode(lang);
    if (!lang) return;

    if (targetLanguages.indexOf(lang) === -1 || forTextToo) {
      addTargetLanguage(lang);
    }

    twpConfig.set("targetLanguage", lang);

    if (forTextToo) {
      twpConfig.setTargetLanguageTextTranslation(lang);
    }
  };

  /**
   * set lang as target language for text translation only (not page translation)
   * @example
   * twpConfig.setTargetLanguage("de")
   * @param {string} lang - langCode
   * @returns
   */
  twpConfig.setTargetLanguageTextTranslation = function (lang) {
    lang = twpLang.fixTLanguageCode(lang);
    if (!lang) return;

    twpConfig.set("targetLanguageTextTranslation", lang);
  };

  /**
   * convert object to map or set if necessary, otherwise return the value itself
   * @example
   * fixObjectType("customDictionary", {})
   * // returns Map
   * fixObjectType("targetLanguages", ["en", "es", "de"])
   * // return ["en", "es", "de"] -- Array
   * @param {string} key
   * @param {*} value
   * @returns {Map | Set | *}
   */
  function fixObjectType(key, value) {
    if (defaultConfig[key] instanceof Map) {
      return new Map(Object.entries(value));
    } else if (defaultConfig[key] instanceof Set) {
      return new Set(value);
    } else {
      return value;
    }
  }

  /**
   * convert map and set to object and array respectively, otherwise return the value itself
   * @example
   * toObjectOrArrayIfTypeIsMapOrSet(new Map())
   * // returns {}
   * toObjectOrArrayIfTypeIsMapOrSet({})
   * // returns {}
   * @param {Map | Set | *} value
   * @returns {Object | Array | *}
   */
  function toObjectOrArrayIfTypeIsMapOrSet(value) {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    } else if (value instanceof Set) {
      return Array.from(value);
    } else {
      return value;
    }
  }

  return twpConfig;
})();


"use strict";

const platformInfo = {};

twpConfig.onReady(function () {
  if (typeof chrome !== "undefined" && chrome.tabs) {
    twpConfig.set("originalUserAgent", navigator.userAgent);
  }

  let userAgent;
  if (twpConfig.get("originalUserAgent")) {
    userAgent = twpConfig.get("originalUserAgent");
  } else {
    userAgent = navigator.userAgent;
  }

  platformInfo.isMac =  navigator.platform.indexOf('Mac') > -1;
  platformInfo.isMobile = {
    Android: userAgent.match(/Android/i),
    BlackBerry: userAgent.match(/BlackBerry/i),
    iOS: userAgent.match(/iPhone|iPad|iPod/i),
    Opera: userAgent.match(/Opera Mini/i),
    Windows: userAgent.match(/IEMobile/i) || userAgent.match(/WPDesktop/i),
  };
  platformInfo.isMobile.any =
    platformInfo.isMobile.Android ||
    platformInfo.isMobile.BlackBerry ||
    platformInfo.isMobile.iOS ||
    platformInfo.isMobile.Opera ||
    platformInfo.isMobile.Windows;

  platformInfo.isDesktop = {
    any: !platformInfo.isMobile.any,
  };
});


"use strict";

void (function () {
  /**
   * Gets the localized string for the specified message
   * @example
   * getMessage("lblAlwaysTranslate", "German")
   * // returns "Always translate from German"
   * getMessage("lblAlwaysTranslate", ["German"])
   * // returns "Always translate from German"
   * @param {string} messageName
   * @param {string | string[]} substitutions
   * @returns {string} localizedString
   */
  function getMessage(messageName, substitutions) {
    if (typeof imtRuntime !== "undefined" && imtRuntime.getMessage) {
      const text = imtRuntime.getMessage(messageName, substitutions);
      if (text) return text;
    }
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
      return chrome.i18n.getMessage(messageName, substitutions);
    }
    return "";
  }

  /**
   * translate attribute in all childNodes
   * @param {Document | HTMLElement} root
   * @param {string} attributeName
   */
  function translateAttributes(root, attributeName) {
    for (const element of root.querySelectorAll(
      `[data-i18n-${attributeName}]`
    )) {
      let text = getMessage(
        element.getAttribute(`data-i18n-${attributeName}`),
        element.getAttribute("data-i18n-ph-value")
      );
      if (!text) {
        continue;
      }

      element.setAttribute(attributeName, text);
    }
  }

  /**
   * translate innerText and attributes for a Document or HTMLElement
   * @param {Document | HTMLElement} root
   */
  //@ts-ignore
  chrome.i18n.translateDocument = function (root = document) {
    for (const element of root.querySelectorAll("[data-i18n]")) {
      let text = getMessage(
        element.getAttribute("data-i18n"),
        element.getAttribute("data-i18n-ph-value")
      );
      if (!text) {
        continue;
      }
      element.textContent = text;
    }

    for (const element of root.querySelectorAll("[data-i18n-html]")) {
      let text = getMessage(
        element.getAttribute("data-i18n-html"),
        undefined
      );
      if (!text) {
        continue;
      }
      element.innerHTML = text;
    }
    translateAttributes(root, "title");
    translateAttributes(root, "placeholder");
    translateAttributes(root, "label");
  };

  // detects if this script is not a contentScript and then call i18n.translateDocument
  if (typeof chrome !== "undefined" && typeof chrome.tabs !== "undefined") {
    //@ts-ignore
    chrome.i18n.translateDocument();
  }
})();


const specialRules = [
  {
    "hostname": [
      "twitter.com",
      "tweetdeck.twitter.com",
      "mobile.twitter.com"
    ],
    "selectors": [
      "[data-testid=\"tweetText\"]",
      ".tweet-text",
      ".js-quoted-tweet-text",
      "[data-testid='card.layoutSmall.detail'] > div:nth-child(2)",
      "[data-testid='developerBuiltCardContainer'] > div:nth-child(2)",
      "[data-testid='card.layoutLarge.detail'] > div:nth-child(2)",
    ],
    "detectLanguage":true

  },
  {
    "name":"ycombinator",
    "hostname": "news.ycombinator.com",
    "selectors": [
      ".titleline > a",
      ".comment",
      ".toptext",
      "a.hn-item-title",
      ".hn-comment-text",
      ".hn-story-title"
      
    ],
  },
  {
    "hostname": "www.reddit.com",
    "selectors": [
      "h1",
      "[data-click-id=body] h3",
      "[data-click-id=background] h3"
    ],
    "containerSelectors": [
      "[data-testid=comment]",
      "[data-adclicklocation=media]",
      ".Comment__body",
      "faceplate-batch .md"
    ],
    "detectLanguage":true
  },
  {
    "name":"oldRedditCompact",
    "regex":"old\.reddit\.com.*\/\.compact$",
    "selectors":[".title > a"],
    "containerSelectors":[".usertext-body"],
    "detectLanguage":true
  },
  {
    "name":"oldReddit",
    "hostname": "old.reddit.com",
    "selectors": [
      "p.title > a"
    ],
    "containerSelectors": [
      "[role=main] .md-container"
    ],
    "detectLanguage":true
  },
  {
    "regex": "finance.yahoo.com/$",
    "selectors": [
      "h3"
    ]
  },
  {
    "regex": [
      "www.bloomberg.com/[A-Za-z0-9]+$",
      "www.bloomberg.com/$"
    ],
    "selectors": [
      "article h3",
      "article .single-story-module__headline-link",
      "article [data-tracking-type=Story]",
      "article .story-list-story__info__headline"
    ]
  },
  {
    "hostname": "www.cell.com",
    "selectors": [
      "div.section-paragraph > div.section-paragraph > div.section-paragraph",
      "section > div.section-paragraph",
      "h4",
      "h3",
      "h2"
    ]
  },
  {
    "hostname": [
      "www.msdmanuals.com",
    ],
    "noTranslateSelectors": [
      ".d-none"
    ]
  },
  {
    "hostname": "www.reuters.com",
    "containerSelectors": "main"
  },
  {
    "regex": "finance.yahoo.com/news",
    "containerSelectors": "[role=article]"
  },
  {
    "hostname": "www.whatsonweibo.com",
    "containerSelectors": "#mvp-post-main"
  },
  {
    "hostname": [
      "www.wsj.com",
      "www.economist.com"
    ],
    "containerSelectors": "main"
  },
  {
    "hostname": [
      "mail.jabber.org",
      "antirez.com"
    ],
    "selectors": [
      "pre"
    ],
    "containerSelectors": "pre",
    "style": "none"
  },
  {
    "hostname": "github.com",
    "selectors":[".markdown-title"],
    "containerSelectors": ".markdown-body",
    "detectLanguage":true
  },
  {
    "hostname": "www.youtube.com",
    "selectors": [
      "#content-text"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "www.facebook.com",
    "selectors": [
      "div[data-ad-comet-preview=message] > div > div",
      "div[role=article] > div > div > div > div > div > div > div > div "
    ],
    "detectLanguage":true
  },
  {
    "regex": "\.substack\.com\/",
    "selectors": [
      ".post-preview-title",
      ".post-preview-description",
      
    ],
    "containerSelectors": [
      ".post",
      ".comment-body"
    ]
  },
  {
    "hostname": "www.nature.com",
    "containerSelectors": "article"
  },
  {
    "name":"seekingalpha",
    "hostname": "seekingalpha.com",
    "selectors":["[data-test-id='post-list-item'] h3"],
    "containerSelectors": ["div.wsb_section","[data-test-id=card-container]"],
    "brToParagraph": true
  },
  {
    "hostname": "hn.algolia.com",
    "selectors": [
      ".Story_title"
    ]
  },
  {
    "hostname": "read.readwise.io",
    "selectors": [
      "div[class^=\"_titleRow_\"]",
      "div[class^=\"_description_\"]"
    ],
    "containerSelectors": [
      "#document-text-content"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "www.inoreader.com",
    "selectors": [
      ".article_title"
    ],
    "containerSelectors": [
      ".article_content"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "mail.google.com",
    "selectors": [
      "h2[data-thread-perm-id]",
      "span[data-thread-id]"
    ],
    "containerSelectors": [
      "div[data-message-id]"
    ],
    "blockElements": [
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "OL",
      "P",
      "LI"
    ],
    
    "detectLanguage":true
  },
  {
    "hostname": "www.producthunt.com",
    "selectors": [
      "h2",
      "div.layoutCompact div[class^='styles_htmlText__']",
      ".fontWeight-400.fontSize-desktop-16.color-lighter-grey",
      "a[href^='/discussions/'].fontWeight-600",
      "div.color-darker-grey.fontSize-14.fontWeight-400.noOfLines-undefined",
      "div.color-darker-grey.fontSize-16.fontWeight-400.noOfLines-undefined"
    ],
    "containerSelectors": [
      "div[class^='styles_htmlText__']"
    ]
  },
  {
    "hostname": "arxiv.org",
    "selectors": [
      "blockquote.abstract",
      "h1"
    ]
  },
  {
    "name":"discord",
    "hostname": "discord.com",
    "selectors": [
      "div[id^='message-content-']",
      "div[class^='header-']",
    ],
    "detectLanguage":true
  },
  {
    "regex": "web.telegram.org/z/",
    "selectors": [
      ".text-content"
    ],
    "detectLanguage":true
  },
  {
    "hostname":"gist.github.com",
    "containerSelectors":[
      ".markdown-body",".readme"
    ],
  
    "detectLanguage":true
  },
  {
    "hostname": "www.politico.com",
    "containerSelectors": "main"
  },
  {

    "hostname":"lobste.rs",
    "selectors":[".u-repost-of"],
    "containerSelectors":[".comment_text"]
  },
  {
    "regex":"\.slack\.com\/",
    "selectors":[".p-rich_text_section"],
    "detectLanguage":true
  },
  {
    "hostname":"1paragraph.app",
    "selectors":["[xmlns='http://www.w3.org/1999/xhtml']"]
  },{
    "hostname":"www.nytimes.com",
    "selectors":["h1"],
    "containerSelectors":"[name=articleBody]"
  },
  {
    "hostname":"reader.960960.xyz",
    "selectors":["body > *"],
    "iframeContainer": "iframe"
  },{
    "name":"stackoverflow",
    "hostname":["stackoverflow.com","superuser.com","askubuntu.com","serverfault.com"],
    "regex":"stackexchange\.com",
    "selectors":[".s-post-summary--content-title","h1 > a",".comment-copy"],
    "containerSelectors":"[itemprop=text]"
  },{
    "hostname":"app.daily.dev",
    "selectors":["h1",".typo-body","article h3"],
    "containerSelectors":"[class^=markdown_markdown]"
  },{
    "name":"google",
    "regex":"^https:\/\/www\.google\.",
    "selectors":["h2","a h3","div[data-content-feature='1'] > div","a [aria-level='3']","a [aria-level='3'] + div",".Uroaid"],
    "detectLanguage":true

  },{
    "hostname":"www.urbandictionary.com",
    "selectors":["div.meaning","div.example"],
  },{
    "hostname":"answers.microsoft.com",
    "selectors":["h1","div.thread-message-content div.thread-message-content-body-text"],
    "containerSelectors":["div.thread-message-content-body-text",]
  },
  {
    "hostname":"www.getrevue.co",
    "selectors":[".item-header",".revue-p",".introduction-subject",".revue-ul > li",".header-text"]
  },
  {
    "regex":"www\.pixelmator\.com\/community\/",
    "selectors":[".content",".topic-title",".topictitle"]
  },
  {
    "hostname":"kyivindependent.com",
    "selectors":["[class^=CardFeaturedBlock_cardFeaturedBlock__title]","[class^=CardBasic_cardBasic__title]","[class^=CardExclusive_cardExclusive__title]","[class^=card-horizontal-small_cardHorizontalSmall__title]"],
    "containerSelectors":"article"
  },
  {
    "hostname":"lowendtalk.com",
    "selectors":["[role=heading]","h1"],
    "containerSelectors":".userContent"
  },
  {
    "hostname":"zlibrary24tuxziyiyfr7zd46ytefdqbqd2axkmxm4o5374ptpc52fad.onion",
    "selectors":[".blogText",".jscommentsCommentText"]
  },
  {
    "hostname":"www.sciencedirect.com",
    "selectors":["h1"],
    "containerSelectors":"article"
  },
  {
    "hostname":"www.linkedin.com",
    "selectors":[
      ".feed-shared-update-v2__description-wrapper",
    ],
    "containerSelectors":[
      "article.jobs-description__container"
    ]
  },{
    "hostname":"www.indiehackers.com",
    "containerSelectors":[
      ".content",
    ],
    "selectors":["h1",".feed-item__title-link"]
  },{
    "hostname":"libreddit.de",
    "selectors":[
      "h2.post_title"
    ],
    "containerSelectors":[
      ".comment_body > .md"
    ]
  },{
    "hostname":"www.notion.so",
    "regex":"notion\.site",
    "selectors":[
      "div[data-block-id]"
    ]
  },{
    "hostname":"www.newyorker.com",
    "selectors":["h1","[data-testid=SummaryItemHed]"],
    "containerSelectors":["[data-testid=BodyWrapper]"]
  },{
    "hostname":"start.me",
    "selectors":[".rss-article__title",".rss-articles-list__article-link",".rss-showcase__title",".rss-showcase__text"]
  },{
    "regex":"developer\.apple\.com\/documentation",
    "selectors":[".contenttable .content","h3.title"]
  }
]


"use strict";

const translationCache = (function () {
  const translationCache = {};

  /**
   * @typedef {Object} CacheEntry
   * @property {String} originalText
   * @property {String} translatedText
   * @property {String} detectedLanguage
   * @property {String} key
   */

  class Utils {
    /**
     * Returns the size of a ObjectStorage
     * @param {IDBDatabase} db
     * @param {string} storageName
     * @returns {Promise<number>} Promise\<size\>
     */
    static async getTableSize(db, storageName) {
      return await new Promise((resolve, reject) => {
        if (db == null) return reject();
        let size = 0;
        const transaction = db
          .transaction([storageName])
          .objectStore(storageName)
          .openCursor();

        transaction.onsuccess = (event) => {
          const cursor = transaction.result;
          if (cursor) {
            const storedObject = cursor.value;
            const json = JSON.stringify(storedObject);
            size += json.length;
            cursor.continue();
          } else {
            resolve(size);
          }
        };
        transaction.onerror = (err) =>
          reject("error in " + storageName + ": " + err);
      });
    }

    /**
     * Returns the size of a database
     * @param {string} dbName
     * @returns {Promise<number>} Promise\<size\>
     */
    static async getDatabaseSize(dbName) {
      return await new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = request.onblocked = (event) => {
          console.error(event);
          reject();
        };
        request.onsuccess = (event) => {
          try {
            const db = request.result;
            const tableNames = [...db.objectStoreNames];
            ((tableNames, db) => {
              const tableSizeGetters = tableNames.reduce((acc, tableName) => {
                acc.push(Utils.getTableSize(db, tableName));
                return acc;
              }, []);

              Promise.all(tableSizeGetters)
                .then((sizes) => {
                  const total = sizes.reduce((acc, val) => acc + val, 0);
                  resolve(total);
                })
                .catch((e) => {
                  console.error(e);
                  reject();
                });
            })(tableNames, db);
          } finally {
            request.result.close();
          }
        };
      });
    }

    /**
     * Converts a size in bytes to a human-readable string.
     * @example
     * humanReadableSize(1024)
     * // returns "1.0KB"
     * @param {number} bytes
     * @returns {string} sizeString
     */
    static humanReadableSize(bytes) {
      const thresh = 1024;
      if (Math.abs(bytes) < thresh) {
        return bytes + " B";
      }
      const units = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
      let u = -1;
      do {
        bytes /= thresh;
        ++u;
      } while (Math.abs(bytes) >= thresh && u < units.length - 1);
      return bytes.toFixed(1) + " " + units[u];
    }

    /**
     * Returns a Promise that resolves to a sha1 string of the given text.
     * @example
     * await stringToSHA1String("Hello World!")
     * // returns "2ef7bde608ce5404e97d5f042f95f89f1c232871"
     * @param {string} message text
     * @returns {Promise<string>} Promise\<sha1String\>
     */
    static async stringToSHA1String(message) {
      const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
      const hashBuffer = await crypto.subtle.digest("SHA-1", msgUint8); // hash the message
      const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert bytes to hex string
    }
  }

  class Cache {
    /**
     * Base class to create a translation cache for different services.
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     */
    constructor(translationService, sourceLanguage, targetLanguage) {
      /** @type {string} */
      this.translationService = translationService;
      /** @type {string} */
      this.sourceLanguage = sourceLanguage;
      /** @type {string} */
      this.targetLanguage = targetLanguage;
      /** @type {Map<string, CacheEntry>} */
      this.cache = new Map();
      /** @type {Promise<boolean>} */
      this.promiseStartingCache = null;
    }

    /**
     * Start the translation cache
     * @returns {Promise<boolean>}
     */
    async start() {
      if (this.promiseStartingCache) return await this.promiseStartingCache;
      this.promiseStartingCache = new Promise((resolve) => {
        Cache.openDataBaseCache(
          this.translationService,
          this.sourceLanguage,
          this.targetLanguage
        )
          .then((db) => {
            this.db = db;
            resolve(true);
          })
          .catch((e) => {
            console.error(e);
            Cache.deleteDatabase(
              this.translationService,
              this.sourceLanguage,
              this.targetLanguage
            );
            resolve(false);
          });
      });
      return await this.promiseStartingCache;
    }

    /**
     * Closes the database.
     */
    close() {
      if (this.db) this.db.close();
      this.db = null;
    }

    /**
     * Queries an entry in the translation cache, through the hash of the source text.
     * @param {string} origTextHash
     * @returns {Promise<CacheEntry>}
     */
    async #queryInDB(origTextHash) {
      return await new Promise((resolve, reject) => {
        if (!this.db) return reject();

        const storageName = Cache.getCacheStorageName();
        const objectStore = this.db
          .transaction([storageName], "readonly")
          .objectStore(storageName);
        const request = objectStore.get(origTextHash);

        request.onsuccess = (event) => {
          const result = request.result;
          resolve(result);
        };

        request.onerror = (event) => {
          console.error(event);
          reject();
        };
      });
    }

    /**
     * Query translation cache data
     * @param {string} originalText
     * @returns {Promise<CacheEntry>}
     */
    async query(originalText) {
      const hash = await Utils.stringToSHA1String(originalText);

      let translation = this.cache.get(hash);
      if (translation) return translation;

      translation = await this.#queryInDB(hash);
      if (translation) this.cache.set(hash, translation);

      return translation;
    }

    /**
     * Store the data in the database
     * @param {CacheEntry} data
     * @returns {Promise<boolean>}
     */
    async #addInDb(data) {
      return await new Promise((resolve) => {
        if (!this.db) return resolve(false);

        const storageName = Cache.getCacheStorageName();
        const objectStore = this.db
          .transaction([storageName], "readwrite")
          .objectStore(storageName);
        const request = objectStore.put(data);

        request.onsuccess = (event) => {
          resolve(true);
        };

        request.onerror = (event) => {
          console.error(event);
          resolve(false);
        };
      });
    }

    /**
     * Add to translation cache
     * @param {string} originalText
     * @param {string} translatedText
     * @param {string} detectedLanguage
     * @returns {Promise<boolean>}
     */
    async add(originalText, translatedText, detectedLanguage = "und") {
      const hash = await Utils.stringToSHA1String(originalText);
      return await this.#addInDb({
        originalText,
        translatedText,
        detectedLanguage,
        key: hash,
      });
    }

    /**
     * Returns the name of the database using the given data.
     * @example
     * getDataBaseName("google", "de", "en")
     * // returns "google@de.en"
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @returns {string} databaseName
     */
    static getDataBaseName(translationService, sourceLanguage, targetLanguage) {
      return `${translationService}@${sourceLanguage}.${targetLanguage}`;
    }

    /**
     * Returns the storageName
     * @example
     * getCacheStorageName()
     * // returns "cache"
     * @returns {string} storageName
     */
    static getCacheStorageName() {
      return "cache";
    }

    /**
     * Start/create a database with the given data.
     * @param {string} name
     * @param {number} version
     * @param {string[]} objectStorageNames
     * @returns {Promise<IDBDatabase>}
     */
    static async openIndexeddb(name, version, objectStorageNames) {
      return await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);

        request.onsuccess = (event) => {
          console.info(request.result);
          resolve(request.result);
        };

        request.onerror = request.onblocked = (event) => {
          console.error(
            "Error opening the database, switching to non-database mode",
            event
          );
          reject();
        };

        request.onupgradeneeded = (event) => {
          const db = request.result;

          for (const storageName of objectStorageNames) {
            db.createObjectStore(storageName, {
              keyPath: "key",
            });
          }
        };
      });
    }

    /**
     * Start/create a database for the translation cache with the given data.
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @returns {Promise<IDBDatabase>}
     */
    static async openDataBaseCache(
      translationService,
      sourceLanguage,
      targetLanguage
    ) {
      const dbName = Cache.getDataBaseName(
        translationService,
        sourceLanguage,
        targetLanguage
      );
      const storageName = Cache.getCacheStorageName();
      const db = await Cache.openIndexeddb(dbName, 1, [storageName]);
      return db;
    }

    /**
     * Delete a database.
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @returns {Promise<boolean>}
     */
    static async deleteDatabase(
      translationService,
      sourceLanguage,
      targetLanguage
    ) {
      return await new Promise((resolve) => {
        try {
          const dbName = Cache.getDataBaseName(
            translationService,
            sourceLanguage,
            targetLanguage
          );
          const request = indexedDB.deleteDatabase(dbName);

          request.onsuccess = (event) => {
            resolve(true);
          };

          request.onerror = (event) => {
            console.error(event);
            resolve(false);
          };
        } catch (e) {
          console.error(e);
          resolve(false);
        }
      });
    }
  }

  class CacheList {
    /**
     * Defines a translation cache manager.
     */
    constructor() {
      /** @type {Map<string, Cache>} */
      this.list = new Map();
      try {
        this.#openCacheList();
      } catch (e) {
        console.error(e);
      }
    }

    /**
     * Starts the connection to the database cacheList.
     */
    #openCacheList() {
      const request = indexedDB.open("cacheList", 1);

      request.onsuccess = (event) => {
        this.dbCacheList = request.result;

        // If any translation cache was created while waiting for the cacheList to be created.
        // Then add all these entries to the cacheList.
        this.list.forEach((cache, key) => {
          this.#addCacheList(key);
        });
      };

      request.onerror = request.onblocked = (event) => {
        console.error("Error opening the database", event);
        this.dbCacheList = null;
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;

        db.createObjectStore("cache_list", {
          keyPath: "dbName",
        });
      };
    }

    /**
     * Stores a new translation cache name to cacheList.
     * @param {string} dbName
     */
    #addCacheList(dbName) {
      if (!this.dbCacheList) return;

      const storageName = "cache_list";
      const objectStore = this.dbCacheList
        .transaction([storageName], "readwrite")
        .objectStore(storageName);
      const request = objectStore.put({ dbName });

      request.onsuccess = (event) => {};

      request.onerror = (event) => {
        console.error(event);
      };
    }

    /**
     * Create and start a translation cache then add to cacheList.
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @returns {Promise<Cache>}
     */
    async #createCache(translationService, sourceLanguage, targetLanguage) {
      const cache = new Cache(
        translationService,
        sourceLanguage,
        targetLanguage
      );
      this.#addCache(translationService, sourceLanguage, targetLanguage, cache);
      try {
        await cache.start();
      } catch (e) {
        console.error(e);
      }
      return cache;
    }

    /**
     * Get a translation cache from the given data.
     * If the translation cache does not exist, create a new one.
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @returns {Promise<Cache>}
     */
    async getCache(translationService, sourceLanguage, targetLanguage) {
      const dbName = Cache.getDataBaseName(
        translationService,
        sourceLanguage,
        targetLanguage
      );
      const cache = this.list.get(dbName);
      if (cache) {
        await cache.promiseStartingCache;
        return cache;
      } else {
        return await this.#createCache(
          translationService,
          sourceLanguage,
          targetLanguage
        );
      }
    }

    /**
     * Adds a new translation cache name to the "list" and if possible stores it in the cacheList database.
     * @param {string} translationService
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Cache} cache
     */
    #addCache(translationService, sourceLanguage, targetLanguage, cache) {
      const dbName = Cache.getDataBaseName(
        translationService,
        sourceLanguage,
        targetLanguage
      );
      this.list.set(dbName, cache);
      try {
        this.#addCacheList(dbName);
      } catch {}
    }

    /**
     * Get the name of all translation caches.
     * @example
     * #getAllDBNames()
     * // returns ["google@de.en", "google@zh-CN.es", "yandex@ru.pt"]
     * @returns {Promise<string[]>}
     */
    async #getAllDBNames() {
      if (!this.dbCacheList) return [];
      return await new Promise((resolve) => {
        const storageName = "cache_list";
        const objectStore = this.dbCacheList
          .transaction([storageName], "readonly")
          .objectStore(storageName);
        const request = objectStore.getAllKeys();

        request.onsuccess = (event) => {
          // TODO this cast is realy necessary?
          //cast
          resolve(/** @type {string[]} */ (request.result));
        };

        request.onerror = (event) => {
          console.error(event);
          resolve([]);
        };
      });
    }

    /**
     * Delete all translation caches.
     * And clear the cache list.
     * @returns {Promise<boolean>}
     */
    async deleteAll() {
      try {
        /** @type {Array<Promise>} */
        const promises = [];
        this.list.forEach((cache, key) => {
          if (cache) cache.close();
          promises.push(CacheList.deleteDatabase(key));
        });
        this.list.clear();
        const dbnames = await this.#getAllDBNames();
        dbnames.forEach((dbName) => {
          promises.push(CacheList.deleteDatabase(dbName));
        });
        await Promise.all(promises);
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    }

    /**
     * Delete a database by its name.
     * @returns {Promise<boolean>}
     */
    static async deleteDatabase(dbName) {
      return await new Promise((resolve) => {
        const DBDeleteRequest = indexedDB.deleteDatabase(dbName);

        DBDeleteRequest.onsuccess = () => {
          console.info("Database deleted successfully");
          resolve(true);
        };

        DBDeleteRequest.onerror = () => {
          console.warn("Error deleting database.");
          resolve(false);
        };
      });
    }

    /**
     * Gets the sum of the size of all translation caches.
     * @example
     * await calculateSize()
     * // returns "1.0MB"
     * @returns {Promise<string>}
     */
    async calculateSize() {
      try {
        /** @type {Array<Promise>} */
        const promises = [];
        const dbnames = await this.#getAllDBNames();
        dbnames.forEach((dbName) => {
          promises.push(Utils.getDatabaseSize(dbName));
        });
        const results = await Promise.all(promises);
        return Utils.humanReadableSize(
          results.reduce((total, size) => total + size, 0)
        );
      } catch (e) {
        console.error(e);
        return Utils.humanReadableSize(0);
      }
    }
  }

  // Create a translation cache list.
  const cacheList = new CacheList();

  /**
   * Get a new translation cache entry.
   * @param {string} translationService
   * @param {string} sourceLanguage
   * @param {string} targetLanguage
   * @param {string} originalText
   * @returns {Promise<CacheEntry>} cacheEntry
   */
  translationCache.get = async (
    translationService,
    sourceLanguage,
    targetLanguage,
    originalText
  ) => {
    try {
      const cache = await cacheList.getCache(
        translationService,
        sourceLanguage,
        targetLanguage
      );
      return await cache.query(originalText);
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Defines a new entry in the translation cache.
   * @param {string} translationService
   * @param {string} sourceLanguage
   * @param {string} targetLanguage
   * @param {string} originalText
   * @param {string} translatedText
   * @param {string} detectedLanguage
   * @returns {Promise<boolean>}
   */
  translationCache.set = async (
    translationService,
    sourceLanguage,
    targetLanguage,
    originalText,
    translatedText,
    detectedLanguage
  ) => {
    try {
      const cache = await cacheList.getCache(
        translationService,
        sourceLanguage,
        targetLanguage
      );
      return await cache.add(originalText, translatedText, detectedLanguage);
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Delete all translation caches.
   * If `reload` is `true` reloads the extension after deleting caches.
   * @param {boolean} reload
   */
  translationCache.deleteTranslationCache = async (reload = false) => {
    try {
      // Deletes old translation cache.
      if (indexedDB && indexedDB.deleteDatabase) {
        indexedDB.deleteDatabase("googleCache");
        indexedDB.deleteDatabase("yandexCache");
        indexedDB.deleteDatabase("bingCache");
      }
      // Delete the new translation cache.
      await cacheList.deleteAll();
    } catch (e) {
      console.error(e);
    } finally {
      if (reload) chrome.runtime.reload();
    }
  };

  let promiseCalculatingStorage = null;
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getCacheSize") {
      if (!promiseCalculatingStorage) {
        promiseCalculatingStorage = cacheList.calculateSize();
      }

      promiseCalculatingStorage
        .then((size) => {
          promiseCalculatingStorage = null;
          sendResponse(size);
          return size;
        })
        .catch((e) => {
          console.error(e);
          promiseCalculatingStorage = null;
          sendResponse("0B");
          return "0B";
        });
      return true;
    } else if (request.action === "deleteTranslationCache") {
      translationCache.deleteTranslationCache(request.reload);
    }
  });

  return translationCache;
})();


"use strict";

const translationService = (function () {
  const translationService = {};

  function normalizeOpenaiBaseUrl(baseUrl) {
    baseUrl = (baseUrl || "https://api.openai.com").trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      baseUrl = "https://" + baseUrl;
    }
    return baseUrl.replace(/\/$/, "");
  }

  function buildOpenAICompatibleEndpoint(baseUrl) {
    if (baseUrl.endsWith("/v1/chat/completions")) return baseUrl;
    if (baseUrl.endsWith("/v1")) return baseUrl + "/chat/completions";
    return baseUrl + "/v1/chat/completions";
  }

  async function requestWithRuntime(details) {
    if (typeof imtRuntime !== "undefined" && imtRuntime.request) {
      return await imtRuntime.request(details);
    }
    const response = await fetch(details.url, {
      method: details.method || "GET",
      headers: details.headers,
      body: details.body,
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      json: async function () { return JSON.parse(this.text); },
    };
  }

  function buildOpenAICompatibleConfigPatch(presetKey) {
    switch (presetKey) {
      case "openai":
        return {
          providerPreset: "openai",
          baseUrl: "https://api.openai.com",
          model: "gpt-4o-mini",
        };
      case "openrouter":
        return {
          providerPreset: "openrouter",
          baseUrl: "https://openrouter.ai/api",
          model: "openai/gpt-4o-mini",
          extraHeaders: {
            "HTTP-Referer": "https://github.com/Aioneas/immersive-lite",
            "X-Title": "Immersive Lite",
          },
        };
      case "deepseek":
        return {
          providerPreset: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-chat",
        };
      case "custom":
      default:
        return {
          providerPreset: "custom",
        };
    }
  }

  function extractJsonArrayFromText(content) {
    if (Array.isArray(content)) return content;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    const candidates = [trimmed];
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlock && codeBlock[1]) candidates.push(codeBlock[1].trim());
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch && arrayMatch[0]) candidates.push(arrayMatch[0]);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return null;
  }

  function normalizeTranslatedArray(translatedArray, sourceArray) {
    if (!Array.isArray(translatedArray)) return null;
    let normalized = translatedArray.map((item) => {
      if (typeof item === "string") return item;
      if (item == null) return "";
      if (typeof item === "object") {
        return item.text || item.translation || item.translatedText || JSON.stringify(item);
      }
      return String(item);
    });

    if (normalized.length === sourceArray.length) return normalized;
    if (normalized.length === 1 && sourceArray.length > 1) {
      return sourceArray.map((_, idx) => (idx === 0 ? normalized[0] : ""));
    }
    if (normalized.length > sourceArray.length) {
      return normalized.slice(0, sourceArray.length);
    }
    if (normalized.length < sourceArray.length) {
      while (normalized.length < sourceArray.length) normalized.push("");
      return normalized;
    }
    return normalized;
  }

  async function requestOpenAICompatibleTranslation(sourceLanguage, targetLanguage, sourceArray) {
    const cfg = twpConfig.get("openaiCompatible") || {};
    const baseUrl = normalizeOpenaiBaseUrl(cfg.baseUrl);
    const endpoint = buildOpenAICompatibleEndpoint(baseUrl);
    const apiKey = (cfg.apiKey || "").trim();
    const model = (cfg.model || "gpt-4o-mini").trim();
    const systemPrompt = (cfg.systemPrompt || "You are a translation engine. Translate the given HTML content into the target language faithfully. Preserve HTML structure, inline placeholders, and ordering. Return only translated HTML.").trim();
    const providerPreset = cfg.providerPreset || "custom";
    if (!apiKey && providerPreset !== "custom") {
      throw new Error("OpenAI-compatible API key is missing. Please configure it in Options > Translations.");
    }
    if (providerPreset === "custom" && !apiKey) {
      console.warn("[openai_compatible] API key is empty for custom preset; request will be sent without Authorization header.");
    }

    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;
    if (providerPreset === "openrouter" && !headers["HTTP-Referer"]) {
      headers["HTTP-Referer"] = "https://github.com/Aioneas/immersive-lite";
      headers["X-Title"] = "Immersive Lite";
    }
    if (cfg.extraHeaders && typeof cfg.extraHeaders === "object") {
      for (const key of Object.keys(cfg.extraHeaders)) {
        headers[key] = cfg.extraHeaders[key];
      }
    }

    const payloadBase = {
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Translate the following HTML fragment array into the target language.\n" +
            "Return valid JSON only in the form: {\"translations\":[\"...\"]}.\n" +
            "The array length must exactly match the input length.\n" +
            "Preserve placeholders, tags, order, and meaning.\n" +
            "SOURCE_LANGUAGE: " + sourceLanguage + "\n" +
            "TARGET_LANGUAGE: " + targetLanguage + "\n" +
            "INPUT_JSON: " + JSON.stringify(sourceArray),
        },
      ],
    };

    async function sendPayload(payload) {
      const requestBody = JSON.stringify(payload);
      const response = await requestWithRuntime({
        url: endpoint,
        method: "POST",
        headers,
        body: requestBody,
      });
      const text = response.text || "";
      if (!response.ok) {
        const err = new Error("OpenAI-compatible request failed: " + response.status + " " + text);
        err.responseText = text;
        err.status = response.status;
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("OpenAI-compatible response parse failed: " + text.slice(0, 200));
      }
    }

    let data;
    try {
      data = await sendPayload(payloadBase);
    } catch (e) {
      const text = (e && (e.responseText || e.message)) || "";
      if (String(text).includes("response_format")) {
        const payloadFallback = { ...payloadBase };
        delete payloadFallback.response_format;
        data = await sendPayload(payloadFallback);
      } else {
        throw e;
      }
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI-compatible response missing content");

    let translatedArray = null;
    try {
      const parsed = JSON.parse(content);
      translatedArray = parsed?.translations || parsed?.data || parsed;
    } catch (e) {
      translatedArray = extractJsonArrayFromText(content);
    }

    translatedArray = normalizeTranslatedArray(translatedArray, sourceArray);
    if (!translatedArray) {
      throw new Error("OpenAI-compatible response could not be parsed into a translation array");
    }
    return translatedArray;
  }

  async function translateWithOpenAICompatible(sourceLanguage, targetLanguage, sourceArray2d) {
    const results = [];
    const fallbackService = twpConfig.get("openaiCompatible")?.fallbackService || "google";
    for (const sourceArray of sourceArray2d) {
      try {
        const translatedArray = await requestOpenAICompatibleTranslation(sourceLanguage, targetLanguage, sourceArray);
        results.push(translatedArray);
      } catch (e) {
        console.error("[openai_compatible]", e);
        if (fallbackService && fallbackService !== "none") {
          try {
            const service = serviceList.get(fallbackService) || serviceList.get("google");
            const fallbackResults = await service.translate(sourceLanguage, targetLanguage, [sourceArray]);
            results.push(fallbackResults[0]);
          } catch (fallbackError) {
            throw e;
          }
        } else {
          throw e;
        }
      }
    }
    return results;
  }

  class Utils {
    /**
     * Replace the characters `& < > " '` with `&amp; &lt; &gt; &quot; &#39;`.
     * @param {string} unsafe
     * @returns {string} escapedString
     */
    static escapeHTML(unsafe) {
      return unsafe
        .replace(/\&/g, "&amp;")
        .replace(/\</g, "&lt;")
        .replace(/\>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/\'/g, "&#39;");
    }

    /**
     * Replace the characters `&amp; &lt; &gt; &quot; &#39;` with `& < > " '`.
     * @param {string} unsafe
     * @returns {string} unescapedString
     */
    static unescapeHTML(unsafe) {
      return unsafe
        .replace(/\&amp;/g, "&")
        .replace(/\&lt;/g, "<")
        .replace(/\&gt;/g, ">")
        .replace(/\&quot;/g, '"')
        .replace(/\&\#39;/g, "'");
    }
  }

  class GoogleHelper {
    static get googleTranslateTKK() {
      return "448487.932609646";
    }

    /**
     *
     * @param {number} num
     * @param {string} optString
     * @returns {number}
     */
    static shiftLeftOrRightThenSumOrXor(num, optString) {
      for (let i = 0; i < optString.length - 2; i += 3) {
        /** @type {string|number} */
        let acc = optString.charAt(i + 2);
        if ("a" <= acc) {
          acc = acc.charCodeAt(0) - 87;
        } else {
          acc = Number(acc);
        }
        if (optString.charAt(i + 1) == "+") {
          acc = num >>> acc;
        } else {
          acc = num << acc;
        }
        if (optString.charAt(i) == "+") {
          num += acc & 4294967295;
        } else {
          num ^= acc;
        }
      }
      return num;
    }

    /**
     *
     * @param {string} query
     * @returns {Array<number>}
     */
    static transformQuery(query) {
      /** @type {Array<number>} */
      const bytesArray = [];
      let idx = 0;
      for (let i = 0; i < query.length; i++) {
        let charCode = query.charCodeAt(i);

        if (128 > charCode) {
          bytesArray[idx++] = charCode;
        } else {
          if (2048 > charCode) {
            bytesArray[idx++] = (charCode >> 6) | 192;
          } else {
            if (
              55296 == (charCode & 64512) &&
              i + 1 < query.length &&
              56320 == (query.charCodeAt(i + 1) & 64512)
            ) {
              charCode =
                65536 +
                ((charCode & 1023) << 10) +
                (query.charCodeAt(++i) & 1023);
              bytesArray[idx++] = (charCode >> 18) | 240;
              bytesArray[idx++] = ((charCode >> 12) & 63) | 128;
            } else {
              bytesArray[idx++] = (charCode >> 12) | 224;
            }
            bytesArray[idx++] = ((charCode >> 6) & 63) | 128;
          }
          bytesArray[idx++] = (charCode & 63) | 128;
        }
      }
      return bytesArray;
    }

    /**
     * Calculates the hash (TK) of a query for google translator.
     * @param {string} query
     * @returns {string}
     */
    static calcHash(query) {
      const windowTkk = GoogleHelper.googleTranslateTKK;
      const tkkSplited = windowTkk.split(".");
      const tkkIndex = Number(tkkSplited[0]) || 0;
      const tkkKey = Number(tkkSplited[1]) || 0;

      const bytesArray = GoogleHelper.transformQuery(query);

      let encondingRound = tkkIndex;
      for (const item of bytesArray) {
        encondingRound += item;
        encondingRound = GoogleHelper.shiftLeftOrRightThenSumOrXor(
          encondingRound,
          "+-a^+6"
        );
      }
      encondingRound = GoogleHelper.shiftLeftOrRightThenSumOrXor(
        encondingRound,
        "+-3^+b+-f"
      );

      encondingRound ^= tkkKey;
      if (encondingRound <= 0) {
        encondingRound = (encondingRound & 2147483647) + 2147483648;
      }

      const normalizedResult = encondingRound % 1000000;
      return normalizedResult.toString() + "." + (normalizedResult ^ tkkIndex);
    }
  }

  class YandexHelper {
    /** @type {number} */
    static #lastRequestSidTime = null;
    /** @type {string} */
    static #translateSid = null;
    /** @type {boolean} */
    static #SIDNotFound = false;
    /** @type {Promise<void>} */
    static #findPromise = null;

    static get translateSid() {
      return YandexHelper.#translateSid;
    }

    /**
     * Find the SID of Yandex Translator. The SID value is used in translation requests.
     * @returns {Promise<void>}
     */
    static async findSID() {
      if (YandexHelper.#findPromise) return await YandexHelper.#findPromise;
      YandexHelper.#findPromise = new Promise(async (resolve) => {
        let updateYandexSid = false;
        if (YandexHelper.#lastRequestSidTime) {
          const date = new Date();
          if (YandexHelper.#translateSid) {
            date.setHours(date.getHours() - 12);
          } else if (YandexHelper.#SIDNotFound) {
            date.setMinutes(date.getMinutes() - 30);
          } else {
            date.setMinutes(date.getMinutes() - 2);
          }
          if (date.getTime() > YandexHelper.#lastRequestSidTime) {
            updateYandexSid = true;
          }
        } else {
          updateYandexSid = true;
        }

        if (updateYandexSid) {
          YandexHelper.#lastRequestSidTime = Date.now();
          try{

            const response = await fetch("https://translate.yandex.net/website-widget/v1/widget.js?widgetId=ytWidget&pageLang=es&widgetTheme=light&autoMode=false")
            const text = await response.text()
            const result = text.match(/sid\:\s\'[0-9a-f\.]+/);
            if (result && result[0] && result[0].length > 7) {
              YandexHelper.#translateSid = result[0].substring(6);
              YandexHelper.#SIDNotFound = false;
            } else {
              YandexHelper.#SIDNotFound = true;
            }
                          resolve();

          }catch(e){

            console.warn('fetch yandex sid failed',e)
            resolve()
          }
        } else {
          resolve();
        }
      });

      YandexHelper.#findPromise.finally(() => {
        YandexHelper.#findPromise = null;
      });

      return await YandexHelper.#findPromise;
    }
  }

  class BingHelper {
    /** @type {number} */
    static #lastRequestSidTime = null;
    /** @type {string} */
    static #translateSid = null;
    /** @type {string} */
    static #translate_IID_IG = null;
    /** @type {boolean} */
    static #SIDNotFound = false;
    /** @type {Promise<void>} */
    static #sidPromise = null;

    static get translateSid() {
      return BingHelper.#translateSid;
    }

    static get translate_IID_IG() {
      return BingHelper.#translate_IID_IG;
    }
    /**
     * Find the SID (IID and IG) of Bing Translator. The SID value is used in translation requests.
     * @returns {Promise<void>}
     */
    static async findSID() {
      if (BingHelper.#sidPromise) return await BingHelper.#sidPromise;
      BingHelper.#sidPromise = new Promise(async (resolve) => {
        let updateYandexSid = false;
        if (BingHelper.#lastRequestSidTime) {
          const date = new Date();
          if (BingHelper.#translateSid) {
            date.setHours(date.getHours() - 12);
          } else if (BingHelper.#SIDNotFound) {
            date.setMinutes(date.getMinutes() - 30);
          } else {
            date.setMinutes(date.getMinutes() - 2);
          }
          if (date.getTime() > BingHelper.#lastRequestSidTime) {
            updateYandexSid = true;
          }
        } else {
          updateYandexSid = true;
        }

        if (updateYandexSid) {
          BingHelper.#lastRequestSidTime = Date.now();

          try{
            const response = await fetch("https://www.bing.com/translator")
            const text = await response.text()
            const result = text.match(
              /params_RichTranslateHelper\s=\s\[[^\]]+/
            );
            const data_iid_r = text.match(
              /data-iid\=\"[a-zA-Z0-9\.]+/
            );
            const IG_r = text.match(/IG\:\"[a-zA-Z0-9\.]+/);
            if (
              result &&
              result[0] &&
              result[0].length > 50 &&
              data_iid_r &&
              data_iid_r[0] &&
              IG_r &&
              IG_r[0]
            ) {
              const params_RichTranslateHelper = result[0]
                .substring("params_RichTranslateHelper = [".length)
                .split(",");
              const data_iid = data_iid_r[0].substring('data-iid="'.length);
              const IG = IG_r[0].substring('IG:"'.length);
              if (
                params_RichTranslateHelper &&
                params_RichTranslateHelper[0] &&
                params_RichTranslateHelper[1] &&
                parseInt(params_RichTranslateHelper[0]) &&
                data_iid &&
                IG
              ) {
                BingHelper.#translateSid = `&token=${params_RichTranslateHelper[1].substring(
                  1,
                  params_RichTranslateHelper[1].length - 1
                )}&key=${parseInt(params_RichTranslateHelper[0])}`;
                BingHelper.#translate_IID_IG = `IG=${IG}&IID=${data_iid}`;
                BingHelper.#SIDNotFound = false;
              } else {
                BingHelper.#SIDNotFound = true;
              }
            } else {
              BingHelper.#SIDNotFound = true;
            }
            resolve();
          }catch(e){
            console.warn('fetch bing sid failed',e)
            resolve()
          }

        } else {
          resolve();
        }
      });

      BingHelper.#sidPromise.finally(() => {
        BingHelper.#sidPromise = null;
      });

      return await BingHelper.#sidPromise;
    }
  }

  /**
   * Base class to create new translation services.
   */
  class Service {
    /**
     * Returns a string with additional parameters to be concatenated to the request URL.
     * @callback callback_cbParameters
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<TranslationInfo>} requests
     * @returns {string}
     */

    /**
     * Takes `sourceArray` and returns a request string to the translation service.
     * @callback callback_cbTransformRequest
     * @param {string[]} sourceArray
     * @returns {string}
     */

    /**
     * @typedef {{text: string, detectedLanguage: string}} Service_Single_Result_Response
     */

    /**
     * Receives the response from the *http request* and returns `Service_Single_Result_Response[]`.
     *
     * Returns a string with the body of a request of type **POST**.
     * @callback callback_cbParseResponse
     * @param {Object} response
     * @returns {Array<Service_Single_Result_Response>}
     */

    /**
     * Takes a string formatted with the translated text and returns a `resultArray`.
     * @callback callback_cbTransformResponse
     * @param {String} response
     * @param {boolean} dontSortResults
     * @returns {string[]} resultArray
     */

    /** @typedef {"complete" | "translating" | "error"} TranslationStatus */
    /**
     * @typedef {Object} TranslationInfo
     * @property {String} originalText
     * @property {String} translatedText
     * @property {String} detectedLanguage
     * @property {TranslationStatus} status
     * @property {Promise<void>} waitTranlate
     */

    /**
     * Initializes the **Service** class with information about the new translation service.
     * @param {string} serviceName
     * @param {string} baseURL
     * @param {"GET" | "POST"} xhrMethod
     * @param {callback_cbTransformRequest} cbTransformRequest Takes `sourceArray` and returns a request string to the translation service.
     * @param {callback_cbParseResponse} cbParseResponse Receives the response from the *http request* and returns `Service_Single_Result_Response[]`.
     * @param {callback_cbTransformResponse} cbTransformResponse Takes a string formatted with the translated text and returns a `resultArray`.
     * @param {callback_cbParameters} cbGetExtraParameters Returns a string with additional parameters to be concatenated to the request URL.
     * @param {callback_cbParameters} cbGetRequestBody Returns a string with the body of a request of type **POST**.
     */
    constructor(
      serviceName,
      baseURL,
      xhrMethod = "GET",
      cbTransformRequest,
      cbParseResponse,
      cbTransformResponse,
      cbGetExtraParameters = null,
      cbGetRequestBody = null
    ) {
      this.serviceName = serviceName;
      this.baseURL = baseURL;
      this.xhrMethod = xhrMethod;
      this.cbTransformRequest = cbTransformRequest;
      this.cbParseResponse = cbParseResponse;
      this.cbTransformResponse = cbTransformResponse;
      this.cbGetExtraParameters = cbGetExtraParameters;
      this.cbGetRequestBody = cbGetRequestBody;
      /** @type {Map<string, TranslationInfo>} */
      this.translationsInProgress = new Map();
    }

    /**
     * Receives the `sourceArray2d` parameter and prepares the requests.
     * Calls `cbTransformRequest` for each `sourceArray` of `sourceArray2d`.
     * The `currentTranslationsInProgress` array will be the **final result** with requests already completed or in progress. And the `requests` array will only contain the new requests that need to be made.
     *
     * Checks if there is already an identical request in progress or if it is already in the translation cache.
     * If it doesn't exist, add it to `requests` to make a new *http request*.
     *
     * Requests longer than **800 characters** will be split into new requests.
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<string[]>} sourceArray2d
     * @returns {Promise<[Array<TranslationInfo[]>, TranslationInfo[]]>} `requests`, `currentTranslationsInProgress`
     */
    async getRequests(sourceLanguage, targetLanguage, sourceArray2d) {
      /** @type {Array<TranslationInfo[]>} */
      const requests = [];
      /** @type {TranslationInfo[]} */
      const currentTranslationsInProgress = [];

      let currentRequest = [];
      let currentSize = 0;

      for (const sourceArray of sourceArray2d) {
        const requestString = this.fixString(
          this.cbTransformRequest(sourceArray)
        );
        const requestHash = [
          sourceLanguage,
          targetLanguage,
          requestString,
        ].join(", ");

        const progressInfo = this.translationsInProgress.get(requestHash);
        if (progressInfo) {
          currentTranslationsInProgress.push(progressInfo);
        } else {
          /** @type {TranslationStatus} */
          let status = "translating";
          /** @type {() => void} */
          let promise_resolve = null;

          /** @type {TranslationInfo} */
          const progressInfo = {
            originalText: requestString,
            translatedText: null,
            detectedLanguage: null,
            get status() {
              return status;
            },
            set status(_status) {
              status = _status;
              promise_resolve();
            },
            waitTranlate: new Promise((resolve) => (promise_resolve = resolve)),
          };

          currentTranslationsInProgress.push(progressInfo);
          this.translationsInProgress.set(requestHash, progressInfo);

          //cast
          const cacheEntry = await translationCache.get(
            this.serviceName,
            sourceLanguage,
            targetLanguage,
            requestString
          );
          if (cacheEntry) {
            progressInfo.translatedText = cacheEntry.translatedText;
            progressInfo.detectedLanguage = cacheEntry.detectedLanguage;
            progressInfo.status = "complete";
            //this.translationsInProgress.delete([sourceLanguage, targetLanguage, requestString])
          } else {
            currentRequest.push(progressInfo);
            currentSize += progressInfo.originalText.length;
            if (currentSize > 800) {
              requests.push(currentRequest);
              currentSize = 0;
              currentRequest = [];
            }
          }
        }
      }

      if (currentRequest.length > 0) {
        requests.push(currentRequest);
        currentRequest = [];
        currentSize = 0;
      }

      return [requests, currentTranslationsInProgress];
    }

    /**
     * Makes a request using the fetch API. Returns a promise that will be resolved with the result of the request. If the request fails, the promise will be rejected.
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<TranslationInfo>} requests
     * @returns {Promise<*>}
     */

    async makeRequest(sourceLanguage, targetLanguage, requests) {


      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
      }


      const params = {
        method: this.xhrMethod,
        headers
      }
      params.body = this.cbGetExtraParameters
            ? this.cbGetRequestBody(sourceLanguage, targetLanguage, requests)
            : undefined


      const response = await fetch(this.baseURL+(this.cbGetExtraParameters
              ? this.cbGetExtraParameters(
                  sourceLanguage,
                  targetLanguage,
                  requests
                )
              : ""),params)
      if(response.ok){
        return response.json()
      }else{
        throw new Error(response.statusText)
      }

    }
    /**
     * Translates the `sourceArray2d`.
     *
     * If `dontSaveInPersistentCache` is **true** then the translation result will not be saved in the on-disk translation cache, only in the in-memory cache.
     *
     * The `dontSortResults` parameter is only valid when using the ***google*** translation service, if its value is **true** then the translation result will not be sorted.
     * @param {string} sourceLanguage
     * @param {string} targetLanguage
     * @param {Array<string[]>} sourceArray2d
     * @param {boolean} dontSaveInPersistentCache
     * @param {boolean} dontSortResults
     * @returns {Promise<string[][]>}
     */
    async translate(
      sourceLanguage,
      targetLanguage,
      sourceArray2d,
      dontSaveInPersistentCache = false,
      dontSortResults = false
    ) {
      const [requests, currentTranslationsInProgress] = await this.getRequests(
        sourceLanguage,
        targetLanguage,
        sourceArray2d
      );
      /** @type {Promise<void>[]} */
      const promises = [];

      for (const request of requests) {
        promises.push(
          this.makeRequest(sourceLanguage, targetLanguage, request)
            .then((response) => {
              const results = this.cbParseResponse(response);
              for (const idx in request) {
                const result = results[idx];
                this.cbTransformResponse(result.text, dontSortResults); // apenas para gerar error
                const transInfo = request[idx];
                transInfo.detectedLanguage = result.detectedLanguage || "und";
                transInfo.translatedText = result.text;
                transInfo.status = "complete";
                //this.translationsInProgress.delete([sourceLanguage, targetLanguage, transInfo.originalText])
                if (dontSaveInPersistentCache === false) {
                  translationCache.set(
                    this.serviceName,
                    sourceLanguage,
                    targetLanguage,
                    transInfo.originalText,
                    transInfo.translatedText,
                    transInfo.detectedLanguage
                  );
                }
              }
            })
            .catch((e) => {
              console.error(e);
              for (const transInfo of request) {
                transInfo.status = "error";
                //this.translationsInProgress.delete([sourceLanguage, targetLanguage, transInfo.originalText])
              }
            })
        );
      }
      await Promise.all(
        currentTranslationsInProgress.map((transInfo) => transInfo.waitTranlate)
      );
      return currentTranslationsInProgress.map((transInfo) =>
        this.cbTransformResponse(transInfo.translatedText, dontSortResults)
      );
    }

    /**
     * https://github.com/FilipePS/Traduzir-paginas-web/issues/484
     * @param {string} str
     * @returns {string} fixedStr
     */
    fixString(str) {
      return str.replace(/\u200b/g, " ");
    }
  }

  const googleService = new (class extends Service {
    constructor() {
      super(
        "google",
        "https://translate.googleapis.com/translate_a/t?anno=3&client=te&v=1.0&format=html",
        "POST",
        function cbTransformRequest(sourceArray) {
          sourceArray = sourceArray.map((text) => Utils.escapeHTML(text));
          if (sourceArray.length > 1) {
            sourceArray = sourceArray.map(
              (text, index) => `<a i=${index}>${text}</a>`
            );
          }
          // the <pre> tag is to preserve the text formating
          return `<pre>${sourceArray.join("")}</pre>`;
        },
        function cbParseResponse(response) {
          /** @type {[Service_Single_Result_Response]} */
          let responseJson;
          if (typeof response === "string") {
            responseJson = [{ text: response, detectedLanguage: null }];
          } else if (typeof response[0] === "string") {
            responseJson = response.map(
              /** @returns {Service_Single_Result_Response} */ (
                /** @type {string} */ value
              ) => ({ text: value, detectedLanguage: null })
            );
          } else {
            responseJson = response.map(
              /** @returns {Service_Single_Result_Response} */ (
                /** @type {[string, string]} */ value
              ) => ({ text: value[0], detectedLanguage: value[1] })
            );
          }
          return responseJson;
        },
        function cbTransformResponse(result, dontSortResults) {
          // remove the <pre> tag from the response
          if (result.indexOf("<pre") !== -1) {
            result = result.replace("</pre>", "");
            const index = result.indexOf(">");
            result = result.slice(index + 1);
          }

          /** @type {string[]} */
          const sentences = []; // each translated sentence is inside of <b> tag

          // The main objective is to remove the original text of each sentense that is inside the <i> tags.
          // Keeping only the <a> tags
          let idx = 0;
          while (true) {
            // each translated sentence is inside of <b> tag
            const sentenceStartIndex = result.indexOf("<b>", idx);
            if (sentenceStartIndex === -1) break;

            // the <i> tag is the original text in each sentence
            const sentenceFinalIndex = result.indexOf(
              "<i>",
              sentenceStartIndex
            );

            if (sentenceFinalIndex === -1) {
              sentences.push(result.slice(sentenceStartIndex + 3));
              break;
            } else {
              sentences.push(
                result.slice(sentenceStartIndex + 3, sentenceFinalIndex)
              );
            }
            idx = sentenceFinalIndex;
          }

          // maybe the response don't have any sentence (does not have <i> and <b> tags), is this case just use de result
          result = sentences.length > 0 ? sentences.join(" ") : result;
          // Remove the remaining </b> tags (usually the last)
          result = result.replace(/\<\/b\>/g, "");
          // Capture each <a i={number}> and put it in an array, the </a> will be ignored
          // maybe the same index appears several times
          // maybe some text will be outside of <a i={number}> (Usually text before the first <a> tag, and some whitespace between the <a> tags),
          // in this case, The outside text will be placed inside the <a i={number}> closer
          // https://github.com/FilipePS/Traduzir-paginas-web/issues/449
          // TODO lidar com tags dentro de tags e tags vazias
          // https://de.wikipedia.org/wiki/Wikipedia:Hauptseite
          // "{\"originalText\":\"<pre><a i=0>\\nFür den </a><a i=1>37. Schreib­wettbewerb</a><a i=2> und den </a><a i=3>18. Miniaturwettbewerb</a><a i=4> können ab sofort Artikel nominiert werden.</a></pre>\",\"translatedText\":\"<pre><a i=0>\\n</a>Artigos já podem ser indicados <a i=0>para o</a> <a i=1>37º Concurso de Redação <a i=2>e</a></a> <a i=3><a i=4>18º</a> Concurso de Miniaturas</a> .</pre>\",\"detectedLanguage\":\"de\",\"status\":\"complete\",\"waitTranlate\":{}}"
          let resultArray = [];
          let lastEndPos = 0;
          for (const r of result.matchAll(
            /(\<a\si\=[0-9]+\>)([^\<\>]*(?=\<\/a\>))*/g
          )) {
            const fullText = r[0];
            const fullLength = r[0].length;
            const pos = r.index;
            // if it is bigger then it has text outside the tags
            if (pos > lastEndPos) {
              const aTag = r[1];
              const insideText = r[2] || "";
              const outsideText = result
                .slice(lastEndPos, pos)
                .replace(/\<\/a\>/g, "");
              resultArray.push(aTag + outsideText + insideText);
            } else {
              resultArray.push(fullText);
            }
            lastEndPos = pos + fullLength;
          }
          // captures the final text outside the <a> tag
          {
            const lastOutsideText = result
              .slice(lastEndPos)
              .replace(/\<\/a\>/g, "");
            if (resultArray.length > 0) {
              resultArray[resultArray.length - 1] += lastOutsideText;
            }
          }
          // this is the old method, don't capture text outside of <a> tags
          // let resultArray = result.match(
          //   /\<a\si\=[0-9]+\>[^\<\>]*(?=\<\/a\>)/g
          // );

          if (dontSortResults) {
            // Should not sort the <a i={number}> of Google Translate result
            // Instead of it, join the texts without sorting
            // https://github.com/FilipePS/Traduzir-paginas-web/issues/163

            if (resultArray && resultArray.length > 0) {
              // get the text inside of <a i={number}>
              // the indexes is not needed in this case
              resultArray = resultArray.map((value) => {
                const resultStartAtIndex = value.indexOf(">");
                return value.slice(resultStartAtIndex + 1);
              });
            } else {
              // maybe the response don't have any <a i={number}>
              resultArray = [result];
            }

            // unescapeHTML
            resultArray = resultArray.map((value) => Utils.unescapeHTML(value));

            return resultArray;
          } else {
            // Sort Google translate results to keep the links with the correct name
            // Note: the links may also disappear; http://web.archive.org/web/20220919162911/https://de.wikipedia.org/wiki/Wikipedia:Hauptseite
            // each inline tag has a index starting with 0 <a i={number}>
            let indexes;
            if (resultArray && resultArray.length > 0) {
              // get the indexed of <a i={number}>
              indexes = resultArray
                .map((value) => parseInt(value.match(/[0-9]+(?=\>)/g)[0]))
                .filter((value) => !isNaN(value));
              // get the text inside of <a i={number}>
              resultArray = resultArray.map((value) => {
                const resultStartAtIndex = value.indexOf(">");
                return value.slice(resultStartAtIndex + 1);
              });
            } else {
              // maybe the response don't have any <a i={number}>
              resultArray = [result];
              indexes = [0];
            }

            // unescapeHTML
            resultArray = resultArray.map((value) => Utils.unescapeHTML(value));

            /** @type {string[]} */
            const finalResulArray = [];
            // sorte de results and put in finalResulArray
            for (const j in indexes) {
              if (finalResulArray[indexes[j]]) {
                finalResulArray[indexes[j]] += " " + resultArray[j];
              } else {
                finalResulArray[indexes[j]] = resultArray[j];
              }
            }

            return finalResulArray;
          }
        },
        function cbGetExtraParameters(
          sourceLanguage,
          targetLanguage,
          requests
        ) {
          return `&sl=${sourceLanguage}&tl=${targetLanguage}&tk=${GoogleHelper.calcHash(
            requests.map((info) => info.originalText).join("")
          )}`;
        },
        function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          return requests
            .map((info) => `&q=${encodeURIComponent(info.originalText)}`)
            .join("");
        }
      );
    }
  })();

  const yandexService = new (class extends Service {
    constructor() {
      super(
        "yandex",
        "https://translate.yandex.net/api/v1/tr.json/translate?srv=tr-url-widget",
        "GET",
        function cbTransformRequest(sourceArray) {
          return sourceArray
            .map((value) => Utils.escapeHTML(value))
            .join("<wbr>");
        },
        function cbParseResponse(response) {
          const lang = response.lang;
          const detectedLanguage = lang ? lang.split("-")[0] : null;
          return response.text.map(
            /** @return {Service_Single_Result_Response} */ (
              /** @type {string} */ text
            ) => ({ text, detectedLanguage })
          );
        },
        function cbTransformResponse(result, dontSortResults) {
          return result
            .split("<wbr>")
            .map((value) => Utils.unescapeHTML(value));
        },
        function cbGetExtraParameters(
          sourceLanguage,
          targetLanguage,
          requests
        ) {
          return `&id=${YandexHelper.translateSid}-0-0&format=html&lang=${
            sourceLanguage === "auto" ? "" : sourceLanguage + "-"
          }${targetLanguage}${requests
            .map((info) => `&text=${encodeURIComponent(info.originalText)}`)
            .join("")}`;
        },
        function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          return undefined;
        }
      );
    }

    /**
     * @param {boolean} dontSortResults This parameter is not needed in this translation service
     */
    async translate(
      sourceLanguage,
      targetLanguage,
      sourceArray2d,
      dontSaveInPersistentCache,
      dontSortResults = false
    ) {
      await YandexHelper.findSID();
      if (!YandexHelper.translateSid) return;
      if (sourceLanguage.startsWith("zh")) sourceLanguage = "zh";
      if (targetLanguage.startsWith("zh")) targetLanguage = "zh";
      return await super.translate(
        sourceLanguage,
        targetLanguage,
        sourceArray2d,
        dontSaveInPersistentCache,
        dontSortResults
      );
    }
  })();

  const bingService = new (class extends Service {
    constructor() {
      super(
        "bing",
        "https://www.bing.com/ttranslatev3?isVertical=1",
        "POST",
        function cbTransformRequest(sourceArray) {
          return sourceArray
            .map((value) => Utils.escapeHTML(value))
            .join("<wbr>");
        },
        function cbParseResponse(response) {
          return [
            {
              text: response[0].translations[0].text,
              detectedLanguage: response[0].detectedLanguage.language,
            },
          ];
        },
        function cbTransformResponse(result, dontSortResults) {
          return [Utils.unescapeHTML(result)];
        },
        function cbGetExtraParameters(
          sourceLanguage,
          targetLanguage,
          requests
        ) {
          return `&${BingHelper.translate_IID_IG}`;
        },
        function cbGetRequestBody(sourceLanguage, targetLanguage, requests) {
          return `&fromLang=${sourceLanguage}${requests
            .map((info) => `&text=${encodeURIComponent(info.originalText)}`)
            .join("")}&to=${targetLanguage}${BingHelper.translateSid}`;
        }
      );
    }

    /**
     * @param {string[][]} sourceArray2d - Only the string `sourceArray2d[0][0]` will be translated.
     * @param {boolean} dontSortResults - This parameter is not needed in this translation service
     */
    async translate(
      sourceLanguage,
      targetLanguage,
      sourceArray2d,
      dontSaveInPersistentCache,
      dontSortResults = false
    ) {
      /** @type {{search: string, replace: string}[]} */
      const replacements = [
        {
          search: "auto",
          replace: "auto-detect",
        },
        {
          search: "zh-CN",
          replace: "zh-Hans",
        },
        {
          search: "zh-TW",
          replace: "zh-Hant",
        },
        {
          search: "tl",
          replace: "fil",
        },
        {
          search: "hmn",
          replace: "mww",
        },
        {
          search: "ckb",
          replace: "kmr",
        },
        {
          search: "mn",
          replace: "mn-Cyrl",
        },
        {
          search: "no",
          replace: "nb",
        },
        {
          search: "sr",
          replace: "sr-Cyrl",
        },
      ];
      replacements.forEach((r) => {
        if (targetLanguage === r.search) {
          targetLanguage = r.replace;
        }
        if (sourceLanguage === r.search) {
          sourceLanguage = r.replace;
        }
      });

      await BingHelper.findSID();
      if (!BingHelper.translate_IID_IG) return;

      return await super.translate(
        sourceLanguage,
        targetLanguage,
        sourceArray2d,
        dontSaveInPersistentCache,
        dontSortResults
      );
    }
  })();

  const deeplService = new (class {
    constructor() {
      this.DeepLTab = null;
    }
    /**
     *
     * @param {string} sourceLanguage - This parameter is not used
     * @param {*} targetLanguage
     * @param {*} sourceArray2d - Only the string `sourceArray2d[0][0]` will be translated.
     * @param {*} dontSaveInPersistentCache - This parameter is not used
     * @param {*} dontSortResults - This parameter is not used
     * @returns
     */
    async translate(
      sourceLanguage,
      targetLanguage,
      sourceArray2d,
      dontSaveInPersistentCache,
      dontSortResults = false
    ) {
      return await new Promise((resolve) => {
        const waitFirstTranslationResult = () => {
          const listener = (request, sender, sendResponse) => {
            if (request.action === "DeepL_firstTranslationResult") {
              resolve([[request.result]]);
              chrome.runtime.onMessage.removeListener(listener);
            }
          };
          chrome.runtime.onMessage.addListener(listener);

          setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            resolve([[""]]);
          }, 8000);
        };

        if (this.DeepLTab) {
          chrome.tabs.get(this.DeepLTab.id, (tab) => {
            checkedLastError();
            if (tab) {
              //chrome.tabs.update(tab.id, {active: true})
              chrome.tabs.sendMessage(
                tab.id,
                {
                  action: "translateTextWithDeepL",
                  text: sourceArray2d[0][0],
                  targetLanguage,
                },
                {
                  frameId: 0,
                },
                (response) => resolve([[response]])
              );
            } else {
              chrome.tabs.create(
                {
                  url: `https://www.deepl.com/#!${targetLanguage}!#${encodeURIComponent(
                    sourceArray2d[0][0]
                  )}`,
                },
                (tab) => {
                  this.DeepLTab = tab;
                  waitFirstTranslationResult();
                }
              );
              // resolve([[""]])
            }
          });
        } else {
          chrome.tabs.create(
            {
              url: `https://www.deepl.com/#!${targetLanguage}!#${encodeURIComponent(
                sourceArray2d[0][0]
              )}`,
            },
            (tab) => {
              this.DeepLTab = tab;
              waitFirstTranslationResult();
            }
          );
          // resolve([[""]])
        }
      });
    }
  })();

  /** @type {Map<string, Service>} */
  const serviceList = new Map();

  serviceList.set("google", googleService);
  serviceList.set("yandex", yandexService);
  serviceList.set("bing", bingService);
  serviceList.set(
    "deepl",
    /** @type {Service} */ /** @type {?} */ (deeplService)
  );

  translationService.translateHTML = async (
    serviceName,
    sourceLanguage,
    targetLanguage,
    sourceArray2d,
    dontSaveInPersistentCache = false,
    dontSortResults = false
  ) => {
    serviceName = twpLang.getAlternativeService(
      targetLanguage,
      serviceName,
      true
    );
    if (serviceName === "openai_compatible") {
      return await translateWithOpenAICompatible(
        sourceLanguage,
        targetLanguage,
        sourceArray2d
      );
    }
    const service = serviceList.get(serviceName) || serviceList.get("google");
    return await service.translate(
      sourceLanguage,
      targetLanguage,
      sourceArray2d,
      dontSaveInPersistentCache,
      dontSortResults
    );
  };

  translationService.translateText = async (
    serviceName,
    sourceLanguage,
    targetLanguage,
    sourceArray,
    dontSaveInPersistentCache = false
  ) => {
    serviceName = twpLang.getAlternativeService(
      targetLanguage,
      serviceName,
      false
    );
    const service = serviceList.get(serviceName) || serviceList.get("google");
    return (
      await service.translate(
        sourceLanguage,
        targetLanguage,
        [sourceArray],
        dontSaveInPersistentCache
      )
    )[0];
  };

  translationService.translateSingleText = async (
    serviceName,
    sourceLanguage,
    targetLanguage,
    originalText,
    dontSaveInPersistentCache = false
  ) => {
    serviceName = twpLang.getAlternativeService(
      targetLanguage,
      serviceName,
      false
    );
    const service = serviceList.get(serviceName) || serviceList.get("google");
    return (
      await service.translate(
        sourceLanguage,
        targetLanguage,
        [[originalText]],
        dontSaveInPersistentCache
      )
    )[0][0];
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // If the translation request came from an incognito window, the translation should not be cached on disk.
    const dontSaveInPersistentCache = sender.tab ? sender.tab.incognito : false;
    if (request.action === "translateHTML") {
      translationService
        .translateHTML(
          request.translationService,
          "auto",
          request.targetLanguage,
          request.sourceArray2d,
          dontSaveInPersistentCache,
          request.dontSortResults
        )
        .then((results) => sendResponse(results))
        .catch((e) => {
          sendResponse();
          console.error(e);
        });

      return true;
    } else if (request.action === "translateText") {
      translationService
        .translateText(
          request.translationService,
          "auto",
          request.targetLanguage,
          request.sourceArray,
          dontSaveInPersistentCache
        )
        .then((results) => sendResponse(results))
        .catch((e) => {
          sendResponse();
          console.error(e);
        });

      return true;
    } else if (request.action === "translateSingleText") {
      translationService
        .translateSingleText(
          request.translationService,
          "auto",
          request.targetLanguage,
          request.source,
          dontSaveInPersistentCache
        )
        .then((results) => sendResponse(results))
        .catch((e) => {
          sendResponse();
          console.error(e);
        });

      return true;
    }
  });

  return translationService;
})();


"use strict";

var showOriginal = {}

twpConfig.onReady(function () {
    if (platformInfo.isMobile.any) {
        showOriginal.enable = () => {}
        showOriginal.disable = () => {}
        showOriginal.add = () => {}
        showOriginal.removeAll = () => {}
        return;
    }

    let styleTextContent = ""
    fetch(chrome.runtime.getURL("/contentScript/css/showOriginal.css"))
        .then(response => response.text())
        .then(response => styleTextContent = response)
        .catch(e => console.error(e))


    let originalTextIsShowing = false
    let divElement
    let shadowRoot
    let currentNodeOverMouse
    let timeoutHandler

    let nodesToShowOriginal = []

    const mousePos = {
        x: 0,
        y: 0
    }

    function onMouseMove(e) {
        mousePos.x = e.clientX
        mousePos.y = e.clientY
    }

    function onMouseDown(e) {
        if (!divElement) return;
        if (e.target === divElement) return;
        hideOriginalText()
    }

    function showOriginalText(node) {
        hideOriginalText()
        if (!divElement) return;
        if (window.isTranslatingSelected) return;

        const nodeInf = nodesToShowOriginal.find(nodeInf => nodeInf.node === node)
        if (nodeInf) {
            const eOriginalText = shadowRoot.getElementById("originalText")
            eOriginalText.textContent = nodeInf.original
            document.body.appendChild(divElement)
            originalTextIsShowing = true

            const height = eOriginalText.offsetHeight
            let top = mousePos.y + 10
            top = Math.max(0, top)
            top = Math.min(window.innerHeight - height, top)

            const width = eOriginalText.offsetWidth
            let left = parseInt(mousePos.x /*- (width / 2) */ )
            left = Math.max(0, left)
            left = Math.min(window.innerWidth - width, left)

            eOriginalText.style.top = top + "px"
            eOriginalText.style.left = left + "px"
        }
    }

    function hideOriginalText() {
        if (divElement) {
            divElement.remove()
            originalTextIsShowing = false
        }
        clearTimeout(timeoutHandler)
    }

    function isShowingOriginalText() {
        return originalTextIsShowing
    }

    function onMouseEnter(e) {
        if (!divElement) return;
        if (currentNodeOverMouse && e.target === currentNodeOverMouse) return;
        currentNodeOverMouse = e.target
        if (timeoutHandler) clearTimeout(timeoutHandler);
        timeoutHandler = setTimeout(showOriginalText, 1500, currentNodeOverMouse)
    }

    function onMouseOut(e) {
        if (!divElement) return;
        if (!isShowingOriginalText()) return;

        if (e.target === currentNodeOverMouse && e.relatedTarget === divElement) return;
        if (e.target === divElement && e.relatedTarget === currentNodeOverMouse) return;

        hideOriginalText()
    }

    showOriginal.add = function (node) {
        if (platformInfo.isMobile.any) return;

        if (node && nodesToShowOriginal.indexOf(node) === -1) {
            nodesToShowOriginal.push({
                node: node,
                original: node.textContent
            })
            node.addEventListener("mouseenter", onMouseEnter)
            node.addEventListener("mouseout", onMouseOut)
        }
    }

    showOriginal.removeAll = function () {
        nodesToShowOriginal.forEach(nodeInf => {
            nodeInf.node.removeEventListener("mouseenter", onMouseEnter)
            nodeInf.node.removeEventListener("mouseout", onMouseOut)
        })
        nodesToShowOriginal = []
    }

    showOriginal.enable = function (dontDeleteNodesToShowOriginal = false) {
        showOriginal.disable(dontDeleteNodesToShowOriginal)
        // disable this function, cause we have dual language display now.
        return;
        if (platformInfo.isMobile.any) return;
        if (divElement) return;

        divElement = document.createElement("div")
        divElement.style = "all: initial"
        divElement.classList.add("notranslate")

        shadowRoot = divElement.attachShadow({
            mode: "closed"
        })
        shadowRoot.innerHTML = `
            <link rel="stylesheet" href="${chrome.runtime.getURL("/contentScript/css/showOriginal.css")}">
            <div id="originalText" dir="auto"></div>
        `

        {
            const style = document.createElement("style")
            style.textContent = styleTextContent
            shadowRoot.insertBefore(style, shadowRoot.getElementById("originalText"))
        }

        function enableDarkMode() {
            if (!shadowRoot.getElementById("darkModeElement")) {
                const el = document.createElement("style")
                el.setAttribute("id", "darkModeElement")
                el.setAttribute("rel", "stylesheet")
                el.textContent = `
                    * {
                        scrollbar-color: #202324 #454a4d;
                    }
                    #originalText {
                        color: rgb(231, 230, 228) !important;
                        background-color: #181a1b !important;
                    }
                `
                shadowRoot.appendChild(el)
            }
        }

        function disableDarkMode() {
            if (shadowRoot.getElementById("#darkModeElement")) {
                shadowRoot.getElementById("#darkModeElement").remove()
            }
        }

        switch (twpConfig.get("darkMode")) {
            case "auto":
                if (matchMedia("(prefers-color-scheme: dark)").matches) {
                    enableDarkMode()
                } else {
                    disableDarkMode()
                }
                break
            case "yes":
                enableDarkMode()
                break
            case "no":
                disableDarkMode()
                break
            default:
                break
        }

        divElement.addEventListener("mouseout", onMouseOut)

        document.addEventListener("mousemove", onMouseMove)
        document.addEventListener("mousedown", onMouseDown)

        document.addEventListener("blur", hideOriginalText)
        document.addEventListener("visibilitychange", hideOriginalText)
    }

    showOriginal.disable = function (dontDeleteNodesToShowOriginal = false) {
        if (divElement) {
            hideOriginalText()
            divElement.remove()
            divElement = null
            shadowRoot = null
        }

        if (!dontDeleteNodesToShowOriginal) {
            showOriginal.removeAll()
        }

        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mousedown", onMouseDown)

        document.removeEventListener("blur", hideOriginalText)
        document.removeEventListener("visibilitychange", hideOriginalText)
    }
})



const enhanceMarkAttributeName = "data-translationmark";

const enhanceOriginalDisplayValueAttributeName = "data-translationoriginaldisplay";
const enhanceHtmlTagsInlineIgnore = ['BR', 'CODE', 'KBD', 'WBR'] // and input if type is submit or button, and pre depending on settings
const enhanceHtmlTagsNoTranslate = ['TITLE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'svg'] //TODO verificar porque 'svg' é com letras minúsculas
let blockElements = [
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6','TABLE',  'OL', 'P','LI'
  ];
if (twpConfig.get('translateTag_pre') !== 'yes') {
    blockElements.push('PRE')
}

const headingElements = ['h1' ];

const pdfSelectorsConfig =   {
    regex:
      "$a"
};

const inlineElements = [
  "a",
  "abbr",
  "acronym",
  "b",
  "bdo",
  "big",
  "br",
  "button",
  "cite",
  "code",
  "dfn",
  "em",
  "i",
  "img",
  "input",
  "kbd",
  "label",
  "map",
  "object",
  "output",
  "q",
  "samp",
  "script",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "textarea",
  "time",
  "tt",
  "var",
];


function addWrapperToNode(node, wrapper){
  try{

    const parent = node.parentNode;
        // set the wrapper as child (instead of the element)
    parent.replaceChild(wrapper, node);
        // set element as child of wrapper
    wrapper.appendChild(node);

  }catch(e){
    console.error('add wrapper error',e);
  }
}

function getPageSpecialConfig(ctx){
  const currentUrl = ctx.tabUrl;
  const currentUrlObj = new URL(currentUrl);
  const currentHostname = currentUrlObj.hostname;
  const currentUrlWithoutSearch = currentUrlObj.origin + currentUrlObj.pathname;

  // merge spcialRules

  let specialConfig = null;

  for(const enhance of specialRules){
    if(enhance.hostname){
      if(!Array.isArray(enhance.hostname)){
        enhance.hostname = [enhance.hostname];
      }
      if(enhance.hostname.indexOf(currentHostname) !== -1){
        return enhance;
      }
    }
    if(enhance.regex){
      if(!Array.isArray(enhance.regex)){
        enhance.regex = [enhance.regex];
      }
      let isMatched = false;
      for(const regex of enhance.regex){
        const reg = new RegExp(regex);
        if(reg.test(currentUrlWithoutSearch)){
            return enhance;
        }
      }
    }
  }


  // handle nitter, there are too many domains, so we detect it by meta, and element
  // if og:sitename is "Nitter", and there is class name tweet-content, then it is nitter
  const nitterMeta = document.querySelector('meta[property="og:site_name"]');
  if(nitterMeta && nitterMeta.getAttribute('content') === 'Nitter'){
    const nitterTweetContent = document.querySelector('.tweet-content');
    if(nitterTweetContent){
      specialConfig =  {
        name:"nitter",
        selectors:['.tweet-content','.quote-text']
      }
    }
  }


  // handle mastondon
  const mastodonId = document.querySelector('div#mastodon');
  const mastonText = document.querySelector('div.status__content__text');
  if(mastodonId){
    specialConfig =  {
      name:"mastodon",
      containerSelectors:'div.status__content__text',
      detectLanguage:true
    }
  }
  return specialConfig
}



function isValidNode(node){
  if(node.hasAttribute && node.hasAttribute(enhanceMarkAttributeName)){
    return false;
  }
  if(enhanceHtmlTagsInlineIgnore.indexOf(node.nodeName) !== -1 ||
  enhanceHtmlTagsNoTranslate.indexOf(node.nodeName) !== -1 ||
  node.classList.contains("notranslate") ||
  node.getAttribute("translate") === "no" ||
  node.isContentEditable) {
    return false
  }
  
  // check is parent has enhanceMarkAttributeName
  if(node.parentNode && node.parentNode.hasAttribute && node.parentNode.hasAttribute(enhanceMarkAttributeName)){
    return false;
  }
  // check ancestors
  if(node.closest && node.closest(`[${enhanceMarkAttributeName}=copiedNode]`)){
    return false;
  }
  // check is img node
  if(node.nodeName==="P"){
    // check all children nodes

    const children = node.childNodes;
    let isIncludeImg = node.querySelector('img');
    if(isIncludeImg && node.childNodes.length<3){
      // treat it as img node
      // check length
      const innerText = node.innerText;
      if(innerText.length<80){
        return false;
      }else{
        return true;
      }
    }
      

  }

  // check is there is notranslate class
  return true;
}
function showCopyiedNodes(){
  const copiedNodes = document.querySelectorAll(`[${enhanceMarkAttributeName}="copiedNode"]`);
  for(const node of copiedNodes){
    // @ts-ignore: its ok
    if(node && node.style && node.style.display === "none"){
       // delete display
      const originalDisplay = node.getAttribute(enhanceOriginalDisplayValueAttributeName);
      if(originalDisplay){
        // @ts-ignore: its ok
        node.style.display = originalDisplay;
      } else {
        // delete display
        // @ts-ignore: its ok
        node.style.removeProperty("display");
      }
    }
  }

}
function removeCopyiedNodes(){
  const copiedNodes = document.querySelectorAll(`[${enhanceMarkAttributeName}="copiedNode"]`);
  for(const node of copiedNodes){
    node.remove()
  }
}


function isBody(el) {
  return document.body === el;
}
function isDuplicatedChild(array,child){
  for(const item of array){
    if(item.contains(child)){
      return true;
    }
  }
  return false;
}
async function getNodesThatNeedToTranslate(root,ctx,options){
  options = options || {};
  const pageSpecialConfig = getPageSpecialConfig(ctx);
  const twpConfig = ctx.twpConfig
  const neverTranslateLangs = twpConfig.get('neverTranslateLangs');
  const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
  const allBlocksSelectors = pageSpecialConfig && pageSpecialConfig.selectors || []
  const noTranslateSelectors = pageSpecialConfig && pageSpecialConfig.noTranslateSelectors || []
  if(noTranslateSelectors.length > 0){
    const noTranslateNodes = root.querySelectorAll(noTranslateSelectors.join(","));
    for(const node of noTranslateNodes){
      // add class notranslate
      // node.classList.add("notranslate");
      // add parent placeholder for position
      const placeholder = document.createElement("span");
      placeholder.classList.add("notranslate");
      addWrapperToNode(node,placeholder);
    }
  }


  // all block nodes, nodes should have a order from top to bottom
  let allNodes = [];

  const currentUrl = ctx.tabUrl;
  const currentUrlObj = new URL(currentUrl);
  const currentUrlWithoutSearch = currentUrlObj.origin + currentUrlObj.pathname;
  const currentHostname = currentUrlObj.hostname;
  let currentTargetLanguage = twpConfig.get("targetLanguage")

  // special for mail.google.com, cause there are too many table, we should remove table
  if(pageSpecialConfig && pageSpecialConfig.blockElements){
    blockElements = pageSpecialConfig.blockElements;
  }
  let isIframeContainer = false;
  // check sites
  if(allBlocksSelectors.length>0){
    // check id iframe
    if(pageSpecialConfig && pageSpecialConfig.iframeContainer){
      const iframeContainer = root.querySelector(pageSpecialConfig.iframeContainer);
      if(iframeContainer){
        root = iframeContainer.contentDocument;
        isIframeContainer = true;
      }
    }
    for(const selector of allBlocksSelectors){

      if(root && root.querySelectorAll){
        const nodes = root.querySelectorAll(selector);
        for(const node of nodes){
          if(currentHostname==="twitter.com" || currentHostname==="twitterdesk.twitter.com" || currentHostname==="mobile.twitter.com"){
            // check language
            try{
              const lang = node.getAttribute("lang");
              if(lang && checkIsSameLanguage(lang,[currentTargetLanguage,...neverTranslateLangs],ctx)){
                continue;
              }
            }catch(e){
              // ignore
              // console.log("e", e)
            }
          }

          if(isValidNode(node) && !isDuplicatedChild(allNodes,node)){
            allNodes.push(node);
          }
        }
      }
    }
  }


  if(!isIframeContainer && ((pageSpecialConfig && pageSpecialConfig.containerSelectors) || allBlocksSelectors.length === 0)){
    
    const originalRoot = root;
    const contentContainers = getContainers(root,pageSpecialConfig);
    let containers = []
    if(pageSpecialConfig && pageSpecialConfig.containerSelectors){
      if(!Array.isArray(pageSpecialConfig.containerSelectors)){
        pageSpecialConfig.containerSelectors = [pageSpecialConfig.containerSelectors];
      }
      // check length
      if(pageSpecialConfig.containerSelectors.length ===0){
        containers = [root]
      }
    }
    if(contentContainers && Array.isArray(contentContainers)){
      containers = contentContainers;
    }  
    for(const root of containers){
      for(const blockTag of blockElements){
        const paragraphs = root.querySelectorAll(blockTag.toLowerCase());
        for (const paragraph of paragraphs) {
          if(isValidNode(paragraph) && !isDuplicatedChild(allNodes,paragraph)){
            allNodes.push(paragraph);
          }
        }
      }
      if(!pageSpecialConfig || !pageSpecialConfig.containerSelectors){
       // add addition heading nodes
        for(const headingTag of headingElements){
          const headings = originalRoot.querySelectorAll(headingTag.toLowerCase());
          for (const heading of headings) {
            if(isValidNode(heading)){
              // check if there is already exist in allNodes
              let isExist = false;
              for(const node of allNodes){
                if(node === heading){
                  isExist = true;
                  break;
                }
              }
              if(!isExist){
               allNodes.push(heading);
              }
            }
          }
        }
      }
    }
  }


  // sort allNodes, from top to bottom
  allNodes.sort(function(a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  })



  // check node language is target language, if yes, remove it

  let newAllNodes = [];

  if((pageSpecialConfig && pageSpecialConfig.detectLanguage===true)){
    // only check when detectLanguage is not false
    if(allNodes.length<500){
      for(const node of allNodes){
        const nodeText = node.innerText;
        if(nodeText && nodeText.trim().length>0){
            const lang = await detectLanguage(nodeText);
            if(lang && !checkIsSameLanguage(lang,[currentTargetLanguage,...neverTranslateLangs],ctx)){
              // only translate the clearly language
              newAllNodes.push(node);
            }

        }
      }
      allNodes = newAllNodes;
    }
  }



  if(!isShowDualLanguage){
      return allNodes;
  }

  // is pdf, if pdf, then treat it as a special case
  const isPdf = new RegExp(pdfSelectorsConfig.regex).test(currentUrlWithoutSearch);
  if(isPdf){
    // add flex container to div
    for(const node of allNodes){
      const parent = node.parentNode;
      const pdfContainer = document.createElement("div");
      pdfContainer.style.display = "flex";
      addWrapperToNode(node,pdfContainer);
    }
  }

  for(const node of allNodes){
    // check if there is a copy already
    const previousSibling = node.previousSibling;
    // console.log("previousSibling.hasAttribute(markAttributeName)", previousSibling.hasAttribute(markAttributeName))
    if(!previousSibling || !previousSibling.hasAttribute || !previousSibling.hasAttribute(enhanceMarkAttributeName)){
      // add 
      let copyNode = node.cloneNode(true);
      // get original display value
      let originalDisplay = node.style.display;
      if(ctx.tabHostName==="www.reddit.com"){
        // append child <br>
        if(copyNode.nodeName.toLowerCase() === "h3" || copyNode.nodeName.toLowerCase() === "h1"){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && (pageSpecialConfig.name==='oldRedditCompact' || pageSpecialConfig.name==='oldReddit')){

        // if class name includes title
        if(node.parentNode && node.parentNode.className.includes("title")){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='stackoverflow'){
        // if parrent name is h1
        if((node.parentNode && node.parentNode.nodeName.toLowerCase() === "h1") || (node.classList.contains("comment-copy"))){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='ycombinator'){
        if(node.nodeName.toLowerCase() === "a" ){
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }
      }else if(pageSpecialConfig && pageSpecialConfig.name==='google'){
        if(node.nodeName.toLowerCase() === "h3" ){
            // check copy node display to block
            originalDisplay = "block";
        }
      
      }else if(pageSpecialConfig && pageSpecialConfig.name==='discord'){
        if(node.nodeName.toLowerCase() === "h3" ){
          // check copy node display to block
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }

      }else if(pageSpecialConfig && pageSpecialConfig.selectors){
        // check is inline element
        if(inlineElements.includes(node.nodeName.toLowerCase())){
          // originalDisplay = "block";
          const br = document.createElement("br");
          copyNode.appendChild(br);
        }

      }
      

      if(inlineElements.includes(copyNode.nodeName.toLowerCase())){
        // add a space
        copyNode.style.paddingRight = "8px";
      }else{
        // if not li element
        const copiedNodeName = copyNode.nodeName.toLowerCase();
        if(!['p','ul','ol','li'].includes(copiedNodeName)){
          copyNode.style.paddingBottom = "8px";
        }
      }
      // if nitter
      if(pageSpecialConfig && pageSpecialConfig.name && pageSpecialConfig.name === "nitter"){
        // display to block
        originalDisplay = "block";
      }
      formatCopiedNode(copyNode,originalDisplay,ctx,pageSpecialConfig);
      if(ctx.tabHostName === "www.youtube.com"){
        // special, we need to insert all children of the copied node to node
        const copiedChildren = copyNode.childNodes;
        const firstNode = node.childNodes[0];
        for(let copiedChild of copiedChildren){
          // if copiedChildNode is a text node, add span wrapper
          if(copiedChild.nodeType === Node.TEXT_NODE){
            const span = document.createElement("span");
            span.appendChild(copiedChild);
            copiedChild = span;
          }
          formatCopiedNode(copiedChild,undefined,ctx,pageSpecialConfig);
          node.insertBefore(copiedChild,firstNode);
        }
        // new line span node
        const newLineSpan = document.createElement("span");
        newLineSpan.innerHTML = "\n";
        formatCopiedNode(newLineSpan,undefined,ctx,pageSpecialConfig);
        node.insertBefore(newLineSpan,firstNode);
      }else{
        node.parentNode.insertBefore(copyNode, node)
      }
    }
  }
  // copy 
  return allNodes;
}

// get the main container, copy from: https://github.com/ZachSaucier/Just-Read/blob/master/content_script.js

function getContainers(root,pageSpecialConfig){ 
    if(pageSpecialConfig && pageSpecialConfig.containerSelectors){
      // is array
      if(!Array.isArray(pageSpecialConfig.containerSelectors)){
        pageSpecialConfig.containerSelectors = [pageSpecialConfig.containerSelectors];
      }

      if(pageSpecialConfig.containerSelectors.length >0){
        let containers =[];
        for(const selector of pageSpecialConfig.containerSelectors){
            if(root && root.querySelectorAll){
              const allContainer = root.querySelectorAll(pageSpecialConfig.containerSelectors);
              if(allContainer){
                for(const container of allContainer){
                  // check if brToParagraph
                  if(pageSpecialConfig.brToParagraph){
                      const pattern = new RegExp ("<br/?>[ \r\n\s]*<br/?>", "g");
                      container.innerHTML = container.innerHTML.replace(pattern, "</p><p>");
                  }


                  containers.push(container);
                } 
              }
            }
        }
        return containers.length>0?containers:null;
      }
    }

    if(!(root && root.innerText)){
      return null
    }
    // role=main
    // const main = root.querySelector("[role=main]");
    // if(main){
    //   return main;
    // }
    let selectedContainer;
    const matched =  root.innerText.match(/\S+/g);
    const numWordsOnPage =matched?matched.length:0;
    let ps = root.querySelectorAll("p");

    // Find the paragraphs with the most words in it
    let pWithMostWords = root,
        highestWordCount = 0;

    if(ps.length === 0) {
        ps = root.querySelectorAll("div");
    }

    ps.forEach(p => {
        if(checkAgainstBlacklist(p, 3) // Make sure it's not in our blacklist
        && p.offsetHeight !== 0) { //  Make sure it's visible on the regular page
            const myInnerText = p.innerText.match(/\S+/g);
            if(myInnerText) {
                const wordCount = myInnerText.length;
                if(wordCount > highestWordCount) {
                    highestWordCount = wordCount;
                    pWithMostWords = p;
                }
            }
        }

    });

    // Keep selecting more generally until over 2/5th of the words on the page have been selected
    selectedContainer = pWithMostWords;
    let wordCountSelected = highestWordCount;

    while(wordCountSelected / numWordsOnPage < 0.4
    && selectedContainer != root
    && selectedContainer.parentElement && selectedContainer.parentElement.innerText) {
        selectedContainer = selectedContainer.parentElement;
        wordCountSelected = selectedContainer.innerText.match(/\S+/g).length;
    }

    // Make sure a single p tag is not selected
    if(selectedContainer.tagName === "P") {
        selectedContainer = selectedContainer.parentElement;
    }

    return [selectedContainer];
}

// Check given item against blacklist, return null if in blacklist
const blacklist = ["comment"];
function checkAgainstBlacklist(elem, level) {
    if(elem && elem != null) {
        const className = elem.className,
              id = elem.id;

        const isBlackListed = blacklist.map(item => {
            if((typeof className === "string" && className.indexOf(item) >= 0)
            || (typeof id === "string" && id.indexOf(item) >= 0)
            ) {
                return true;
            }
        }).filter(item => item)[0];

        if(isBlackListed) {
            return null;
        }

        const parent = elem.parentElement;
        if(level > 0 && parent && !parent.isSameNode(document.body)) {
            return checkAgainstBlacklist(parent, --level);
        }
    }

    return elem;
}
function getStyle(el) {
  return window.getComputedStyle(el)
}

function formatCopiedNode(copyNode,originalDisplay,ctx,pageSpecialConfig){
      copyNode.setAttribute(enhanceMarkAttributeName, "copiedNode");
      // add data-translationoriginaldisplay
      if(originalDisplay){
        copyNode.setAttribute(enhanceOriginalDisplayValueAttributeName, originalDisplay);
      }
      // add display none
      copyNode.style.display = "none";
      // add notranslate class
      copyNode.classList.add("notranslate");
      const twpConfig = ctx.twpConfig;
      const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
      if (isShowDualLanguage && (!pageSpecialConfig || pageSpecialConfig.style!=="none")) {
        let customDualStyle = twpConfig.get("customDualStyle");
        let dualStyle = customDualStyle || twpConfig.get("dualStyle") || 'underline';
        if(pageSpecialConfig && pageSpecialConfig.style){
          dualStyle = pageSpecialConfig.style;
        }
        if (dualStyle === 'mask') {
          copyNode.classList.add("immersive-translate-mask-next-sibling");
        }
      }
}

function addStyle(){
  try{

  // important style
  var css = '.immersive-translate-mask-next-sibling + *{filter:blur(5px);transition: filter 0.1s ease; } .immersive-translate-mask-next-sibling + *:hover {filter:none !important;}';
  var style = document.createElement('style');
  if (style.styleSheet) {
      style.styleSheet.cssText = css;
  } else {
      style.appendChild(document.createTextNode(css));
  }
  document.getElementsByTagName('head')[0].appendChild(style);
  }catch(e){
    // ignore
  }
}

addStyle()


 function detectLanguage(text) {
  // send message to background
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "detectLanguage",
             text: text
        }, response => {
            resolve(response)
        })
    })
}


function checkIsSameLanguage(lang,langs,ctx){
  const finalLang = twpLang.fixTLanguageCode(lang);
  if(!finalLang){
    return false;
  }
  if(langs.includes(finalLang)){
    return true;
  }
  
  // for api does not has the best detect for zh-CN and zh-TW
  // we will treat zh-CN and zh-TW as same language
  // we focus on the dual language display, so zh-TW -> zh-CN is not the first priority to fix,
  // I think people will not use it to learn zh-TW to zh-CN
  // only is show dual language, we will treat zh-CN and zh-TW as same language
  if(ctx && ctx.twpConfig && ctx.twpConfig.get("isShowDualLanguage")==='yes'){
    if(finalLang.startsWith("zh-")){
      // if langs , includes any lang starts with zh- , we will treat it as same language
      return langs.filter(lang=>lang.startsWith("zh-")).length>0;
    }else{
      return false
    }
  }

  return false
}


"use strict";

/**
 * This mark cannot contain words, like <customskipword>12</customskipword>34
 *
 * Google will reorder as <customskipword>1234</customskipword>
 *
 * Under certain circumstances，Google broken the translation, returned startMark0 in some cases
 * */
const startMark = '@%';
const endMark = '#$';
const startMark0 = '@ %';
const endMark0 = '# $';

let currentIndex;
let compressionMap;

/**
 *  Convert matching keywords to a string of special numbers to skip translation before sending to the translation engine.
 *
 *  For English words, ignore case when matching.
 *
 *  But for the word "app" , We don't want to "Happy" also matched.
 *
 *  So we match only isolated words, by checking the two characters before and after the keyword.
 *
 *  But this will also cause this method to not work for Chinese, Burmese and other languages without spaces.
 * */
function filterKeywordsInText(textContext) {
    let customDictionary = twpConfig.get("customDictionary")
    if (customDictionary.size > 0) {
        // reordering , we want to match the keyword "Spring Boot" first then the keyword "Spring"
        customDictionary = new Map([...customDictionary.entries()].sort((a, b) => String(b[0]).length - String(a[0]).length))
        for (let keyWord of customDictionary.keys()) {
            while (true) {
                let index = textContext.toLowerCase().indexOf(keyWord)
                if (index === -1) {
                    break
                } else {
                    textContext = removeExtraDelimiter(textContext)
                    let previousIndex = index - 1
                    let nextIndex = index + keyWord.length
                    let previousChar = previousIndex === -1 ? '\n' : textContext.charAt(previousIndex)
                    let nextChar = nextIndex === textContext.length ? '\n' : textContext.charAt(nextIndex)
                    let placeholderText = ''
                    let keyWordWithCase = textContext.substring(index, index + keyWord.length)
                    if (isPunctuationOrDelimiter(previousChar) && isPunctuationOrDelimiter(nextChar)) {
                        placeholderText = startMark + handleHitKeywords(keyWordWithCase, true) + endMark
                    } else {
                        placeholderText = '#n%o#'
                        for (let c of Array.from(keyWordWithCase)) {
                            placeholderText += c
                            placeholderText += '#n%o#'
                        }
                    }
                    let frontPart = textContext.substring(0, index)
                    let backPart = textContext.substring(index + keyWord.length)
                    textContext = frontPart + placeholderText + backPart
                }
            }
            textContext = textContext.replaceAll('#n%o#', '')
        }
    }
    return textContext
}

/**
 *  handle the keywords in translatedText, replace it if there is a custom replacement value.
 *
 *  When encountering Google Translate reordering, the original text contains our mark, etc. , we will catch these exceptions and call the text translation method to retranslate this section.
 *  */
async function handleCustomWords(translated, originalText, currentPageTranslatorService, currentTargetLanguage) {
    try {
        const customDictionary = twpConfig.get("customDictionary")
        if (customDictionary.size > 0) {
            translated = removeExtraDelimiter(translated)
            translated = translated.replaceAll(startMark0, startMark)
            translated = translated.replaceAll(endMark0, endMark)

            while (true) {
                let startIndex = translated.indexOf(startMark)
                let endIndex = translated.indexOf(endMark)
                if (startIndex === -1 && endIndex === -1) {
                    break
                } else {
                    let placeholderText = translated.substring(startIndex + startMark.length, endIndex)
                    // At this point placeholderText is actually currentIndex , the real value is in compressionMap
                    let keyWord = handleHitKeywords(placeholderText, false)
                    if (keyWord === "undefined") {
                        throw new Error("undefined")
                    }
                    let frontPart = translated.substring(0, startIndex)
                    let backPart = translated.substring(endIndex + endMark.length)
                    let customValue = customDictionary.get(keyWord.toLowerCase())
                    customValue = (customValue === '') ? keyWord : customValue
                    // Highlight custom words, make it have a space before and after it
                    frontPart = isPunctuationOrDelimiter(frontPart.charAt(frontPart.length - 1)) ? frontPart : (frontPart + ' ')
                    backPart = isPunctuationOrDelimiter(backPart.charAt(0)) ? backPart : (' ' + backPart)
                    translated = frontPart + customValue + backPart
                }
            }
        }
    } catch (e) {
        return await backgroundTranslateSingleText(currentPageTranslatorService, currentTargetLanguage, originalText)
    }

    return translated
}

/**
 *
 * True : Store the keyword in the Map and return the index
 *
 * False : Extract keywords by index
 * */
function handleHitKeywords(value, mode) {
    if (mode) {
        if (currentIndex === undefined) {
            currentIndex = 1
            compressionMap = new Map()
            compressionMap.set(currentIndex, value)
        } else {
            compressionMap.set(++currentIndex, value)
        }
        return String(currentIndex)
    } else {
        return String(compressionMap.get(Number(value)))
    }
}

/**
 * any kind of punctuation character (including international e.g. Chinese and Spanish punctuation), and spaces, newlines
 *
 * source: https://github.com/slevithan/xregexp/blob/41f4cd3fc0a8540c3c71969a0f81d1f00e9056a9/src/addons/unicode/unicode-categories.js#L142
 *
 * note: XRegExp unicode output taken from http://jsbin.com/uFiNeDOn/3/edit?js,console (see chrome console.log), then converted back to JS escaped unicode here http://rishida.net/tools/conversion/, then tested on http://regexpal.com/
 *
 * suggested by: https://stackoverflow.com/a/7578937
 *
 * added: extra characters like "$", "\uFFE5" [yen symbol], "^", "+", "=" which are not consider punctuation in the XRegExp regex (they are currency or mathmatical characters)
 *
 * added: Chinese Punctuation: \u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3010|\u3011|\u007e
 *
 * added: special html space symbol: &nbsp; &ensp; &emsp; &thinsp; &zwnj; &zwj; -> \u00A0|\u2002|\u2003|\u2009|\u200C|\u200D
 * @see https://stackoverflow.com/a/21396529/19616126
 * */
function isPunctuationOrDelimiter(str) {
    if (typeof str !== "string") return false
    if (str === '\n' || str === ' ') return true
    const regex = /[\$\uFFE5\^\+=`~<>{}\[\]|\u00A0|\u2002|\u2003|\u2009|\u200C|\u200D|\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3010|\u3011|\u007e!-#%-\x2A,-/:;\x3F@\x5B-\x5D_\x7B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/g;
    return regex.test(str)
}

/**
 * Remove useless newlines, spaces inside, which may affect our semantics
 * */
function removeExtraDelimiter(textContext) {
    textContext = textContext.replaceAll('\n', ' ')
    textContext = textContext.replace(/  +/g, ' ')
    return textContext
}


function backgroundTranslateHTML(translationService, targetLanguage, sourceArray2d, dontSortResults) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "translateHTML",
            translationService,
            targetLanguage,
            sourceArray2d,
            dontSortResults
        }, response => {
            resolve(response)
        })
    })
}

function backgroundTranslateText(translationService, targetLanguage, sourceArray) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "translateText",
            translationService,
            targetLanguage,
            sourceArray
        }, response => {
            resolve(response)
        })
    })
}

function backgroundTranslateSingleText(translationService, targetLanguage, source) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "translateSingleText",
            translationService,
            targetLanguage,
            source
        }, response => {
            resolve(response)
        })
    })
}

var pageTranslator = {}

function getTabHostName() {
    return new Promise(resolve => chrome.runtime.sendMessage({action: "getTabHostName"}, result => resolve(result)))
}

function getTabUrl() {
    return new Promise(resolve => chrome.runtime.sendMessage({action: "getTabUrl"}, result => resolve(result)))
}
Promise.all([twpConfig.onReady(), getTabUrl()])
.then(function (_) {
    const tabUrl = _[1];
    const tabUrlObj = new URL(tabUrl);
    const tabHostName = tabUrlObj.hostname;
    const tabUrlWithoutSearch = tabUrlObj.origin + tabUrlObj.pathname;
    const ctx = {
      tabUrl,
      tabHostName,
      tabUrlWithoutSearch,
      twpConfig
    }
    const htmlTagsInlineText = ['#text', 'A', 'ABBR', 'ACRONYM', 'B', 'BDO', 'BIG', 'CITE', 'DFN', 'EM', 'I', 'LABEL', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'TT', 'VAR']
    const htmlTagsInlineIgnore = ['BR', 'CODE', 'KBD', 'WBR'] // and input if type is submit or button, and pre depending on settings
    const htmlTagsNoTranslate = ['TITLE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'SVG', 'svg'] //TODO verificar porque 'svg' é com letras minúsculas
    const specialRulesConfigs = twpConfig.get('specialRules');
    if(Array.isArray(specialRulesConfigs) && specialRulesConfigs.length > 0){
      for(const specialRuleString of specialRulesConfigs){
        // add to specialRules
        try{
          const specialRule = JSON.parse(specialRuleString);
          specialRules.unshift(specialRule);
        }catch(e){
          console.warn(`Error parsing special rule: ${specialRuleString}`)
        }
      }
    }

    if (twpConfig.get('translateTag_pre') !== 'yes') {
        htmlTagsInlineIgnore.push('PRE')
    }
    twpConfig.onChanged((name, newvalue) => {
        switch (name) {
            case "translateTag_pre":
                const index = htmlTagsInlineIgnore.indexOf('PRE')
                if (index !== -1) {
                    htmlTagsInlineIgnore.splice(index, 1)
                }
                if (newvalue !== 'yes') {
                    htmlTagsInlineIgnore.push('PRE')
                }
                break
        }
    })

    //TODO FOO
    twpConfig.set("targetLanguage", twpConfig.get("targetLanguages")[0])

    // Pieces are a set of nodes separated by inline tags that form a sentence or paragraph.
    let piecesToTranslate = []
    let originalTabLanguage = "und"
    let currentPageLanguage = "und"
    let pageLanguageState = "original"
    let currentTargetLanguage = twpConfig.get("targetLanguage")
    let currentPageTranslatorService = twpConfig.get("pageTranslatorService")
    let dontSortResults = twpConfig.get("dontSortResults") == "yes" ? true : false
    let fooCount = 0

    let originalPageTitle

    let attributesToTranslate = []

    let translateNewNodesTimerHandler
    let newNodes = []
    let removedNodes = []

    let nodesToRestore = []

    async function translateNewNodes() {
        try {
            for(const nn of newNodes) {
                if (removedNodes.indexOf(nn) != -1) continue;

                // let newPiecesToTranslate = getPiecesToTranslate(nn)
                let newPiecesToTranslate = (await getNodesThatNeedToTranslate(nn,ctx)).reduce((acc, node) => {
                  return acc.concat(getPiecesToTranslate(node))
                }, [])

                for (const i in newPiecesToTranslate) {
                    const newNodes = newPiecesToTranslate[i].nodes
                    let finded = false

                    for (const ntt of piecesToTranslate) {
                        if (ntt.nodes.some(n1 => newNodes.some(n2 => n1 === n2))) {
                            finded = true
                        }
                    }

                    if (!finded) {
                        piecesToTranslate.push(newPiecesToTranslate[i])
                    }
                }
            }
        } catch (e) {
            console.error(e)
        } finally {
            newNodes = []
            removedNodes = []
        }
    }

    const mutationObserver = new MutationObserver(function (mutations) {
        const piecesToTranslate = []

        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(addedNode => {
                if (htmlTagsNoTranslate.indexOf(addedNode.nodeName) == -1) {
                    if (htmlTagsInlineText.indexOf(addedNode.nodeName) == -1) {
                        if (htmlTagsInlineIgnore.indexOf(addedNode.nodeName) == -1) {
                            piecesToTranslate.push(addedNode)
                        }
                    }
                }
            })

            mutation.removedNodes.forEach(removedNode => {
                removedNodes.push(removedNode)
            })
        })

        piecesToTranslate.forEach(ptt => {
            if (newNodes.indexOf(ptt) == -1) {
                newNodes.push(ptt)
            }
        })
    })

    function enableMutatinObserver() {
        disableMutatinObserver()

        if (twpConfig.get("translateDynamicallyCreatedContent") == "yes") {
            translateNewNodesTimerHandler = setInterval(translateNewNodes, 2000)
            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            })
        }
    }

    function disableMutatinObserver() {
        clearInterval(translateNewNodesTimerHandler)
        newNodes = []
        removedNodes = []
        mutationObserver.disconnect()
        mutationObserver.takeRecords()
    }

    let pageIsVisible = document.visibilityState == "visible"
    // isto faz com que partes do youtube não sejam traduzidas
    // new IntersectionObserver(entries => {
    //         if (entries[0].isIntersecting && document.visibilityState == "visible") {
    //             pageIsVisible = true
    //         } else {
    //             pageIsVisible = false
    //         }

    //         if (pageIsVisible && pageLanguageState === "translated") {
    //             enableMutatinObserver()
    //         } else {
    //             disableMutatinObserver()
    //         }
    //     }, {
    //         root: null
    //     })
    //     .observe(document.body)

    const handleVisibilityChange = function () {
        if (document.visibilityState == "visible") {
            pageIsVisible = true
        } else {
            pageIsVisible = false
        }

        if (pageIsVisible && pageLanguageState === "translated") {
            enableMutatinObserver()
        } else {
            disableMutatinObserver()
        }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange, false)

    function getPiecesToTranslate(root = document.body) {
        const piecesToTranslate = [{
            isTranslated: false,
            parentElement: null,
            topElement: null,
            bottomElement: null,
            nodes: []
        }]
        let index = 0
        let currentParagraphSize = 0

        const getAllNodes = function (node, lastHTMLElement = null, lastSelectOrDataListElement = null) {
            if (node.nodeType == 1 || node.nodeType == 11) {
                if (node.nodeType == 11) {
                    lastHTMLElement = node.host
                    lastSelectOrDataListElement = null
                } else if (node.nodeType == 1) {
                    lastHTMLElement = node
                    if (node.nodeName === "SELECT" || node.nodeName === "DATALIST") lastSelectOrDataListElement = node;

                    if (htmlTagsInlineIgnore.indexOf(node.nodeName) !== -1 ||
                        htmlTagsNoTranslate.indexOf(node.nodeName) !== -1 ||
                        node.classList.contains("notranslate") ||
                        node.getAttribute("translate") === "no" ||
                        node.isContentEditable) {
                        if (piecesToTranslate[index].nodes.length > 0) {
                            currentParagraphSize = 0
                            piecesToTranslate[index].bottomElement = lastHTMLElement
                            piecesToTranslate.push({
                                isTranslated: false,
                                parentElement: null,
                                topElement: null,
                                bottomElement: null,
                                nodes: []
                            })
                            index++
                        }
                        return
                    }
                }

                function getAllChilds(childNodes) {
                    Array.from(childNodes).forEach(_node => {
                        if (_node.nodeType == 1) {
                            lastHTMLElement = _node
                            if (_node.nodeName === "SELECT" || _node.nodeName === "DATALIST") lastSelectOrDataListElement = _node;
                        }

                        if (htmlTagsInlineText.indexOf(_node.nodeName) == -1) {
                            if (piecesToTranslate[index].nodes.length > 0) {
                                currentParagraphSize = 0
                                piecesToTranslate[index].bottomElement = lastHTMLElement
                                piecesToTranslate.push({
                                    isTranslated: false,
                                    parentElement: null,
                                    topElement: null,
                                    bottomElement: null,
                                    nodes: []
                                })
                                index++

                            }

                            getAllNodes(_node, lastHTMLElement, lastSelectOrDataListElement)

                            if (piecesToTranslate[index].nodes.length > 0) {
                                currentParagraphSize = 0
                                piecesToTranslate[index].bottomElement = lastHTMLElement
                                piecesToTranslate.push({
                                    isTranslated: false,
                                    parentElement: null,
                                    topElement: null,
                                    bottomElement: null,
                                    nodes: []
                                })
                                index++
                            }
                        } else {
                            getAllNodes(_node, lastHTMLElement, lastSelectOrDataListElement)
                        }
                    })
                }

                getAllChilds(node.childNodes)
                if (!piecesToTranslate[index].bottomElement) {
                    piecesToTranslate[index].bottomElement = node
                }
                if (node.shadowRoot) {
                    getAllChilds(node.shadowRoot.childNodes)
                    if (!piecesToTranslate[index].bottomElement) {
                        piecesToTranslate[index].bottomElement = node
                    }
                }
            } else if (node.nodeType == 3) {
                if (node.textContent.trim().length > 0) {
                    if (!piecesToTranslate[index].parentElement) {
                        if (node && node.parentNode && node.parentNode.nodeName === "OPTION" && lastSelectOrDataListElement) {
                            piecesToTranslate[index].parentElement = lastSelectOrDataListElement
                            piecesToTranslate[index].bottomElement = lastSelectOrDataListElement
                            piecesToTranslate[index].topElement = lastSelectOrDataListElement
                        } else {
                            let temp = node.parentNode
                            while (temp && temp != root && (htmlTagsInlineText.indexOf(temp.nodeName) != -1 || htmlTagsInlineIgnore.indexOf(temp.nodeName) != -1)) {
                                temp = temp.parentNode
                            }
                            if (temp && temp.nodeType === 11) {
                                temp = temp.host
                            }
                            piecesToTranslate[index].parentElement = temp
                        }
                    }
                    if (!piecesToTranslate[index].topElement) {
                        piecesToTranslate[index].topElement = lastHTMLElement
                    }
                    if (currentParagraphSize > 1000) {
                        currentParagraphSize = 0
                        piecesToTranslate[index].bottomElement = lastHTMLElement
                        const pieceInfo = {
                            isTranslated: false,
                            parentElement: null,
                            topElement: lastHTMLElement,
                            bottomElement: null,
                            nodes: []
                        }
                        pieceInfo.parentElement = piecesToTranslate[index].parentElement
                        piecesToTranslate.push(pieceInfo)
                        index++
                    }
                    currentParagraphSize += node.textContent.length
                    piecesToTranslate[index].nodes.push(node)
                    piecesToTranslate[index].bottomElement = null
                }
            }
        }
        getAllNodes(root)

        if (piecesToTranslate.length > 0 && piecesToTranslate[piecesToTranslate.length - 1].nodes.length == 0) {
            piecesToTranslate.pop()
        }

        return piecesToTranslate
    }

    function getAttributesToTranslate(root = document.body) {
        const attributesToTranslate = []

        const placeholdersElements = root.querySelectorAll('input[placeholder], textarea[placeholder]')
        const altElements = root.querySelectorAll('area[alt], img[alt], input[type="image"][alt]')
        // const valueElements = root.querySelectorAll('input[type="button"], input[type="submit"], input[type="reset"]')
        const valueElements = [];
        const titleElements = root.querySelectorAll("body [title]")

        function hasNoTranslate(elem) {
            if (elem && (elem.classList.contains("notranslate") || elem.getAttribute("translate") === "no")) {
                return true
            }
        }

        placeholdersElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("placeholder")
            if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "placeholder"
                })
            }
        })

        altElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("alt")
            if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "alt"
                })
            }
        })

        valueElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("value")
            if (e.type == "submit" && !txt) {
                attributesToTranslate.push({
                    node: e,
                    original: "Submit Query",
                    attrName: "value"
                })
            } else if (e.type == "reset" && !txt) {
                attributesToTranslate.push({
                    node: e,
                    original: "Reset",
                    attrName: "value"
                })
            } else if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "value"
                })
            }
        })

        titleElements.forEach(e => {
            if (hasNoTranslate(e)) return;

            const txt = e.getAttribute("title")
            if (txt && txt.trim()) {
                attributesToTranslate.push({
                    node: e,
                    original: txt,
                    attrName: "title"
                })
            }
        })

        return attributesToTranslate
    }

    function encapsulateTextNode(node,ctx) {
        const pageSpecialConfig = getPageSpecialConfig(ctx);
        const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;
        
        
        const fontNode = document.createElement("font")
        let style = 'vertical-align: inherit;'
        if (isShowDualLanguage && (!pageSpecialConfig || pageSpecialConfig.style!=="none")) {
          let customDualStyle = twpConfig.get("customDualStyle");
          let dualStyle = customDualStyle || twpConfig.get("dualStyle") || 'underline';
          if(pageSpecialConfig && pageSpecialConfig.style){
            dualStyle = pageSpecialConfig.style;
          }
          if(dualStyle==='underline'){
            style+='border-bottom: 2px solid #72ECE9;'
          }else if(dualStyle==='none'){
            // ignore
          }else if(dualStyle==="highlight"){
            style+='background-color: #EAD0B3;padding: 3px 0;'
          }else if(dualStyle==="weakening"){
            style+='opacity: 0.4;'
          }else if(dualStyle==="maskxxxxxxxx"){
            style+="filter: blur(5px);transition: filter 0.5s ease;"
            // add class immersive-translate-mask
            fontNode.classList.add("immersive-translate-mask")
          }else if(dualStyle){
            style+=dualStyle;
          }
        }
        fontNode.setAttribute("style", style)
        // fontNode.setAttribute("_mstmutation", "1")
        // add class name 
        fontNode.textContent = node.textContent

        node.replaceWith(fontNode)

        return fontNode
    }

    async function translateResults(piecesToTranslateNow, results,ctx) {
        if (dontSortResults) {
            for (let i = 0; i < results.length; i++) {
                for (let j = 0; j < results[i].length; j++) {
                    if (piecesToTranslateNow[i].nodes[j]) {
                        const nodes = piecesToTranslateNow[i].nodes
                        let translated = results[i][j] + " "
                        // In some case, results items count is over original node count
                        // Rest results append to last node
                        if (piecesToTranslateNow[i].nodes.length - 1 === j && results[i].length > j) {
                            const restResults = results[i].slice(j + 1);
                            translated += restResults.join(" ");
                        }

                        nodes[j] = encapsulateTextNode(nodes[j],ctx)

                        showOriginal.add(nodes[j])
                        nodesToRestore.push({
                            node: nodes[j],
                            original: nodes[j].textContent
                        })

                       const result = await handleCustomWords(translated, nodes[j].textContent, currentPageTranslatorService, currentTargetLanguage);
                            nodes[j].textContent = result
                    }
                }
            }
        } else {
            for (const i in piecesToTranslateNow) {
                for (const j in piecesToTranslateNow[i].nodes) {
                    if (results[i][j]) {
                        const nodes = piecesToTranslateNow[i].nodes
                        const translated = results[i][j] + " "

                        nodes[j] = encapsulateTextNode(nodes[j],ctx)

                        showOriginal.add(nodes[j])
                        nodesToRestore.push({
                            node: nodes[j],
                            original: nodes[j].textContent
                        })

                      const result =  await handleCustomWords(translated, nodes[j].textContent, currentPageTranslatorService, currentTargetLanguage);
                      nodes[j].textContent = result
                        
                    }
                }
            }
        }
        mutationObserver.takeRecords()
    }

    function translateAttributes(attributesToTranslateNow, results) {
        for (const i in attributesToTranslateNow) {
            const ati = attributesToTranslateNow[i]
            ati.node.setAttribute(ati.attrName, results[i])
        }
    }

    async function translateDynamically() {
        try {
            if (piecesToTranslate && pageIsVisible) {
                ;
                await (async function () {
                    function isInScreen(element) {
                        const rect = element.getBoundingClientRect()
                        if ((rect.top > 0 && rect.top <= window.innerHeight) || (rect.bottom > 0 && rect.bottom <= window.innerHeight)) {
                            return true
                        }
                        return false
                    }

                    function topIsInScreen(element) {
                        if (!element) {
                            // debugger;
                            return false
                        }
                        const rect = element.getBoundingClientRect()
                        if (rect.top > 0 && rect.top <= window.innerHeight) {
                            return true
                        }
                        return false
                    }

                    function bottomIsInScreen(element) {
                        if (!element) {
                            // debugger;
                            return false
                        }
                        const rect = element.getBoundingClientRect()
                        if (rect.bottom > 0 && rect.bottom <= window.innerHeight) {
                            return true
                        }
                        return false
                    }


                    const currentFooCount = fooCount

                    const piecesToTranslateNow = []
                    piecesToTranslate.forEach(ptt => {
                        if (!ptt.isTranslated) {
                            
                            if (bottomIsInScreen(ptt.topElement) || topIsInScreen(ptt.bottomElement)) {
                                ptt.isTranslated = true
                                piecesToTranslateNow.push(ptt)
                            }
                        }
                    })

                    const attributesToTranslateNow = []
                    attributesToTranslate.forEach(ati => {
                        if (!ati.isTranslated) {
                            if (isInScreen(ati.node)) {
                                ati.isTranslated = true
                                attributesToTranslateNow.push(ati)
                            }
                        }
                    })

                    if (piecesToTranslateNow.length > 0) {
                        const results = await backgroundTranslateHTML(
                                currentPageTranslatorService,
                                currentTargetLanguage,
                                piecesToTranslateNow.map(ptt => ptt.nodes.map(node => filterKeywordsInText(node.textContent))),
                                dontSortResults
                            )
                            if (pageLanguageState === "translated" && currentFooCount === fooCount) {
                                 await translateResults(piecesToTranslateNow, results,ctx)
                                 // changed here
                                 const isShowDualLanguage = twpConfig.get("isShowDualLanguage")==='no'?false:true;

                                 if(isShowDualLanguage){
                                    showCopyiedNodes()
                                 }
                            }
                    }

                    if (attributesToTranslateNow.length > 0) {
                        backgroundTranslateText(
                                currentPageTranslatorService,
                                currentTargetLanguage,
                                attributesToTranslateNow.map(ati => ati.original)
                            )
                            .then(results => {
                                if (pageLanguageState === "translated" && currentFooCount === fooCount) {
                                    translateAttributes(attributesToTranslateNow, results)
                                }
                            })
                    }
                })()
            }
        } catch (e) {
            console.error(e)
        }
        setTimeout(translateDynamically, 600)
    }

    translateDynamically()

    function translatePageTitle() {
        const title = document.querySelector("title");
        if (title && (
                title.classList.contains("notranslate") ||
                title.getAttribute("translate") === "no"
            )) {
            return;
        }
        if (document.title.trim().length < 1) return;
        originalPageTitle = document.title

        backgroundTranslateSingleText(currentPageTranslatorService, currentTargetLanguage, originalPageTitle)
            .then(result => {
                if (result) {
                    document.title = result
                }
            })
    }

    const pageLanguageStateObservers = []

    pageTranslator.onPageLanguageStateChange = function (callback) {
        pageLanguageStateObservers.push(callback)
    }

    pageTranslator.translatePage = async function (targetLanguage) {
        fooCount++
        pageTranslator.restorePage()
        showOriginal.enable()

        dontSortResults = twpConfig.get("dontSortResults") == "yes" ? true : false

        if (targetLanguage) {
            currentTargetLanguage = targetLanguage
        }

        // piecesToTranslate = getPiecesToTranslate()
       try{

        piecesToTranslate = (await getNodesThatNeedToTranslate(document.body,ctx)).reduce((acc, node) => {
          return acc.concat(getPiecesToTranslate(node))
        }, [])
       }catch(e){
         console.error('get pieces failed',e)
         throw e;
       }
        attributesToTranslate = getAttributesToTranslate()
        // TODO
        // attributesToTranslate = [];

        pageLanguageState = "translated"
        chrome.runtime.sendMessage({
            action: "setPageLanguageState",
            pageLanguageState
        })
        pageLanguageStateObservers.forEach(callback => callback(pageLanguageState))
        currentPageLanguage = currentTargetLanguage
        const isTranslateTitle = twpConfig.get("isTranslateTitle") == "yes" ? true : false
        if (isTranslateTitle) {
          translatePageTitle()
        }

        enableMutatinObserver()

        translateDynamically()
    }

    pageTranslator.restorePage = function () {
        fooCount++
        piecesToTranslate = []

        showOriginal.disable()
        disableMutatinObserver()

        pageLanguageState = "original"
        chrome.runtime.sendMessage({
            action: "setPageLanguageState",
            pageLanguageState
        })
        pageLanguageStateObservers.forEach(callback => callback(pageLanguageState))
        currentPageLanguage = originalTabLanguage

        if (originalPageTitle) {
            document.title = originalPageTitle
        }
        originalPageTitle = null
        // remove copyied nodes
        removeCopyiedNodes();


        for (const ntr of nodesToRestore) {
            ntr.node.replaceWith(ntr.original)
        }
        nodesToRestore = []

        //TODO não restaurar atributos que foram modificados
        for (const ati of attributesToTranslate) {
            if (ati.isTranslated) {
                ati.node.setAttribute(ati.attrName, ati.original)
            }
        }
        attributesToTranslate = []
    }

    pageTranslator.swapTranslationService = function () {
        if (currentPageTranslatorService === "google") {
            currentPageTranslatorService = "yandex"
        } else if (currentPageTranslatorService === "yandex") {
            currentPageTranslatorService = "openai_compatible"
        } else {
            currentPageTranslatorService = "google"
        }
        if (pageLanguageState === "translated") {
            pageTranslator.translatePage()
        }
    }

    let alreadyGotTheLanguage = false
    const observers = []

    pageTranslator.onGetOriginalTabLanguage = function (callback) {
        if (alreadyGotTheLanguage) {
            callback(originalTabLanguage)
        } else {
            observers.push(callback)
        }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "translatePage") {
            if (request.targetLanguage === "original") {
                pageTranslator.restorePage()
            } else {
                pageTranslator.translatePage(request.targetLanguage)
            }
        } else if (request.action === "restorePage") {
            pageTranslator.restorePage()
        } else if (request.action === "getOriginalTabLanguage") {
            pageTranslator.onGetOriginalTabLanguage(function () {
                sendResponse(originalTabLanguage)
            })
            return true
        } else if (request.action === "getCurrentPageLanguage") {
            sendResponse(currentPageLanguage)
        } else if (request.action === "getCurrentPageLanguageState") {
            sendResponse(pageLanguageState)
        } else if (request.action === "getCurrentPageTranslatorService") {
            sendResponse(currentPageTranslatorService)
        } else if (request.action === "swapTranslationService") {
            pageTranslator.swapTranslationService()
        } else if (request.action === "toggle-translation") {

            if (pageLanguageState === "translated") {
                pageTranslator.restorePage()
            } else {
                pageTranslator.translatePage()
            }
        } else if (request.action === "autoTranslateBecauseClickedALink") {
            if (twpConfig.get("autoTranslateWhenClickingALink") === "yes") {
                pageTranslator.onGetOriginalTabLanguage(function () {
                    if (pageLanguageState === "original" && originalTabLanguage !== currentTargetLanguage && twpConfig.get("neverTranslateLangs").indexOf(originalTabLanguage) === -1) {
                        pageTranslator.translatePage()
                    }
                })
            }
        }
    })

    // Requests the detection of the tab language in the background
    if (window.self === window.top) { // is main frame
        const onTabVisible = function () {
            chrome.runtime.sendMessage({
                action: "detectTabLanguage"
            },async  result => {
                // if und, manual check
                
                if(result === 'und' || !result){
                    result = await detectPageLanguage()
                }              
                result = result || "und"


                if (result === "und") {
                    originalTabLanguage = result
                }

                if (twpConfig.get("alwaysTranslateSites").indexOf(tabHostName) !== -1) {
                    pageTranslator.translatePage()
                } else if (result !== 'und') {
                    const langCode = twpLang.fixTLanguageCode(result)
                    if (langCode) {
                        originalTabLanguage = langCode
                    }
                    const isNotExternalTranslateHost = (
                        location.hostname !== "translate.googleusercontent.com" &&
                        location.hostname !== "translate.google.com" &&
                        location.hostname !== "translate.yandex.com"
                    )
                    if (
                        isNotExternalTranslateHost &&
                        pageLanguageState === "original" &&
                        !chrome.extension.inIncognitoContext &&
                        twpConfig.get("neverTranslateSites").indexOf(tabHostName) === -1 &&
                        langCode &&
                        langCode !== currentTargetLanguage &&
                        twpConfig.get("alwaysTranslateLangs").indexOf(langCode) !== -1
                    ) {
                        pageTranslator.translatePage()
                    }
                }

                observers.forEach(callback => callback(originalTabLanguage))
                alreadyGotTheLanguage = true
            })
        }
        setTimeout(function () {
            if (document.visibilityState == "visible") {
                onTabVisible()
            } else {
                const handleVisibilityChange = function () {
                    if (document.visibilityState == "visible") {
                        document.removeEventListener("visibilitychange", handleVisibilityChange)
                        onTabVisible()
                    }
                }
                document.addEventListener("visibilitychange", handleVisibilityChange, false)
            }
        }, 120)
    } else { // is subframe (iframe)
        chrome.runtime.sendMessage({
            action: "getMainFrameTabLanguage"
        }, result => {
            originalTabLanguage = result || "und"
            observers.forEach(callback => callback(originalTabLanguage))
            alreadyGotTheLanguage = true
        })

        chrome.runtime.sendMessage({
            action: "getMainFramePageLanguageState"
        }, result => {
            if (result === "translated" && pageLanguageState === "original") {
                pageTranslator.translatePage()
            }
        })
    }
})

function detectPageLanguage() {
  return new Promise((resolve, reject) => {
    if(document.documentElement && document.documentElement.lang){
      resolve(document.documentElement.lang)
    }else{
      // use detect language api
      if(document.body && document.body.innerText){
        chrome.runtime.sendMessage({
            action: "detectLanguage",
             text: document.body.innerText
        }, response => {
            resolve(response)
        })
      }else{
        resolve(undefined)
      }
    }
  })

}



"use strict";

(function () {
  const PRESETS = {
    openai:    { baseUrl: "https://api.openai.com",  model: "gpt-4o-mini" },
    openrouter:{ baseUrl: "https://openrouter.ai/api", model: "openai/gpt-4o-mini" },
    deepseek:  { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
    custom:    { baseUrl: "", model: "" },
  };

  /* ── settings panel ── */
  function createSettingsPanel() {
    if (document.getElementById("iml-settings-panel")) return;
    const overlay = document.createElement("div");
    overlay.id = "iml-settings-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:none;";
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSettings(); });

    const panel = document.createElement("div");
    panel.id = "iml-settings-panel";
    panel.style.cssText = [
      "position:fixed","bottom:0","left:0","right:0","z-index:2147483647",
      "max-height:85vh","overflow-y:auto",
      "background:#fff","color:#222","border-radius:16px 16px 0 0",
      "box-shadow:0 -4px 24px rgba(0,0,0,.2)","padding:20px 16px 28px",
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif","font-size:14px",
      "display:none",
    ].join(";");

    const cfg = twpConfig.get("openaiCompatible") || {};

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <b style="font-size:17px;">Immersive Lite Settings</b>
        <span id="iml-close" style="font-size:22px;cursor:pointer;padding:4px 8px;">✕</span>
      </div>
      <label style="font-size:12px;color:#888;">Provider Preset</label>
      <select id="iml-preset" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;">
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
        <option value="deepseek">DeepSeek</option>
        <option value="custom">Custom</option>
      </select>
      <label style="font-size:12px;color:#888;">Base URL</label>
      <input id="iml-baseurl" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;" />
      <label style="font-size:12px;color:#888;">API Key</label>
      <input id="iml-apikey" type="password" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;" />
      <label style="font-size:12px;color:#888;">Model</label>
      <input id="iml-model" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;box-sizing:border-box;" />
      <label style="font-size:12px;color:#888;">Fallback</label>
      <select id="iml-fallback" style="width:100%;padding:8px;margin:4px 0 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;">
        <option value="google">Google</option>
        <option value="yandex">Yandex</option>
        <option value="none">None</option>
      </select>
      <label style="font-size:12px;color:#888;">Target Language</label>
      <select id="iml-target-lang" style="width:100%;padding:8px;margin:4px 0 14px;border:1px solid #ccc;border-radius:8px;font-size:14px;"></select>
      <button id="iml-save" style="width:100%;padding:12px;border:none;border-radius:10px;background:#1677ff;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Save</button>
      <p id="iml-status" style="text-align:center;color:#888;font-size:12px;margin-top:8px;"></p>
    `;

    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    /* fill values */
    const presetEl = panel.querySelector("#iml-preset");
    const baseurlEl = panel.querySelector("#iml-baseurl");
    const apikeyEl = panel.querySelector("#iml-apikey");
    const modelEl = panel.querySelector("#iml-model");
    const fallbackEl = panel.querySelector("#iml-fallback");
    const targetLangEl = panel.querySelector("#iml-target-lang");

    presetEl.value = cfg.providerPreset || "openai";
    baseurlEl.value = cfg.baseUrl || "https://api.openai.com";
    apikeyEl.value = cfg.apiKey || "";
    modelEl.value = cfg.model || "gpt-4o-mini";
    fallbackEl.value = cfg.fallbackService || "google";

    /* fill target language */
    const langs = twpLang.getLanguageList();
    const currentTarget = twpConfig.get("targetLanguage") || navigator.language || "zh-CN";
    const langEntries = Object.entries(langs).sort((a,b) => a[1].localeCompare(b[1]));
    for (const [code, name] of langEntries) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      if (code === currentTarget) opt.selected = true;
      targetLangEl.appendChild(opt);
    }

    presetEl.addEventListener("change", () => {
      const p = PRESETS[presetEl.value] || {};
      if (p.baseUrl) baseurlEl.value = p.baseUrl;
      if (p.model) modelEl.value = p.model;
    });

    panel.querySelector("#iml-close").addEventListener("click", closeSettings);

    panel.querySelector("#iml-save").addEventListener("click", () => {
      const pv = presetEl.value;
      twpConfig.set("openaiCompatible", {
        ...(twpConfig.get("openaiCompatible") || {}),
        providerPreset: pv,
        baseUrl: baseurlEl.value.trim() || (PRESETS[pv] || {}).baseUrl || "",
        apiKey: apikeyEl.value.trim(),
        model: modelEl.value.trim() || (PRESETS[pv] || {}).model || "gpt-4o-mini",
        fallbackService: fallbackEl.value,
      });
      twpConfig.set("pageTranslatorService", "openai_compatible");
      if (targetLangEl.value) {
        twpConfig.set("targetLanguage", targetLangEl.value);
      }
      const statusEl = panel.querySelector("#iml-status");
      statusEl.textContent = "Saved ✓";
      statusEl.style.color = "#2e7d32";
      setTimeout(() => closeSettings(), 600);
    });
  }

  function openSettings() {
    createSettingsPanel();
    const overlay = document.getElementById("iml-settings-overlay");
    const panel = document.getElementById("iml-settings-panel");
    if (overlay) overlay.style.display = "block";
    if (panel) panel.style.display = "block";
  }

  function closeSettings() {
    const overlay = document.getElementById("iml-settings-overlay");
    const panel = document.getElementById("iml-settings-panel");
    if (overlay) overlay.style.display = "none";
    if (panel) panel.style.display = "none";
  }

  /* ── floating button ── */
  function toggleTranslate() {
    if (typeof pageTranslator !== "undefined" && pageTranslator.translatePage) {
      pageTranslator.translatePage();
    } else {
      chrome.runtime.sendMessage({ action: "toggle-translation" }, () => {});
    }
  }

  function createFloatingButton() {
    if (document.getElementById("iml-fab")) return;
    const fab = document.createElement("div");
    fab.id = "iml-fab";
    fab.style.cssText = [
      "position:fixed","right:14px","bottom:22px","z-index:2147483646",
      "display:flex","gap:6px","align-items:center",
    ].join(";");

    const btnTranslate = document.createElement("button");
    btnTranslate.id = "iml-btn-translate";
    btnTranslate.textContent = "译";
    btnTranslate.style.cssText = [
      "width:44px","height:44px","border:none","border-radius:22px",
      "background:#1677ff","color:#fff","font-size:20px",
      "box-shadow:0 4px 16px rgba(0,0,0,.25)","cursor:pointer","opacity:.92",
    ].join(";");
    btnTranslate.addEventListener("click", (e) => { e.preventDefault(); toggleTranslate(); });

    const btnSettings = document.createElement("button");
    btnSettings.id = "iml-btn-settings";
    btnSettings.textContent = "⚙";
    btnSettings.style.cssText = [
      "width:34px","height:34px","border:none","border-radius:17px",
      "background:#f0f0f0","color:#555","font-size:16px",
      "box-shadow:0 2px 8px rgba(0,0,0,.15)","cursor:pointer","opacity:.92",
    ].join(";");
    btnSettings.addEventListener("click", (e) => { e.preventDefault(); openSettings(); });

    fab.appendChild(btnTranslate);
    fab.appendChild(btnSettings);
    document.documentElement.appendChild(fab);
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "undefined") {
      GM_registerMenuCommand("Immersive Lite: Translate", toggleTranslate);
      GM_registerMenuCommand("Immersive Lite: Settings", openSettings);
    }
  }

  globalThis.__IMMERSIVE_LITE_OPEN_SETTINGS__ = openSettings;

  twpConfig.onReady(function () {
    if (!twpConfig.get("pageTranslatorService") || twpConfig.get("pageTranslatorService") === "google") {
      twpConfig.set("pageTranslatorService", "openai_compatible");
    }
    registerMenuCommands();
    createFloatingButton();
  });
})();


