const API_URL = "https://api.languagetool.org/v2/check";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["enabled", "language", "checkDelay"], (existing) => {
    chrome.storage.sync.set({
      enabled: existing.enabled !== undefined ? existing.enabled : true,
      language: existing.language || "es",
      checkDelay: existing.checkDelay || 1500
    });
  });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "perfectgramm-check",
      title: "Revisar con Perfect Gramm",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "perfectgramm-check" && info.selectionText && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "checkSelection",
      text: info.selectionText
    }).catch(function() {});
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "checkText") {
    checkText(request.text, request.language)
      .then(function(result) { sendResponse(result); })
      .catch(function() { sendResponse({ matches: [] }); });
    return true;
  }
  return false;
});

async function checkText(text, language) {
  if (!text || text.trim().length < 3) {
    return { matches: [] };
  }

  if (!language) {
    language = "es";
  }

  var params = new URLSearchParams();
  params.set("text", text);
  params.set("language", language);
  params.set("enabledOnly", "false");

  var response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
  } catch (e) {
    return { matches: [] };
  }

  if (!response.ok) {
    return { matches: [] };
  }

  try {
    return await response.json();
  } catch (e) {
    return { matches: [] };
  }
}
