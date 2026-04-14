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

  async function translateMany(texts) {
    const s = norm(state.settings);
    const url = buildApiUrl(s);
    if (!url) throw new Error("请先设置 API 地址");
    if (!s.apiKey && s.provider !== "custom") throw new Error("请先设置 API Key");

    const headers = { "Content-Type": "application/json" };
    if (s.apiKey) headers.Authorization = "Bearer " + s.apiKey;

    const payload = {
      model: s.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a translation engine. Return only JSON. Do not explain." },
        { role: "user", content: `Translate to ${s.targetLang}. Return {\"t\":[...]} same length.\n` + JSON.stringify(texts) },
      ],
    };

    const retryOn = (st) => [408,429,500,502,503,504].includes(st);
    for (let attempt = 0; attempt <= 2; attempt++) {
      let res = await postJSON(url, headers, JSON.stringify(payload));
      if (!res.ok && String(res.text || "").includes("response_format")) {
        const p2 = { ...payload }; delete p2.response_format;
        res = await postJSON(url, headers, JSON.stringify(p2));
      }
      if (res.ok) {
        const data = JSON.parse(res.text);
        return parseResult(data, texts.length);
      }
      if (attempt < 2 && retryOn(res.status)) {
        await sleep(180 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    throw new Error("max retries");
  }
