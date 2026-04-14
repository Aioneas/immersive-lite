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

  function makeCacheKey(text) {
    const s = norm(state.settings);
    return [s.provider, s.model, s.targetLang, buildApiUrl(s), hashText(text)].join("|");
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
      };
    }
    if (typeof value === "string") {
      return {
        value,
        at: Date.now(),
      };
    }
    return null;
  }

  function normalizeCacheStore(store) {
    const src = store && typeof store === "object" ? store : {};
    const out = {};
    for (const [key, value] of Object.entries(src)) {
      const entry = normalizeCacheEntry(value);
      if (entry) out[key] = entry;
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

  function scheduleCacheFlush() {
    if (state.cacheFlushTimer) return;
    state.cacheFlushTimer = setTimeout(async () => {
      state.cacheFlushTimer = 0;
      state.cache = pruneCacheStore(normalizeCacheStore(state.cache));
      await gmSet(CACHE_KEY, state.cache);
    }, 180);
  }

  function getCache(text) {
    if (!state.settings.useCache) return null;
    const key = makeCacheKey(text);
    const entry = normalizeCacheEntry(state.cache[key]);
    if (!entry) return null;
    state.cache[key] = { value: entry.value, at: Date.now() };
    scheduleCacheFlush();
    return entry.value;
  }

  async function putCache(text, translated) {
    if (!state.settings.useCache) return;
    const key = makeCacheKey(text);
    state.cache[key] = {
      value: String(translated || ""),
      at: Date.now(),
    };
    state.cache = pruneCacheStore(state.cache);
    scheduleCacheFlush();
  }

  async function clearCache() {
    state.cache = {};
    if (state.cacheFlushTimer) {
      clearTimeout(state.cacheFlushTimer);
      state.cacheFlushTimer = 0;
    }
    await gmSet(CACHE_KEY, {});
  }

  function getCacheStats() {
    const total = Object.keys(state.cache || {}).length;
    const scopePrefix = makeCacheKey("").split("|").slice(0, 4).join("|");
    const currentScope = Object.keys(state.cache || {}).filter((k) => k.startsWith(scopePrefix)).length;
    return {
      total,
      currentScope,
      scopeLabel: getCacheScopeLabel(state.settings),
    };
  }
