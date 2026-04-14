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

  function hasTranslationValue(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (t.length < 3) return false;
    if (isLikelyDateOrTime(t)) return false;
    if (isMostlyNumeric(t)) return false;
    if (isLikelyIdentifier(t)) return false;
    if (/^[\p{P}\p{S}\s]+$/u.test(t)) return false;
    return true;
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
