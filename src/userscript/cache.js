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

  function makeScopeKey(settings) {
    const s = norm(settings || state.settings);
    return JSON.stringify([s.provider, s.model, s.targetLang, buildApiUrl(s)]);
  }

  function makeLegacyCacheKey(text, settings) {
    const s = norm(settings || state.settings);
    return [s.provider, s.model, s.targetLang, buildApiUrl(s), hashText(text)].join("|");
  }

  function makeCacheKey(text, settings) {
    return JSON.stringify([makeScopeKey(settings), hashText(text)]);
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
