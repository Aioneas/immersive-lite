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
        <div style="font-size:12px;color:#6f7f97;line-height:1.5;padding:10px 12px;background:#f4f8ff;border-radius:10px;">
          稳定：更稳、更省；推荐：默认，适合大多数页面；极速：更快看到结果。缓存按服务 / 模型 / 目标语言 / 接口地址隔离；关闭缓存时不复用历史结果。
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

    function closePanel() { root.remove(); }
    $("iml-close2").addEventListener("click", closePanel);
    root.addEventListener("click", (e) => { if (e.target === root) closePanel(); });

    $("iml-save").addEventListener("click", async () => {
      const model = modelSelect.value === "custom" ? modelCustom.value.trim() : modelSelect.value;
      if (!model) { setStatus("模型不能为空", true); return; }
      state.settings = getDraftSettings();
      await gmSet(KEY, state.settings);
      refreshCacheInfo();
      setStatus("设置已保存");
    });
    $("iml-clear-scope-cache").addEventListener("click", async () => {
      await clearCurrentScopeCache(getDraftSettings());
      refreshCacheInfo();
      setStatus("当前作用域缓存已清理");
    });
    $("iml-clear-all-cache").addEventListener("click", async () => {
      await clearAllCache();
      refreshCacheInfo();
      setStatus("全部缓存已清理");
    });
    $("iml-restore").addEventListener("click", () => restorePage());
    $("iml-retranslate").addEventListener("click", async () => { restorePage(); await translatePage(); });
  }
