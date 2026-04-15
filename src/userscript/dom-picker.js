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
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 24) continue;
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

  function pickNodes() {
    const sel = "p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,summary,td,th,a,span,div,article,section,dd,dt,time";
    const all = Array.from(document.querySelectorAll(sel));
    return all.filter((el) => {
      if (!el || !el.isConnected) return false;
      if (el.closest("#iml-ui-root") || el.closest("#iml-settings-overlay")) return false;
      if (el.getAttribute("data-iml-translated") === "1") return false;
      const tag = el.tagName;
      if (["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","BUTTON","SELECT","OPTION","CODE","PRE","SVG"].includes(tag)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const txt = (el.innerText || "").trim();
      if (!hasTranslationValue(txt)) return false;
      if (txt.length > 2000) return false;
      if (el.childElementCount > 0) {
        const hasBlock = Array.from(el.children).some((c) => {
          const d = getComputedStyle(c).display;
          return d === "block" || d === "flex" || d === "grid";
        });
        if (hasBlock) return false;
      }
      return true;
    });
  }
