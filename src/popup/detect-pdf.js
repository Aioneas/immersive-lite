chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    if (tabs && tabs[0] && tabs[0].url.toLowerCase().endsWith(".pdf")) {
        window.location.href = "popup-translate-document.html"
    }
})

chrome.runtime.sendMessage({action: "getTabMimeType"}, mimeType => {
    if (mimeType && mimeType.toLowerCase() === "application/pdf") {
        window.location.href = "popup-translate-document.html"
    }
})
