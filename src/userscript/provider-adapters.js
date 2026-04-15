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
    if (!c && Array.isArray(data?.translations)) return data.translations;
    if (typeof c === "string") {
      try {
        const j = JSON.parse(c);
        const a = j?.t || j?.translations || j?.data || j;
        if (Array.isArray(a)) return a;
      } catch {}
      const m = c.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          const a = JSON.parse(m[0]);
          if (Array.isArray(a)) return a;
        } catch {}
      }
    }
    return new Array(expected).fill("");
  }

  function requestTranslations(url, headers, payload, allowResponseFormat) {
    return postJSON(url, headers, JSON.stringify(payload));
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

  async function translateManyWithAdaptiveSplit(texts, settings, depth) {
    const s = norm(settings || state.settings);
    const url = buildApiUrl(s);
    if (!url) throw new Error("请先设置 API 地址");
    if (!s.apiKey && s.provider !== "custom") throw new Error("请先设置 API Key");

    const headers = { "Content-Type": "application/json" };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;

    const retryOn = (st) => [408,429,500,502,503,504].includes(st);
    const caps = getProviderCaps(s);
    const payload = buildTranslationPayload(texts, s);
    const maxAttempts = 2;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      let res = await requestTranslations(url, headers, payload, true);
      if (!res.ok && caps.responseFormat !== false && String(res.text || "").includes("response_format")) {
        const p2 = { ...payload };
        delete p2.response_format;
        res = await postJSON(url, headers, JSON.stringify(p2));
        await setProviderCaps({ responseFormat: false }, s);
      } else if (res.ok && caps.responseFormat == null && payload.response_format) {
        await setProviderCaps({ responseFormat: true }, s);
      }
      if (res.ok) {
        const data = JSON.parse(res.text);
        return parseResult(data, texts.length);
      }
      if (attempt < maxAttempts && retryOn(res.status)) {
        await sleep(140 * (attempt + 1));
        continue;
      }
      if (texts.length > 1 && (depth || 0) < 3) {
        const mid = Math.ceil(texts.length / 2);
        const left = await translateManyWithAdaptiveSplit(texts.slice(0, mid), s, (depth || 0) + 1);
        const right = await translateManyWithAdaptiveSplit(texts.slice(mid), s, (depth || 0) + 1);
        return left.concat(right);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    throw new Error("max retries");
  }

  async function translateMany(texts) {
    return await translateManyWithAdaptiveSplit(texts, state.settings, 0);
  }
