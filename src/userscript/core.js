  const KEY = "immersive_lite_v7";
  const CACHE_KEY = "immersive_lite_cache_v1";
  const FAB_POS_KEY = "immersive_lite_fab_pos_v2";
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
