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
