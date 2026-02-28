(() => {
  "use strict";

  let settings = { enabled: true, language: "es", checkDelay: 1500 };
  let activeTooltip = null;
  let activeBadge = null;
  let checkTimers = new WeakMap();
  let fieldMatches = new WeakMap();
  let ignoredRules = new Set();

  function isAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  function safeSend(msg, cb) {
    if (!isAlive()) return;
    try {
      chrome.runtime.sendMessage(msg, function(r) {
        try {
          if (!isAlive() || chrome.runtime.lastError) { if (cb) cb(null); return; }
          if (cb) cb(r);
        } catch (e) { /* swallow */ }
      });
    } catch (e) { /* swallow */ }
  }

  function safe(fn) {
    return function() {
      try { return fn.apply(this, arguments); }
      catch (e) { /* swallow */ }
    };
  }

  if (isAlive()) {
    try {
      chrome.storage.sync.get(["enabled", "language", "checkDelay"], safe((result) => {
        if (!isAlive()) return;
        Object.assign(settings, result);
        if (settings.enabled) init();
      }));

      chrome.storage.onChanged.addListener(safe((changes) => {
        if (!isAlive()) return;
        for (const [key, { newValue }] of Object.entries(changes)) {
          settings[key] = newValue;
        }
        if (!settings.enabled) cleanup();
        else init();
      }));

      chrome.runtime.onMessage.addListener(safe((msg) => {
        if (!isAlive()) return;
        if (msg.action === "toggleEnabled") {
          settings.enabled = msg.enabled;
          if (!settings.enabled) cleanup();
          else init();
        }
        if (msg.action === "checkSelection") {
          const el = document.activeElement;
          if (isEditable(el)) requestCheck(el);
        }
      }));
    } catch (e) { /* swallow */ }
  }

  function init() {
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("scroll", onScroll, true);
  }

  function cleanup() {
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("scroll", onScroll, true);
    dismissTooltip();
    removeBadge();
  }

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var type = (el.type || "").toLowerCase();
      return ["text", "search", "email", "url", ""].indexOf(type) !== -1;
    }
    return el.isContentEditable === true;
  }

  var onFocusIn = safe(function(e) {
    if (!settings.enabled) return;
    var el = e.target;
    if (!isEditable(el)) return;
    requestCheck(el);
  });

  var onFocusOut = safe(function(e) {
    var el = e.target;
    if (checkTimers.has(el)) {
      clearTimeout(checkTimers.get(el));
      checkTimers.delete(el);
    }
    setTimeout(safe(function() {
      if (document.activeElement !== el) removeBadge();
    }), 200);
  });

  var onInput = safe(function(e) {
    if (!settings.enabled) return;
    var el = e.target;
    if (!isEditable(el)) return;
    if (checkTimers.has(el)) clearTimeout(checkTimers.get(el));
    var timer = setTimeout(function() {
      try { requestCheck(el); } catch (e) { /* swallow */ }
    }, settings.checkDelay);
    checkTimers.set(el, timer);
  });

  var onDocClick = safe(function(e) {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      dismissTooltip();
    }
  });

  var onScroll = safe(function() {
    dismissTooltip();
  });

  function getText(el) {
    if (el.isContentEditable) return el.innerText || "";
    return el.value || "";
  }

  function setText(el, offset, length, replacement) {
    if (el.isContentEditable) {
      var text = el.innerText || "";
      el.innerText = text.substring(0, offset) + replacement + text.substring(offset + length);
    } else {
      var text = el.value || "";
      el.value = text.substring(0, offset) + replacement + text.substring(offset + length);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function requestCheck(el) {
    if (!isAlive()) return;
    var text = getText(el);
    if (text.trim().length < 3) {
      fieldMatches.delete(el);
      updateBadge(el, []);
      return;
    }
    showBadgeLoading(el);
    safeSend(
      { action: "checkText", text: text, language: settings.language },
      function(response) {
        if (!response) { removeBadge(); return; }
        var matches = (response.matches || []).filter(
          function(m) { return !ignoredRules.has(m.rule && m.rule.id); }
        );
        fieldMatches.set(el, { matches: matches, text: text });
        updateBadge(el, matches);
      }
    );
  }

  function getFieldRect(el) {
    return el.getBoundingClientRect();
  }

  function showBadgeLoading(el) {
    removeBadge();
    var rect = getFieldRect(el);
    if (rect.width === 0 && rect.height === 0) return;
    var badge = document.createElement("div");
    badge.className = "pg-badge pg-checking";
    badge.style.top = (rect.top + 6) + "px";
    badge.style.left = (rect.right - 18) + "px";
    document.documentElement.appendChild(badge);
    activeBadge = badge;
  }

  function updateBadge(el, matches) {
    removeBadge();
    var rect = getFieldRect(el);
    if (rect.width === 0 && rect.height === 0) return;
    var count = matches.length;
    var badge = document.createElement("div");
    badge.className = "pg-badge" + (count > 0 ? " pg-has-errors" : "");
    badge.title = count > 0 ? count + " error" + (count > 1 ? "es" : "") : "Sin errores";
    badge.style.top = (rect.top + 6) + "px";
    badge.style.left = (rect.right - 18) + "px";
    badge.addEventListener("click", safe(function(e) {
      e.stopPropagation();
      e.preventDefault();
      if (count > 0) showMatchList(el, matches, rect);
    }));
    document.documentElement.appendChild(badge);
    activeBadge = badge;
  }

  function removeBadge() {
    if (activeBadge) { activeBadge.remove(); activeBadge = null; }
  }

  function showMatchList(el, matches, fieldRect) {
    dismissTooltip();
    if (matches.length === 0) return;
    showTooltipForMatch(el, matches, 0, fieldRect);
  }

  function showTooltipForMatch(el, matches, index, fieldRect) {
    dismissTooltip();
    var match = matches[index];
    if (!match) return;

    var catType = getCategoryType(match);
    var catLabel = getCategoryLabel(match);
    var errorText = getText(el).substring(match.offset, match.offset + match.length);

    var tooltip = document.createElement("div");
    tooltip.className = "pg-tooltip";
    tooltip.innerHTML =
      '<div class="pg-tooltip-header">' +
        '<span class="pg-tooltip-category ' + (catType === "style" ? "pg-cat-style" : catType === "grammar" ? "pg-cat-grammar" : "") + '">[' + catLabel + ']</span>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="font-size:10px;color:#444;font-family:inherit;">' + (index + 1) + '/' + matches.length + '</span>' +
          '<button class="pg-tooltip-close" data-action="close">x</button>' +
        '</div>' +
      '</div>' +
      '<div class="pg-tooltip-body">' +
        '<p class="pg-tooltip-message">' + escapeHtml(match.message) + '</p>' +
        '<span class="pg-tooltip-original">' + escapeHtml(errorText) + '</span>' +
        '<div class="pg-tooltip-suggestions">' +
          match.replacements.slice(0, 5).map(function(r) {
            return '<button class="pg-suggestion-btn" data-replacement="' + escapeAttr(r.value) + '" data-offset="' + match.offset + '" data-length="' + match.length + '">' + escapeHtml(r.value) + '</button>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="pg-tooltip-footer">' +
        '<span class="pg-tooltip-rule">' + escapeHtml(match.rule && match.rule.id || "") + '</span>' +
        '<div style="display:flex;gap:4px;">' +
          (index > 0 ? '<button class="pg-ignore-btn" data-action="prev">&lt; prev</button>' : '') +
          (index < matches.length - 1 ? '<button class="pg-ignore-btn" data-action="next">next &gt;</button>' : '') +
          '<button class="pg-ignore-btn" data-action="ignore" data-rule="' + escapeAttr(match.rule && match.rule.id || "") + '">skip</button>' +
        '</div>' +
      '</div>';

    var top = fieldRect.bottom + 8;
    var left = fieldRect.left;
    if (top + 250 > window.innerHeight) top = fieldRect.top - 260;
    if (left + 380 > window.innerWidth) left = window.innerWidth - 390;
    if (left < 5) left = 5;
    tooltip.style.top = Math.max(5, top) + "px";
    tooltip.style.left = left + "px";

    tooltip.addEventListener("click", safe(function(e) {
      e.stopPropagation();
      var btn = e.target.closest("button");
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === "close") { dismissTooltip(); return; }
      if (action === "next") { showTooltipForMatch(el, matches, index + 1, fieldRect); return; }
      if (action === "prev") { showTooltipForMatch(el, matches, index - 1, fieldRect); return; }

      if (action === "ignore") {
        var ruleId = btn.dataset.rule;
        if (ruleId) ignoredRules.add(ruleId);
        var filtered = matches.filter(function(m) { return (m.rule && m.rule.id) !== ruleId; });
        fieldMatches.set(el, { matches: filtered, text: getText(el) });
        updateBadge(el, filtered);
        if (filtered.length > 0) showTooltipForMatch(el, filtered, Math.min(index, filtered.length - 1), fieldRect);
        else dismissTooltip();
        return;
      }

      if (btn.dataset.replacement !== undefined) {
        var offset = parseInt(btn.dataset.offset, 10);
        var length = parseInt(btn.dataset.length, 10);
        var replacement = btn.dataset.replacement;
        setText(el, offset, length, replacement);
        var diff = replacement.length - length;
        var updated = matches.filter(function(_, i) { return i !== index; }).map(function(m) {
          if (m.offset > offset) return Object.assign({}, m, { offset: m.offset + diff });
          return m;
        });
        fieldMatches.set(el, { matches: updated, text: getText(el) });
        updateBadge(el, updated);
        if (updated.length > 0) showTooltipForMatch(el, updated, Math.min(index, updated.length - 1), fieldRect);
        else dismissTooltip();
      }
    }));

    document.documentElement.appendChild(tooltip);
    activeTooltip = tooltip;
  }

  function dismissTooltip() {
    if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
  }

  function getCategoryType(match) {
    var catId = (match.rule && match.rule.category && match.rule.category.id || "").toUpperCase();
    if (catId.indexOf("TYPO") !== -1 || catId.indexOf("SPELL") !== -1) return "spelling";
    if (catId.indexOf("STYLE") !== -1 || catId.indexOf("REDUNDANCY") !== -1 || catId.indexOf("WORDINESS") !== -1) return "style";
    return "grammar";
  }

  function getCategoryLabel(match) {
    var type = getCategoryType(match);
    return { spelling: "ORTOGRAFÍA", grammar: "GRAMÁTICA", style: "ESTILO" }[type] || "ERROR";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
})();
