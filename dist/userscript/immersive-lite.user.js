// ==UserScript==
// @name         Immersive Lite (Core)
// @namespace    https://github.com/Aioneas/immersive-lite
// @version      0.10.0
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


  const KEY = "immersive_lite_v7";
  const CACHE_KEY = "immersive_lite_cache_v1";
  const FAB_POS_KEY = "immersive_lite_fab_pos_v2";
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const MODEL_PRESETS = {
    openai: [
      "gpt-5.4","gpt-5.3","gpt-5.2","gpt-5.1","gpt-5",
      "gpt-5.3-codex","gpt-5.3-codex-spark","gpt-5.2-codex",
      "gpt-5.1-codex-max","gpt-5.1-codex","gpt-5-codex",
      "gpt-5-codex-mini","gpt-5-mini","gpt-5-nano","custom"
    ],
    deepseek: ["deepseek-chat", "deepseek-reasoner", "custom"],
    custom: ["custom"],
  };

  const DEFAULT = {
    provider: "openai",
    apiUrl: "",
    baseUrl: "https://api.openai.com",
    apiInputRaw: "",
    apiKey: "",
    model: "gpt-5.4",
    targetLang: "zh-CN",
    autoTranslateEnglish: false,
    displayMode: "bilingual",
    speedMode: "fast",
    batchInterval: 120,
    batchSize: 8,
    batchLength: 1200,
    concurrency: 12,
    useCache: true,
  };

  const state = {
    translating: false,
    translated: false,
    settings: { ...DEFAULT },
    originalHTML: new WeakMap(),
    fab: null,
    fabRoot: null,
    fabHost: null,
    panel: null,
    statusEl: null,
    runId: 0,
    inflight: new Map(),
    batchQueue: null,
    cache: {},
    cacheFlushTimer: 0,
    cacheWriteSeq: 0,
    cacheWriteChain: Promise.resolve(),
    fabPos: null,
    fabDockTimer: 0,
    autoTranslateTriggered: false,
    autoTranslateInitTimer: 0,
    renderQueue: [],
    renderScheduled: false,
    adaptiveSamples: [],
    adaptiveProfile: "base",
    mutationObserver: null,
    mutationTimer: 0,
    lastUrl: location.href,
  };

  function normalizeLangCode(value) {
    return String(value || "").trim().replace(/_/g, "-").toLowerCase();
  }

  function getLangBase(value) {
    return normalizeLangCode(value).split("-")[0] || "";
  }

  function isSameLanguage(a, b) {
    const aa = getLangBase(a);
    const bb = getLangBase(b);
    return !!aa && !!bb && aa === bb;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }


  async function gmGet(k, d) {
    try {
      if (typeof GM !== "undefined" && GM.getValue) return await GM.getValue(k, d);
      if (typeof GM_getValue !== "undefined") return GM_getValue(k, d);
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : d;
    } catch { return d; }
  }
  async function gmSet(k, v) {
    try {
      if (typeof GM !== "undefined" && GM.setValue) return await GM.setValue(k, v);
      if (typeof GM_setValue !== "undefined") return GM_setValue(k, v);
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  }

  async function loadSettingsWithMigration() {
    const current = await gmGet(KEY, null);
    if (current && typeof current === "object") return norm({ ...DEFAULT, ...current });

    const legacyKeys = ["immersive_lite_v9", "immersive_lite_v8", "immersive_lite_v6", "immersive_lite_v3", "immersive_lite_core_settings_v3"];
    for (const legacyKey of legacyKeys) {
      const legacy = await gmGet(legacyKey, null);
      if (legacy && typeof legacy === "object") {
        const migrated = norm({ ...DEFAULT, ...legacy });
        await gmSet(KEY, migrated);
        return migrated;
      }
    }

    return norm(DEFAULT);
  }

  function ensureHttp(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  }
  function normalizeApiInput(raw) {
    const input = String(raw || "").trim();
    const v = ensureHttp(input).replace(/\/$/, "");
    if (!v) return { apiUrl: "", baseUrl: "", apiInputRaw: input };
    if (/(\/v\d+)?\/chat\/completions$/i.test(v)) {
      return { apiUrl: v, baseUrl: "", apiInputRaw: input };
    }
    return { apiUrl: "", baseUrl: v, apiInputRaw: input };
  }

  function getApiInputValue(settings) {
    return String(settings.apiInputRaw || settings.apiUrl || settings.baseUrl || "").trim();
  }

  function buildApiUrl(s) {
    const full = ensureHttp(s.apiUrl || "");
    if (full) return full;
    let b = ensureHttp(s.baseUrl || "").replace(/\/$/, "");
    if (!b) return "";
    if (b.endsWith("/v1/chat/completions") || b.endsWith("/chat/completions")) return b;
    if (b.endsWith("/v1")) return b + "/chat/completions";
    return b + "/v1/chat/completions";
  }
  function norm(input) {
    const t = { ...input };
    if (t.provider === "deepseek") {
      if (!t.baseUrl) t.baseUrl = "https://api.deepseek.com";
      if (!t.model) t.model = "deepseek-chat";
    } else if (t.provider === "openai") {
      if (!t.baseUrl) t.baseUrl = "https://api.openai.com";
      if (!t.model) t.model = "gpt-5.4";
    }

    if (!t.apiInputRaw) {
      t.apiInputRaw = String(t.apiUrl || t.baseUrl || "").trim();
    }

    const speed = ["balanced", "fast", "aggressive"].includes(t.speedMode) ? t.speedMode : "fast";
    const PRESETS = {
      balanced: { batchInterval: 160, batchSize: 8, batchLength: 1300, concurrency: 10 },
      fast: { batchInterval: 120, batchSize: 8, batchLength: 1200, concurrency: 12 },
      aggressive: { batchInterval: 70, batchSize: 6, batchLength: 900, concurrency: 16 },
    };
    const preset = PRESETS[speed];

    t.speedMode = speed;
    if (!("batchInterval" in t) || t.batchInterval == null || t.batchInterval === "") t.batchInterval = preset.batchInterval;
    if (!("batchSize" in t) || t.batchSize == null || t.batchSize === "") t.batchSize = preset.batchSize;
    if (!("batchLength" in t) || t.batchLength == null || t.batchLength === "") t.batchLength = preset.batchLength;
    if (!("concurrency" in t) || t.concurrency == null || t.concurrency === "") t.concurrency = preset.concurrency;

    t.batchInterval = Math.min(500, Math.max(0, Number(t.batchInterval || preset.batchInterval)));
    t.batchSize = Math.min(20, Math.max(1, Number(t.batchSize || preset.batchSize)));
    t.batchLength = Math.min(4000, Math.max(200, Number(t.batchLength || preset.batchLength)));
    t.concurrency = Math.min(32, Math.max(1, Number(t.concurrency || preset.concurrency)));
    t.displayMode = t.displayMode === "translated" ? "translated" : "bilingual";
    t.autoTranslateEnglish = t.autoTranslateEnglish === true;
    t.useCache = t.useCache !== false;
    return t;
  }

  function setStatus(msg, err) {
    if (!state.statusEl) return;
    state.statusEl.textContent = msg || "";
    state.statusEl.style.color = err ? "#d32f2f" : "#6f7f97";
  }

  function recordAdaptiveSample(sample) {
    const item = sample && typeof sample === "object" ? sample : null;
    if (!item) return;
    state.adaptiveSamples.push({
      ms: Math.max(0, Number(item.ms || 0)),
      count: Math.max(1, Number(item.count || 1)),
      chars: Math.max(1, Number(item.chars || 1)),
      ok: item.ok !== false,
      at: Date.now(),
    });
    if (state.adaptiveSamples.length > 18) state.adaptiveSamples.splice(0, state.adaptiveSamples.length - 18);
    state.adaptiveProfile = getAdaptiveProfileName();
  }

  function getAdaptiveProfileName() {
    const okSamples = state.adaptiveSamples.filter((x) => x && x.ok !== false);
    if (okSamples.length < 3) return "base";
    const avgMs = okSamples.reduce((sum, x) => sum + Number(x.ms || 0), 0) / okSamples.length;
    if (avgMs >= 2600) return "slow";
    if (avgMs <= 1100) return "fast";
    return "base";
  }

  function tuneQueueConfig(baseConfig, phaseName) {
    const cfg = { ...(baseConfig || {}) };
    const profile = getAdaptiveProfileName();
    if (phaseName === "foreground") {
      if (profile === "slow") {
        cfg.batchSize = Math.min(cfg.batchSize || 4, 3);
        cfg.batchLength = Math.min(cfg.batchLength || 600, 420);
      } else if (profile === "fast") {
        cfg.batchSize = Math.min(5, Math.max(1, (cfg.batchSize || 4) + 1));
        cfg.batchLength = Math.min(760, Math.max(240, (cfg.batchLength || 600) + 120));
      }
      return cfg;
    }
    if (profile === "slow") {
      cfg.batchInterval = Math.min(220, Math.max(40, Number(cfg.batchInterval || 120) + 30));
      cfg.batchSize = Math.min(cfg.batchSize || 8, 6);
      cfg.batchLength = Math.min(cfg.batchLength || 1200, 900);
      cfg.concurrency = Math.min(cfg.concurrency || 12, 10);
    } else if (profile === "fast") {
      cfg.batchInterval = Math.max(40, Number(cfg.batchInterval || 120) - 20);
      cfg.batchSize = Math.min(10, Math.max(1, Number(cfg.batchSize || 8) + 1));
      cfg.batchLength = Math.min(1500, Math.max(200, Number(cfg.batchLength || 1200) + 180));
      cfg.concurrency = Math.min(16, Math.max(1, Number(cfg.concurrency || 12) + 1));
    }
    return cfg;
  }


  const CACHE_LIMIT = 1200;
  const CACHE_TRIM_TO = 1000;

  function hashText(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  // [FIX #1] Anti-collision: hash + length + first/last chars as composite key
  function makeCacheFingerprint(text) {
    const t = String(text || "");
    const prefix = t.slice(0, 32);
    const suffix = t.length > 32 ? t.slice(-16) : "";
    return hashText(t) + ":" + t.length + ":" + hashText(prefix + "|" + suffix);
  }

  function makeScopeKey(settings) {
    const s = norm(settings || state.settings);
    return JSON.stringify([s.provider, s.model, s.targetLang, buildApiUrl(s)]);
  }

  function makeLegacyCacheKey(text, settings) {
    const s = norm(settings || state.settings);
    return [s.provider, s.model, s.targetLang, buildApiUrl(s), hashText(text)].join("|");
  }

  function makeCacheKey(text, settings) {
    return JSON.stringify([makeScopeKey(settings), makeCacheFingerprint(text)]);
  }

  function getCacheScopeLabel(settings) {
    const s = norm(settings || state.settings);
    return `${getProviderLabel(s.provider)} / ${s.model} / ${s.targetLang} / ${buildApiUrl(s)}`;
  }

  function shouldSkipTranslationText(text) {
    return !hasTranslationValue(text);
  }

  function normalizeCacheEntry(value) {
    if (value && typeof value === "object" && typeof value.value === "string") {
      return {
        value: value.value,
        at: Number(value.at || Date.now()),
        scope: typeof value.scope === "string" ? value.scope : "",
      };
    }
    if (typeof value === "string") {
      return {
        value,
        at: Date.now(),
        scope: "",
      };
    }
    return null;
  }

  function normalizeCacheStore(store) {
    const src = store && typeof store === "object" ? store : {};
    const out = {};
    const now = Date.now();
    for (const [key, value] of Object.entries(src)) {
      const entry = normalizeCacheEntry(value);
      if (!entry) continue;
      // [FIX #11] TTL: skip entries older than 7 days
      if (now - entry.at > CACHE_TTL_MS) continue;
      out[key] = entry;
    }
    return out;
  }

  function pruneCacheStore(cache) {
    const keys = Object.keys(cache || {});
    if (keys.length <= CACHE_LIMIT) return cache || {};
    const sorted = keys.sort((a, b) => Number(cache[a]?.at || 0) - Number(cache[b]?.at || 0));
    const next = { ...(cache || {}) };
    for (const key of sorted.slice(0, Math.max(0, keys.length - CACHE_TRIM_TO))) {
      delete next[key];
    }
    return next;
  }

  function enqueueCachePersist() {
    const seq = ++state.cacheWriteSeq;
    state.cacheWriteChain = state.cacheWriteChain.then(async () => {
      if (seq !== state.cacheWriteSeq) return;
      state.cache = pruneCacheStore(normalizeCacheStore(state.cache));
      await gmSet(CACHE_KEY, state.cache);
    }).catch(() => {});
    return state.cacheWriteChain;
  }

  function scheduleCacheFlush() {
    if (state.cacheFlushTimer) return;
    state.cacheFlushTimer = setTimeout(() => {
      state.cacheFlushTimer = 0;
      enqueueCachePersist();
    }, 180);
  }

  function getCache(text) {
    if (!state.settings.useCache) return null;
    const key = makeCacheKey(text);
    const legacyKey = makeLegacyCacheKey(text);
    const hitKey = Object.prototype.hasOwnProperty.call(state.cache, key) ? key : (Object.prototype.hasOwnProperty.call(state.cache, legacyKey) ? legacyKey : "");
    if (!hitKey) return null;
    const entry = normalizeCacheEntry(state.cache[hitKey]);
    if (!entry) return null;
    // [FIX #11] TTL check on read
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      delete state.cache[hitKey];
      return null;
    }
    const nextKey = key;
    if (hitKey !== nextKey) delete state.cache[hitKey];
    state.cache[nextKey] = { value: entry.value, at: Date.now(), scope: makeScopeKey(state.settings) };
    scheduleCacheFlush();
    return entry.value;
  }

  async function putCache(text, translated) {
    if (!state.settings.useCache) return;
    const key = makeCacheKey(text);
    state.cache[key] = {
      value: String(translated || ""),
      at: Date.now(),
      scope: makeScopeKey(state.settings),
    };
    state.cache = pruneCacheStore(state.cache);
    scheduleCacheFlush();
  }

  async function clearAllCache() {
    state.cache = {};
    if (state.cacheFlushTimer) {
      clearTimeout(state.cacheFlushTimer);
      state.cacheFlushTimer = 0;
    }
    await enqueueCachePersist();
  }

  async function clearCurrentScopeCache(scopeSettings) {
    const scope = makeScopeKey(scopeSettings || state.settings);
    const next = {};
    for (const [key, value] of Object.entries(state.cache || {})) {
      const entry = normalizeCacheEntry(value);
      if (!entry) continue;
      if (entry.scope !== scope) next[key] = entry;
    }
    state.cache = next;
    if (state.cacheFlushTimer) {
      clearTimeout(state.cacheFlushTimer);
      state.cacheFlushTimer = 0;
    }
    await enqueueCachePersist();
  }

  function getCacheStats(scopeSettings) {
    const normalized = normalizeCacheStore(state.cache);
    const total = Object.keys(normalized).length;
    const scope = makeScopeKey(scopeSettings || state.settings);
    const currentScope = Object.values(normalized).filter((entry) => entry.scope === scope).length;
    return {
      total,
      currentScope,
      scopeLabel: getCacheScopeLabel(scopeSettings || state.settings),
      enabled: norm(scopeSettings || state.settings).useCache !== false,
    };
  }


  function isLikelyDateOrTime(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (/^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(日)?$/.test(t)) return true;
    if (/^\d{1,2}[:：]\d{2}([:：]\d{2})?$/.test(t)) return true;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(t)) return true;
    return false;
  }

  function isMostlyNumeric(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (t.length <= 30 && /^[\d\s.,:%$€£¥+\-–—()/年月日:：]+$/.test(t)) return true;
    return false;
  }

  function isLikelyIdentifier(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (/^@[A-Za-z0-9_]{1,32}$/.test(t)) return true;
    if (/^[A-Za-z0-9_]{1,20}$/.test(t)) return true;
    if (/^(ID|id)[:#\s-]*[A-Za-z0-9_-]{2,}$/.test(t)) return true;
    return false;
  }

  function isLikelyUiChromeText(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (t.length > 32) return false;
    if (/^(home|menu|search|share|login|log in|sign in|sign up|register|subscribe|follow|following|next|previous|back|close|open|download|read more|more|comments?)$/i.test(t)) return true;
    if (/^(首页|菜单|搜索|分享|登录|注册|订阅|关注|下一页|上一页|返回|关闭|打开|下载|更多|评论)$/i.test(t)) return true;
    return false;
  }

  function hasTranslationValue(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (t.length < 3) return false;
    if (isLikelyDateOrTime(t)) return false;
    if (isMostlyNumeric(t)) return false;
    if (isLikelyIdentifier(t)) return false;
    if (isLikelyUiChromeText(t)) return false;
    if (/^[\p{P}\p{S}\s]+$/u.test(t)) return false;
    return true;
  }

  function pickPageLanguageSample() {
    const texts = [];
    const pushText = (value) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      texts.push(text);
    };

    pushText(document.title || "");

    const selectors = "article,main,p,h1,h2,h3,li,blockquote,figcaption,summary,td,th,div,section";
    const nodes = Array.from(document.querySelectorAll(selectors));
    for (const el of nodes) {
      if (texts.join(" ").length >= 4000) break;
      if (!el || !el.isConnected) continue;
      if (el.closest("#iml-ui-root") || el.closest("#iml-settings-overlay")) continue;
      const tag = el.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "BUTTON", "SELECT", "OPTION", "CODE", "PRE", "SVG"].includes(tag)) continue;
      // [OPT #8] Defer getComputedStyle: only check if text looks useful first
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 24) continue;
      try {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
      } catch { continue; }
      pushText(text);
    }

    return texts.join(" ").slice(0, 4000);
  }

  function detectCjkLanguage(sample) {
    const text = String(sample || "");
    const zh = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const ja = (text.match(/[\u3040-\u30ff]/g) || []).length;
    const ko = (text.match(/[\uac00-\ud7af]/g) || []).length;
    const max = Math.max(zh, ja, ko);
    if (max < 24) return "";
    if (max === ja) return "ja";
    if (max === ko) return "ko";
    return "zh";
  }

  function isEnglishTextSample(sample) {
    const text = String(sample || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    if (text.length < 160) return false;
    const latinLetters = (text.match(/[A-Za-z]/g) || []).length;
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    const words = text.match(/[A-Za-z]{2,}/g) || [];
    const commonWords = text.match(/\b(the|and|that|with|for|from|this|have|your|you|not|are|was|were|will|can|more|one|all|about|into|than|there|their|what|when|where|which|how|why|who|has|had|new|after|before|over|under|between|during|news|article|story|read|said)\b/gi) || [];
    return latinLetters >= 140 && latinLetters > cjkChars * 4 && words.length >= 35 && commonWords.length >= 8;
  }

  function detectPagePrimaryLanguage(sampleInput) {
    const sample = typeof sampleInput === "string" ? sampleInput : pickPageLanguageSample();
    const cjk = detectCjkLanguage(sample);
    if (cjk) return cjk;

    const metaCandidates = [
      document.documentElement?.lang,
      document.querySelector('meta[property="og:locale"]')?.content,
      document.querySelector('meta[http-equiv="content-language"]')?.content,
      document.querySelector('meta[name="language"]')?.content,
    ];

    for (const item of metaCandidates) {
      const base = getLangBase(item);
      if (base) return base;
    }

    if (isEnglishTextSample(sample)) return "en";
    return "und";
  }

  function getNearViewportPriority(node) {
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const nearTop = -vh * 1.2;
    const nearBottom = vh * 2.2;
    const inView = rect.bottom > 0 && rect.top < vh;
    const nearView = rect.bottom > nearTop && rect.top < nearBottom;
    if (inView) return { phase: 0, distance: Math.abs(rect.top) };
    if (nearView) {
      if (rect.top >= vh) return { phase: 1, distance: rect.top - vh };
      return { phase: 1, distance: Math.abs(rect.bottom) };
    }
    if (rect.top >= vh) return { phase: 2, distance: rect.top - vh };
    return { phase: 3, distance: Math.abs(rect.bottom) };
  }

  const SKIP_TAGS = new Set(["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","BUTTON","SELECT","OPTION","CODE","PRE","SVG"]);

  function pickNodes() {
    const sel = "p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,summary,td,th,a,span,div,article,section,dd,dt,time";
    const all = Array.from(document.querySelectorAll(sel));
    return all.filter((el) => {
      if (!el || !el.isConnected) return false;
      if (el.closest("#iml-ui-root") || el.closest("#iml-settings-overlay")) return false;
      if (el.getAttribute("data-iml-translated") === "1") return false;
      const tag = el.tagName;
      if (SKIP_TAGS.has(tag)) return false;
      // [OPT #6/#12] Lightweight checks first, defer getComputedStyle
      const txt = (el.innerText || "").trim();
      if (!hasTranslationValue(txt)) return false;
      if (txt.length > 2000) return false;
      // Now do the expensive checks
      try {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
      } catch { return false; }
      if (el.childElementCount > 0) {
        const hasBlock = Array.from(el.children).some((c) => {
          try {
            const d = getComputedStyle(c).display;
            return d === "block" || d === "flex" || d === "grid";
          } catch { return false; }
        });
        if (hasBlock) return false;
      }
      return true;
    });
  }


  async function postJSON(url, headers, body) {
    if (typeof GM !== "undefined" && GM.xmlHttpRequest) {
      return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: "POST",
          url,
          headers,
          data: body,
          onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText || "" }),
          onerror: reject,
        });
      });
    }
    if (typeof GM_xmlhttpRequest !== "undefined") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers,
          data: body,
          onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText || "" }),
          onerror: reject,
        });
      });
    }
    const r = await fetch(url, { method: "POST", headers, body });
    return { ok: r.ok, status: r.status, text: await r.text() };
  }

  // [FIX #2] Robust parseResult: validate array length, String() coerce each element
  function parseResult(data, expected) {
    let c = data?.choices?.[0]?.message?.content;
    if (Array.isArray(c)) {
      c = c.map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      }).join("");
    }
    if (!c && typeof data?.choices?.[0]?.text === "string") c = data.choices[0].text;
    if (!c && Array.isArray(data?.translations)) {
      return normalizeResultArray(data.translations, expected);
    }
    if (typeof c === "string") {
      try {
        const j = JSON.parse(c);
        const a = j?.t || j?.translations || j?.data || j;
        if (Array.isArray(a)) return normalizeResultArray(a, expected);
      } catch {}
      const m = c.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          const a = JSON.parse(m[0]);
          if (Array.isArray(a)) return normalizeResultArray(a, expected);
        } catch {}
      }
    }
    return new Array(expected).fill("");
  }

  function normalizeResultArray(arr, expected) {
    const result = [];
    for (let i = 0; i < expected; i++) {
      const v = i < arr.length ? arr[i] : "";
      result.push(typeof v === "string" ? v : String(v ?? ""));
    }
    if (arr.length !== expected) {
      console.warn("[immersive-lite] parseResult: expected", expected, "items but got", arr.length);
    }
    return result;
  }

  // [FIX #5] Broader response_format fallback: retry on any non-2xx (not just string match)
  async function requestTranslations(url, headers, payload, allowResponseFormat) {
    let res = await postJSON(url, headers, JSON.stringify(payload));
    if (!res.ok && allowResponseFormat && payload.response_format) {
      const p2 = { ...payload };
      delete p2.response_format;
      res = await postJSON(url, headers, JSON.stringify(p2));
    }
    return res;
  }

  function buildTranslationPayload(texts, settings) {
    return {
      model: settings.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a translation engine. Return JSON only." },
        { role: "user", content: `Translate each item to ${settings.targetLang}. Keep order and same length. Return JSON: {\"t\":[...]}\n${JSON.stringify(texts)}` },
      ],
    };
  }

  // [FIX #6] Friendly HTTP error messages
  function friendlyHttpError(status, responseText) {
    const msg = String(responseText || "").slice(0, 200);
    if (status === 401) return "API Key 无效或已过期 (401)";
    if (status === 402) return "账户余额不足 (402)";
    if (status === 403) return "无权限访问该 API (403)";
    if (status === 404) return "API 地址或模型不存在 (404)，请检查设置";
    if (status === 429) return "请求过于频繁，已被限速 (429)";
    if (status >= 500) return `服务端错误 (${status})`;
    return `HTTP ${status}` + (msg ? `: ${msg}` : "");
  }

  // [FIX #3] Backoff delay before recursive split on error
  async function translateManyWithAdaptiveSplit(texts, settings, depth) {
    const s = norm(settings || state.settings);
    const url = buildApiUrl(s);
    if (!url) throw new Error("请先设置 API 地址");
    if (!s.apiKey && s.provider !== "custom") throw new Error("请先设置 API Key");

    const headers = { "Content-Type": "application/json" };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;

    const retryOn = (st) => [408,429,500,502,503,504].includes(st);
    const payload = buildTranslationPayload(texts, s);
    const maxAttempts = 2;
    let lastStatus = 0;
    let lastText = "";

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      const res = await requestTranslations(url, headers, payload, true);
      lastStatus = res.status;
      lastText = res.text || "";
      if (res.ok) {
        let data;
        try { data = JSON.parse(res.text); } catch { throw new Error("API 返回了无效的 JSON"); }
        return parseResult(data, texts.length);
      }
      if (attempt < maxAttempts && retryOn(res.status)) {
        await sleep(140 * (attempt + 1));
        continue;
      }
      if (texts.length > 1 && (depth || 0) < 3) {
        // [FIX #3] Backoff before recursive split to avoid thundering herd on 429
        await sleep(200 * ((depth || 0) + 1));
        const mid = Math.ceil(texts.length / 2);
        const left = await translateManyWithAdaptiveSplit(texts.slice(0, mid), s, (depth || 0) + 1);
        const right = await translateManyWithAdaptiveSplit(texts.slice(mid), s, (depth || 0) + 1);
        return left.concat(right);
      }
      throw new Error(friendlyHttpError(res.status, res.text));
    }
    throw new Error(friendlyHttpError(lastStatus, lastText));
  }

  async function translateMany(texts) {
    return await translateManyWithAdaptiveSplit(texts, state.settings, 0);
  }


  async function maybeAutoTranslateOnLoad() {
    if (state.autoTranslateTriggered || state.translating || state.translated) return false;

    const s = norm(state.settings);
    if (!s.autoTranslateEnglish) return false;

    const targetLang = s.targetLang || "";
    if (!targetLang || isSameLanguage(targetLang, "en")) return false;

    const sample = pickPageLanguageSample();
    if (sample.length < 200) return false;

    const pageLang = detectPagePrimaryLanguage(sample);
    if (pageLang !== "en") return false;
    if (isSameLanguage(pageLang, targetLang)) return false;

    const nodes = pickNodes();
    if (nodes.length < 3) return false;

    state.autoTranslateTriggered = true;
    setStatus("检测到英文页面，已自动翻译");
    await translatePage({ autoTriggered: true });
    return true;
  }

  // [FIX #4] Re-check cache before entering batchQueue to avoid duplicate API calls
  async function translateText(text) {
    if (shouldSkipTranslationText(text)) return text;

    const cached = getCache(text);
    if (cached) return cached;

    const key = makeCacheKey(text);
    if (state.inflight.has(key)) return await state.inflight.get(key);

    const p = (async () => {
      // Re-check cache: another worker may have finished translating the same text
      const cached2 = getCache(text);
      if (cached2) return cached2;

      if (state.batchQueue) {
        const res = await state.batchQueue.addTask(text);
        await putCache(text, res || "");
        return res || "";
      }
      const arr = await translateMany([text]);
      const tr = String(arr[0] || "");
      await putCache(text, tr);
      return tr;
    })();

    state.inflight.set(key, p);
    try {
      return await p;
    } finally {
      state.inflight.delete(key);
    }
  }

  function createBatchQueue(taskFn, opts) {
    const queue = [];
    let isProcessing = false;
    let timer = null;

    const config = {
      batchInterval: Math.max(0, Number(opts?.batchInterval || 0)),
      batchSize: Math.max(1, Number(opts?.batchSize || 1)),
      batchLength: Math.max(1, Number(opts?.batchLength || 1)),
      immediateFirstRun: opts?.immediateFirstRun === true,
    };
    let firstDispatchPending = config.immediateFirstRun;

    const schedule = () => {
      if (isProcessing || timer || queue.length === 0) return;
      if (firstDispatchPending) {
        firstDispatchPending = false;
        timer = setTimeout(processQueue, 0);
        return;
      }
      timer = setTimeout(processQueue, config.batchInterval);
    };

    const processQueue = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (queue.length === 0 || isProcessing) return;
      isProcessing = true;

      let totalLen = 0;
      let endIndex = 0;
      for (const task of queue) {
        const len = task.payload.length || 0;
        if (endIndex >= config.batchSize || (totalLen + len > config.batchLength && endIndex > 0)) break;
        totalLen += len;
        endIndex++;
      }
      const tasks = queue.splice(0, endIndex);
      if (!tasks.length) { isProcessing = false; return; }

      try {
        const res = await taskFn(tasks.map((x) => x.payload));
        tasks.forEach((task, i) => task.resolve(String(res[i] || "")));
      } catch (e) {
        tasks.forEach((task) => task.reject(e));
      } finally {
        isProcessing = false;
        if (queue.length > 0) {
          if (queue.length >= config.batchSize) setTimeout(processQueue, 0);
          else schedule();
        }
      }
    };

    return {
      addTask(payload) {
        return new Promise((resolve, reject) => {
          queue.push({ payload, resolve, reject });
          if (queue.length >= config.batchSize) processQueue();
          else schedule();
        });
      },
      destroy() {
        if (timer) clearTimeout(timer);
        while (queue.length) {
          const t = queue.shift();
          t.reject(new Error("queue destroyed"));
        }
      },
    };
  }

  // [FIX #10] Add lang attribute to translated spans for accessibility
  function renderTranslatedContent(node, orig, tr) {
    if (!state.originalHTML.has(node)) state.originalHTML.set(node, node.innerHTML);
    const langAttr = state.settings.targetLang ? ` lang="${esc(state.settings.targetLang)}"` : "";
    if (state.settings.displayMode === "translated") {
      node.innerHTML = `<span style="display:block"${langAttr}>${esc(tr || "")}</span>`;
    } else {
      node.innerHTML = `<span style="display:block">${esc(orig || "")}</span><span style="display:block;opacity:.7;color:#555;font-size:.92em"${langAttr}>${esc(tr || "")}</span>`;
    }
    node.setAttribute("data-iml-translated", "1");
  }

  function flushRenderQueueChunk() {
    state.renderScheduled = false;
    const runId = state.runId;
    let remaining = 8;
    while (remaining > 0 && state.renderQueue.length > 0) {
      const item = state.renderQueue.shift();
      if (!item || item.runId !== runId) continue;
      if (!item.node || !item.node.isConnected) continue;
      renderTranslatedContent(item.node, item.orig, item.tr);
      if (typeof item.afterRender === "function") item.afterRender();
      remaining--;
    }
    if (state.renderQueue.length > 0) scheduleRenderQueue();
  }

  function scheduleRenderQueue() {
    if (state.renderScheduled) return;
    state.renderScheduled = true;
    const cb = flushRenderQueueChunk;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
    else setTimeout(cb, 16);
  }

  function enqueueTranslationRender(item) {
    state.renderQueue.push(item);
    scheduleRenderQueue();
  }

  function clearRenderQueue() {
    state.renderQueue.length = 0;
    state.renderScheduled = false;
  }

  function splitNodesByCache(nodes) {
    const cached = [];
    const pending = [];
    for (const node of nodes) {
      const orig = (node.innerText || "").trim();
      if (!orig || shouldSkipTranslationText(orig)) continue;
      const tr = getCache(orig);
      if (typeof tr === "string" && tr) cached.push({ node, orig, tr });
      else pending.push(node);
    }
    return { cached, pending };
  }

  // [OPT #7] Pre-compute viewport priority once, then sort by stored values
  function splitTranslationBuckets(nodes) {
    const tagged = nodes.map((node) => {
      const p = getNearViewportPriority(node);
      return { node, phase: p.phase, distance: p.distance };
    });

    const foreground = [];
    const near = [];
    const far = [];
    for (const item of tagged) {
      if (item.phase === 0) foreground.push(item);
      else if (item.phase === 1) near.push(item);
      else far.push(item);
    }
    const sorter = (a, b) => {
      if (a.phase !== b.phase) return a.phase - b.phase;
      return a.distance - b.distance;
    };
    foreground.sort(sorter);
    near.sort(sorter);
    far.sort(sorter);
    return {
      foreground: foreground.map((x) => x.node),
      near: near.map((x) => x.node),
      far: far.map((x) => x.node),
    };
  }


  function createPhaseQueueConfig(base, phase) {
    const s = base || norm(state.settings);
    if (phase === "foreground") {
      return tuneQueueConfig({
        batchInterval: 0,
        batchSize: Math.min(4, Math.max(1, s.batchSize)),
        batchLength: Math.min(600, Math.max(240, s.batchLength)),
        immediateFirstRun: true,
        concurrency: s.concurrency,
      }, "foreground");
    }
    if (phase === "near") {
      return tuneQueueConfig({
        batchInterval: Math.max(20, Math.min(80, s.batchInterval)),
        batchSize: Math.min(6, Math.max(2, s.batchSize)),
        batchLength: Math.min(900, Math.max(300, s.batchLength)),
        immediateFirstRun: false,
        concurrency: s.concurrency,
      }, "near");
    }
    return tuneQueueConfig({
      batchInterval: s.batchInterval,
      batchSize: s.batchSize,
      batchLength: s.batchLength,
      immediateFirstRun: false,
      concurrency: s.concurrency,
    }, "far");
  }

  function getPhaseWorkerCount(settings, phaseName, nodeCount) {
    const s = norm(settings || state.settings);
    if (phaseName === "foreground") return Math.min(4, s.concurrency, nodeCount);
    return Math.min(s.concurrency, nodeCount);
  }

  function waitForRenderQueueDrained(runId) {
    return new Promise((resolve) => {
      let guard = 0;
      const check = () => {
        if (runId !== state.runId) return resolve();
        if (!state.renderQueue.some((item) => item && item.runId === runId)) return resolve();
        guard++;
        if (guard > 600) return resolve();
        setTimeout(check, 16);
      };
      check();
    });
  }

  async function runTranslationPhase(nodes, runId, totalState, phaseName) {
    if (!nodes.length) return;
    const s = norm(state.settings);
    const phaseConfig = createPhaseQueueConfig(s, phaseName);
    if (state.batchQueue) state.batchQueue.destroy();
    state.batchQueue = createBatchQueue(translateMany, phaseConfig);

    let cursor = 0;
    const workerCount = getPhaseWorkerCount({ ...s, concurrency: phaseConfig.concurrency || s.concurrency }, phaseName, nodes.length);

    async function worker() {
      while (true) {
        if (!state.translating || runId !== state.runId) return;
        const idx = cursor++;
        if (idx >= nodes.length) return;
        const node = nodes[idx];
        const orig = (node.innerText || "").trim();
        try {
          const startedAt = Date.now();
          const tr = await translateText(orig);
          recordAdaptiveSample({ ms: Date.now() - startedAt, count: 1, chars: orig.length, ok: true });
          if (!state.translating || runId !== state.runId) return;
          enqueueTranslationRender({
            runId,
            node,
            orig,
            tr,
            afterRender() {
              totalState.done++;
              setStatus(`翻译中 ${totalState.done}/${totalState.total}`);
            },
          });
        } catch (e) {
          recordAdaptiveSample({ ms: 2800, count: 1, chars: orig.length, ok: false });
          totalState.failed++;
          console.error("[immersive-lite] text err", phaseName, e);
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    await waitForRenderQueueDrained(runId);
  }

  async function translatePage(options) {
    const opts = options || {};
    if (state.translating || state.translated) return;
    if (!opts.autoTriggered) state.autoTranslateTriggered = false;
    state.translating = true;
    state.runId += 1;
    const runId = state.runId;
    clearRenderQueue();
    setFabState(true);

    try {
      const nodes = pickNodes();
      if (!nodes.length) { setStatus("没找到可翻译文本", true); return; }

      const { foreground, near, far } = splitTranslationBuckets(nodes);
      const totalState = { total: nodes.length, done: 0, failed: 0 };
      setStatus(`翻译中 0/${totalState.total}（${state.adaptiveProfile || getAdaptiveProfileName()}）`);

      const cachedForeground = splitNodesByCache(foreground);
      const cachedNear = splitNodesByCache(near);
      const cachedFar = splitNodesByCache(far);
      const cachedEntries = cachedForeground.cached.concat(cachedNear.cached.slice(0, 8));
      for (const item of cachedEntries) {
        enqueueTranslationRender({
          runId,
          node: item.node,
          orig: item.orig,
          tr: item.tr,
          afterRender() {
            totalState.done++;
            setStatus(`翻译中 ${totalState.done}/${totalState.total}`);
          },
        });
      }
      await waitForRenderQueueDrained(runId);
      if (!state.translating || runId !== state.runId) return;

      await runTranslationPhase(cachedForeground.pending, runId, totalState, "foreground");
      if (!state.translating || runId !== state.runId) return;
      await runTranslationPhase(cachedNear.pending, runId, totalState, "near");
      if (!state.translating || runId !== state.runId) return;
      await runTranslationPhase(cachedFar.pending, runId, totalState, "far");
      if (runId !== state.runId) return;

      state.translated = totalState.done > 0;
      setStatus(totalState.failed > 0 ? `完成 ${totalState.done}/${totalState.total}，${totalState.failed} 段失败` : "");
    } catch (e) {
      setStatus("翻译失败: " + (e?.message || e), true);
    } finally {
      if (state.batchQueue) { state.batchQueue.destroy(); state.batchQueue = null; }
      if (runId === state.runId) {
        state.translating = false;
        setFabState(false);
      }
    }
  }

  function restorePage() {
    state.runId += 1;
    state.translating = false;
    state.autoTranslateTriggered = false;
    clearRenderQueue();
    if (state.batchQueue) { state.batchQueue.destroy(); state.batchQueue = null; }
    const nodes = Array.from(document.querySelectorAll("[data-iml-translated='1']"));
    for (const n of nodes) {
      const html = state.originalHTML.get(n);
      if (typeof html === "string") n.innerHTML = html;
      n.removeAttribute("data-iml-translated");
    }
    state.translated = false;
    setFabState(false);
    setStatus("已恢复原文");
  }


  // ─── [NEW #7] MutationObserver: auto-translate dynamically added content ───
  function startMutationObserver() {
    if (state.mutationObserver) return;
    const DEBOUNCE_MS = 800;

    state.mutationObserver = new MutationObserver((mutations) => {
      if (!state.translated || state.translating) return;
      // Only react if new text nodes / elements were actually added
      let hasNewContent = false;
      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && !n.closest("#iml-ui-root") && !n.closest("#iml-settings-overlay")) {
              hasNewContent = true;
              break;
            }
          }
        }
        if (hasNewContent) break;
      }
      if (!hasNewContent) return;

      if (state.mutationTimer) clearTimeout(state.mutationTimer);
      state.mutationTimer = setTimeout(() => {
        state.mutationTimer = 0;
        translateNewNodes();
      }, DEBOUNCE_MS);
    });

    state.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function stopMutationObserver() {
    if (state.mutationObserver) {
      state.mutationObserver.disconnect();
      state.mutationObserver = null;
    }
    if (state.mutationTimer) {
      clearTimeout(state.mutationTimer);
      state.mutationTimer = 0;
    }
  }

  async function translateNewNodes() {
    if (state.translating || !state.translated) return;
    const nodes = pickNodes();
    if (!nodes.length) return;

    state.translating = true;
    state.runId += 1;
    const runId = state.runId;
    setFabState(true);

    try {
      const { foreground, near, far } = splitTranslationBuckets(nodes);
      const allPending = foreground.concat(near, far);
      const totalState = { total: allPending.length, done: 0, failed: 0 };
      setStatus(`增量翻译 0/${totalState.total}`);

      // Use a single background phase for incremental translation
      await runTranslationPhase(allPending, runId, totalState, "near");
      if (runId !== state.runId) return;
      setStatus(totalState.failed > 0 ? `增量完成 ${totalState.done}/${totalState.total}，${totalState.failed} 段失败` : "");
    } catch (e) {
      console.error("[immersive-lite] incremental translate err", e);
    } finally {
      if (state.batchQueue) { state.batchQueue.destroy(); state.batchQueue = null; }
      if (runId === state.runId) {
        state.translating = false;
        setFabState(false);
      }
    }
  }

  // ─── [NEW #8] SPA route change detection ───
  function setupSpaDetection() {
    const onRouteChange = () => {
      const newUrl = location.href;
      if (newUrl === state.lastUrl) return;
      state.lastUrl = newUrl;
      // If we had translated the previous page, reset and re-detect
      if (state.translated || state.translating) {
        restorePage();
      }
      state.autoTranslateTriggered = false;
      // Re-schedule auto-translate detection for the new route
      scheduleAutoTranslateInit();
    };

    // Listen for popstate (back/forward)
    window.addEventListener("popstate", onRouteChange);

    // Intercept pushState / replaceState
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      setTimeout(onRouteChange, 60);
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      setTimeout(onRouteChange, 60);
    };
  }


  function getProviderLabel(value) {
    if (value === "openai") return "OpenAI";
    if (value === "deepseek") return "DeepSeek";
    if (value === "custom") return "自定义接口";
    return value || "";
  }

  function buildModelOptions(prov, sel, inp, cur) {
    const list = MODEL_PRESETS[prov] || ["custom"];
    sel.innerHTML = list.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    if (list.includes(cur)) { sel.value = cur; inp.style.display = "none"; inp.value = ""; }
    else { sel.value = "custom"; inp.style.display = "block"; inp.value = cur || ""; }
  }

  function openSettings() {
    const existed = document.getElementById("iml-settings-overlay");
    if (existed) existed.remove();

    const s = state.settings;
    const root = document.createElement("div");
    root.id = "iml-settings-overlay";
    root.style.cssText = "position:fixed;inset:0;background:rgba(8,15,29,.46);backdrop-filter:blur(2px);z-index:2147483647;padding-top:env(safe-area-inset-top);";

    const panel = document.createElement("div");
    panel.style.cssText = "position:absolute;left:0;right:0;bottom:0;top:calc(env(safe-area-inset-top) + 8px);background:linear-gradient(180deg,#fff 0%,#f8fbff 100%);border-radius:18px 18px 0 0;padding:14px 14px calc(26px + env(safe-area-inset-bottom));overflow:auto;font:14px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;box-shadow:0 -12px 30px rgba(0,0,0,.16);";
    panel.innerHTML = `
      <div style="display:flex;justify-content:flex-start;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-size:16px;font-weight:700;color:#10213a;">Immersive Lite</div>
          <div style="font-size:12px;color:#6f7f97;margin-top:2px;">稳定核心 + 批队列缓存 + 简化速度模式</div>
        </div>
      </div>
      <div style="display:grid;gap:10px;">
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">翻译服务</label>
          <select id="iml-provider" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
            <option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="custom">自定义接口</option>
          </select>
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">接口地址</label>
          <input id="iml-apiinput" placeholder="支持完整地址，或只填基础域名" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">API 密钥</label>
          <input id="iml-key" type="password" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">模型</label>
          <select id="iml-model-select" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;"></select>
          <input id="iml-model-custom" placeholder="自定义模型名" style="display:none;width:100%;margin-top:6px;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
        </div>
        <div style="display:flex;gap:8px;">
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">目标语言</label>
            <input id="iml-lang" placeholder="zh-CN" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;box-sizing:border-box" />
          </div>
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">显示模式</label>
            <select id="iml-display" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
              <option value="bilingual">双语对照</option><option value="translated">仅译文</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">速度模式</label>
            <select id="iml-speed" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
              <option value="balanced">稳定</option>
              <option value="fast">推荐</option>
              <option value="aggressive">极速</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">缓存</label>
            <select id="iml-cache-enabled" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select>
          </div>
        </div>
        <div>
          <label style="display:block;color:#5f6f87;font-size:12px;margin-bottom:4px;">自动翻译英文网页</label>
          <select id="iml-auto-en" style="width:100%;padding:10px;border:1px solid #d6e0ef;border-radius:10px;background:#fff;">
            <option value="off">关闭</option>
            <option value="on">开启</option>
          </select>
        </div>
        <div style="font-size:12px;color:#6f7f97;line-height:1.5;padding:10px 12px;background:#f4f8ff;border-radius:10px;">
          稳定：更稳、更省；推荐：默认，适合大多数页面；极速：更快看到结果。自动翻译英文网页开启后，会在检测到英文正文时自动执行一次整页翻译；当目标语言本身也是英语时不会触发。缓存按服务 / 模型 / 目标语言 / 接口地址隔离，7 天自动过期；关闭缓存时不复用历史结果。动态加载的内容会自动增量翻译。
        </div>
        <div id="iml-cache-card" style="font-size:12px;color:#5d6d86;line-height:1.6;padding:10px 12px;background:#f8fafc;border:1px solid #e4ebf5;border-radius:10px;">
          <div style="font-weight:600;color:#334b73;margin-bottom:4px;">缓存</div>
          <div id="iml-cache-scope"></div>
          <div id="iml-cache-stats" style="margin-top:2px;"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">
        <button id="iml-save" style="padding:11px;border:none;border-radius:11px;background:linear-gradient(135deg,#1677ff,#4f9bff);color:#fff;font-weight:600;">保存</button>
        <button id="iml-retranslate" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">重新翻译</button>
        <button id="iml-clear-scope-cache" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">清当前缓存</button>
        <button id="iml-clear-all-cache" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">清全部缓存</button>
        <button id="iml-restore" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">恢复原文</button>
        <button id="iml-close2" style="padding:11px;border:none;border-radius:11px;background:#eef3fb;color:#334b73;">关闭</button>
      </div>
      <div id="iml-status" style="color:#6f7f97;font-size:12px;margin-top:10px;line-height:1.5;"></div>
    `;
    root.appendChild(panel);
    document.documentElement.appendChild(root);

    const $ = (id) => panel.querySelector("#" + id);
    const provider = $("iml-provider"), apiinput = $("iml-apiinput"), key = $("iml-key");
    const modelSelect = $("iml-model-select"), modelCustom = $("iml-model-custom");
    const lang = $("iml-lang"), display = $("iml-display"), speed = $("iml-speed");
    const cacheEnabled = $("iml-cache-enabled");
    const autoTranslateEnglish = $("iml-auto-en");
    const cacheScope = $("iml-cache-scope"), cacheStats = $("iml-cache-stats");
    const status = $("iml-status");

    function getDraftSettings() {
      const model = modelSelect.value === "custom" ? modelCustom.value.trim() : modelSelect.value;
      const apiParsed = normalizeApiInput(apiinput.value.trim());
      return norm({
        ...state.settings,
        provider: provider.value,
        apiUrl: apiParsed.apiUrl,
        baseUrl: apiParsed.baseUrl,
        apiInputRaw: apiParsed.apiInputRaw,
        apiKey: key.value.trim(),
        model: model || state.settings.model,
        targetLang: lang.value.trim() || "zh-CN",
        autoTranslateEnglish: autoTranslateEnglish.value === "on",
        displayMode: display.value,
        speedMode: speed.value,
        useCache: cacheEnabled.value !== "off",
      });
    }

    function refreshCacheInfo() {
      const draft = getDraftSettings();
      const stats = getCacheStats(draft);
      cacheScope.textContent = `缓存隔离：${stats.scopeLabel}`;
      cacheStats.textContent = stats.enabled
        ? `总缓存 ${stats.total} 条；当前作用域 ${stats.currentScope} 条。`
        : `当前已关闭缓存；翻译仍可用，但不会复用历史结果。总缓存 ${stats.total} 条。`;
    }

    state.statusEl = status; state.panel = root;
    provider.value = s.provider || "openai";
    apiinput.value = getApiInputValue(s);
    key.value = s.apiKey || "";
    lang.value = s.targetLang || "zh-CN";
    display.value = s.displayMode || "bilingual";
    speed.value = s.speedMode || "fast";
    cacheEnabled.value = s.useCache === false ? "off" : "on";
    autoTranslateEnglish.value = s.autoTranslateEnglish ? "on" : "off";
    buildModelOptions(provider.value, modelSelect, modelCustom, s.model || "");
    refreshCacheInfo();

    provider.addEventListener("change", () => {
      if (!apiinput.value.trim()) {
        if (provider.value === "openai") apiinput.value = "https://api.openai.com";
        if (provider.value === "deepseek") apiinput.value = "https://api.deepseek.com";
      }
      buildModelOptions(provider.value, modelSelect, modelCustom, "");
      refreshCacheInfo();
    });
    modelSelect.addEventListener("change", () => {
      modelCustom.style.display = modelSelect.value === "custom" ? "block" : "none";
      refreshCacheInfo();
    });
    modelCustom.addEventListener("input", refreshCacheInfo);
    apiinput.addEventListener("input", refreshCacheInfo);
    lang.addEventListener("input", refreshCacheInfo);
    speed.addEventListener("change", refreshCacheInfo);
    display.addEventListener("change", refreshCacheInfo);
    cacheEnabled.addEventListener("change", refreshCacheInfo);
    autoTranslateEnglish.addEventListener("change", refreshCacheInfo);

    function closePanel() { root.remove(); }
    $("iml-close2").addEventListener("click", closePanel);
    root.addEventListener("click", (e) => { if (e.target === root) closePanel(); });

    $("iml-save").addEventListener("click", async () => {
      const next = getDraftSettings();
      if (!next.model) { setStatus("模型不能为空", true); return; }
      state.settings = next;
      await gmSet(KEY, next);
      setStatus("已保存");
      refreshCacheInfo();
    });

    $("iml-retranslate").addEventListener("click", async () => {
      const next = getDraftSettings();
      state.settings = next;
      await gmSet(KEY, next);
      restorePage();
      closePanel();
      await translatePage();
    });

    $("iml-clear-scope-cache").addEventListener("click", async () => {
      const draft = getDraftSettings();
      await clearCurrentScopeCache(draft);
      setStatus("已清除当前作用域缓存");
      refreshCacheInfo();
    });

    $("iml-clear-all-cache").addEventListener("click", async () => {
      await clearAllCache();
      setStatus("已清除全部缓存");
      refreshCacheInfo();
    });

    $("iml-restore").addEventListener("click", () => {
      restorePage();
      closePanel();
    });
  }


  function setFabState(busy) {
    if (!state.fab) return;
    state.fab.textContent = busy ? "…" : "译";
    state.fab.style.opacity = busy ? ".34" : ".78";
  }

  function getFabSize() {
    return 50;
  }

  function getViewportSize() {
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    const vh = window.innerHeight || document.documentElement.clientHeight || 844;
    return { vw, vh };
  }

  function getFabHalfHiddenLeft(edge) {
    const size = getFabSize();
    const { vw } = getViewportSize();
    if (edge === "left") return -Math.round(size * 0.4);
    if (edge === "right") return vw - Math.round(size * 0.6);
    return 0;
  }

  function getFabDefaultPosition() {
    return clampFabPosition((window.innerWidth || 390) - 64, (window.innerHeight || 844) - 94);
  }

  function getFabEdgeState(pos) {
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const size = getFabSize();
    const { vw } = getViewportSize();
    const leftGap = p.left;
    const rightGap = vw - p.left - size;
    if (leftGap <= 8) return "left";
    if (rightGap <= 8) return "right";
    return "free";
  }

  function clampFabPosition(left, top) {
    const size = getFabSize();
    const { vw, vh } = getViewportSize();
    const minLeft = 6;
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const maxLeft = Math.max(minLeft, vw - size - 6);
    const maxTop = Math.max(minTop, vh - size - 6);
    return {
      left: Math.max(minLeft, Math.min(left, maxLeft)),
      top: Math.max(minTop, Math.min(top, maxTop)),
    };
  }

  function toFabStoredPos(pos) {
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const size = getFabSize();
    const { vw, vh } = getViewportSize();
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const xMax = Math.max(1, vw - size - 12);
    const yMax = Math.max(1, vh - size - minTop - 6);
    return {
      x: Number(((p.left - 6) / xMax).toFixed(4)),
      y: Number(((p.top - minTop) / yMax).toFixed(4)),
      edge: getFabEdgeState(p),
    };
  }

  function fromFabStoredPos(stored) {
    if (!stored || typeof stored !== "object") return null;
    if (typeof stored.left === "number" || typeof stored.top === "number") {
      return clampFabPosition(Number(stored.left || 0), Number(stored.top || 0));
    }
    const size = getFabSize();
    const { vw, vh } = getViewportSize();
    const minTop = 6 + (window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0);
    const xMax = Math.max(1, vw - size - 12);
    const yMax = Math.max(1, vh - size - minTop - 6);
    return clampFabPosition(
      6 + xMax * Math.max(0, Math.min(1, Number(stored.x ?? 1))),
      minTop + yMax * Math.max(0, Math.min(1, Number(stored.y ?? 1))),
    );
  }

  function applyFabPosition(pos, options) {
    if (!state.fabHost || !pos) return;
    const opts = options || {};
    const p = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    const edge = getFabEdgeState(p);
    let left = p.left;
    if (!opts.reveal && edge === "left") left = getFabHalfHiddenLeft("left");
    if (!opts.reveal && edge === "right") left = getFabHalfHiddenLeft("right");

    state.fabHost.style.left = left + "px";
    state.fabHost.style.top = p.top + "px";
    state.fabHost.style.right = "auto";
    state.fabHost.style.bottom = "auto";
    state.fabHost.dataset.edgeState = edge;
  }

  async function saveFabPosition(pos) {
    state.fabPos = clampFabPosition(Number(pos.left || 0), Number(pos.top || 0));
    await gmSet(FAB_POS_KEY, toFabStoredPos(state.fabPos));
  }

  function normalizeFabPositionOnViewportChange() {
    if (!state.fabPos) return;
    const next = fromFabStoredPos(toFabStoredPos(state.fabPos));
    const changed = !!next && (next.left !== state.fabPos.left || next.top !== state.fabPos.top);
    if (!next) return;
    state.fabPos = next;
    dockFab();
    if (changed) gmSet(FAB_POS_KEY, toFabStoredPos(next));
  }

  function revealFab() {
    if (!state.fab || !state.fabPos) return;
    applyFabPosition(state.fabPos, { reveal: true });
    state.fab.style.opacity = state.translating ? ".42" : ".94";
  }

  function dockFab() {
    if (!state.fab || !state.fabPos) return;
    applyFabPosition(state.fabPos, { reveal: false });
    state.fab.style.opacity = state.translating ? ".26" : ".66";
  }

  function scheduleFabDock(delay) {
    if (!state.fab) return;
    if (state.fabDockTimer) {
      clearTimeout(state.fabDockTimer);
      state.fabDockTimer = 0;
    }
    state.fabDockTimer = setTimeout(() => {
      state.fabDockTimer = 0;
      dockFab();
    }, delay || 1200);
  }

  function setFabDraggingVisual(active) {
    if (!state.fab) return;
    state.fab.style.transition = active
      ? "opacity .12s ease"
      : "opacity .18s ease, transform .18s ease, background-color .18s ease";
    state.fab.style.backdropFilter = active ? "blur(6px)" : "blur(10px)";
    state.fab.style.webkitBackdropFilter = active ? "blur(6px)" : "blur(10px)";
    state.fab.style.boxShadow = active
      ? "0 3px 10px rgba(0,0,0,.10),0 1px 3px rgba(0,0,0,.08)"
      : "0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09)";
  }

  function mountUI() {
    if (window.self !== window.top) return;
    if (window.__IMMERSIVE_LITE_UI_MOUNTED__) return;
    if (document.getElementById("iml-ui-root")) return;
    window.__IMMERSIVE_LITE_UI_MOUNTED__ = true;

    const root = document.createElement("div");
    root.id = "iml-ui-root";
    root.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;left:0;top:0;";

    const host = document.createElement("div");
    host.id = "iml-fab-host";
    host.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;left:0;top:0;width:50px;height:50px;";

    const shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    if (shadow !== host) {
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        button {
          all: initial;
          position: relative;
          display: block;
          width: 50px;
          height: 50px;
          border: none;
          border-radius: 25px;
          background: rgba(88,96,110,.64);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #fff;
          font: 700 20px/50px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;
          text-align: center;
          box-shadow: 0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09);
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          pointer-events: auto;
          transition: opacity .18s ease, transform .18s ease, background-color .18s ease;
          will-change: opacity;
          cursor: pointer;
          transform: none;
          letter-spacing: 0;
          margin: 0;
          padding: 0;
          min-width: 0;
          min-height: 0;
        }
      `;
      shadow.appendChild(style);
    }

    const fab = document.createElement("button");
    fab.id = "iml-fab-main";
    fab.textContent = "译";
    if (shadow === host) {
      fab.style.cssText = "all:initial;position:relative;display:block;width:50px;height:50px;border:none;border-radius:25px;background:rgba(88,96,110,.64);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;font:700 20px/50px -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;text-align:center;box-shadow:0 6px 16px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.09);touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto;transition:opacity .18s ease, transform .18s ease, background-color .18s ease;will-change:opacity;cursor:pointer;transform:none;letter-spacing:0;margin:0;padding:0;min-width:0;min-height:0;";
    }

    let clickTimer = null;
    let suppressClickUntil = 0;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let moved = false;
    let dragging = false;

    const defaultPos = getFabDefaultPosition();

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      if (state.fabDockTimer) {
        clearTimeout(state.fabDockTimer);
        state.fabDockTimer = 0;
      }
      pointerId = e.pointerId;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      revealFab();
      setFabDraggingVisual(true);
      originLeft = state.fabPos ? state.fabPos.left : defaultPos.left;
      originTop = state.fabPos ? state.fabPos.top : defaultPos.top;
      if (fab.setPointerCapture) {
        try { fab.setPointerCapture(pointerId); } catch {}
      }
      e.stopPropagation();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      if (pointerId !== null && e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
      if (!moved) return;
      e.preventDefault();
      const next = clampFabPosition(originLeft + dx, originTop + dy);
      state.fabPos = next;
      applyFabPosition(next, { reveal: true });
    };

    const onPointerUp = async (e) => {
      if (!dragging) return;
      if (pointerId !== null && e.pointerId !== pointerId) return;
      const wasMoved = moved;
      dragging = false;
      setFabDraggingVisual(false);
      if (fab.releasePointerCapture && pointerId !== null) {
        try { fab.releasePointerCapture(pointerId); } catch {}
      }
      pointerId = null;

      if (wasMoved) {
        await saveFabPosition(state.fabPos || defaultPos);
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        suppressClickUntil = Date.now() + 350;
        moved = false;
        dockFab();
        e.preventDefault();
        return;
      }

      moved = false;
    };

    fab.addEventListener("pointerdown", onPointerDown);
    fab.addEventListener("pointermove", onPointerMove);
    fab.addEventListener("pointerup", onPointerUp);
    fab.addEventListener("pointercancel", onPointerUp);

    fab.addEventListener("click", (e) => {
      if (dragging || moved || Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      revealFab();
      scheduleFabDock(1800);
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; openSettings(); return; }
      clickTimer = setTimeout(async () => { clickTimer = null; await translatePage(); }, 280);
    });

    shadow.appendChild(fab);
    root.appendChild(host);
    document.documentElement.appendChild(root);
    state.fabRoot = root;
    state.fabHost = host;
    state.fab = fab;
    state.fabPos = fromFabStoredPos(state.fabPos) || defaultPos;
    applyFabPosition(state.fabPos);
    dockFab();

    window.addEventListener("resize", normalizeFabPositionOnViewportChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", normalizeFabPositionOnViewportChange, { passive: true });
      window.visualViewport.addEventListener("scroll", normalizeFabPositionOnViewportChange, { passive: true });
    }
  }


  if (window.self !== window.top) return;

  function scheduleAutoTranslateInit() {
    if (state.autoTranslateInitTimer) {
      clearTimeout(state.autoTranslateInitTimer);
      state.autoTranslateInitTimer = 0;
    }
    state.autoTranslateInitTimer = setTimeout(async () => {
      state.autoTranslateInitTimer = 0;
      try {
        await maybeAutoTranslateOnLoad();
      } catch (e) {
        console.error("[immersive-lite] auto translate init failed", e);
      }
    }, 900);
  }

  state.settings = await loadSettingsWithMigration();
  state.cache = normalizeCacheStore((await gmGet(CACHE_KEY, {})) || {});
  state.fabPos = await gmGet(FAB_POS_KEY, null);
  mountUI();
  startMutationObserver();
  setupSpaDetection();
  scheduleAutoTranslateInit();

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Immersive Lite: 整页翻译", translatePage);
    GM_registerMenuCommand("Immersive Lite: 打开设置", openSettings);
    GM_registerMenuCommand("Immersive Lite: 恢复原文", restorePage);
  }
})();
