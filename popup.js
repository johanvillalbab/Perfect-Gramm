document.addEventListener("DOMContentLoaded", () => {
  const enableToggle = document.getElementById("enableToggle");
  const languageSelect = document.getElementById("language");
  const testArea = document.getElementById("testArea");
  const checkBtn = document.getElementById("checkBtn");
  const results = document.getElementById("results");

  chrome.storage.sync.get(["enabled", "language"], (data) => {
    enableToggle.checked = data.enabled !== false;
    languageSelect.value = data.language || "es";
  });

  enableToggle.addEventListener("change", () => {
    const enabled = enableToggle.checked;
    chrome.storage.sync.set({ enabled });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleEnabled",
          enabled
        }).catch(() => {});
      }
    });
  });

  languageSelect.addEventListener("change", () => {
    chrome.storage.sync.set({ language: languageSelect.value });
  });

  checkBtn.addEventListener("click", async () => {
    const text = testArea.value.trim();
    if (!text) return;

    checkBtn.disabled = true;
    checkBtn.textContent = "$ revisando...";
    results.style.display = "none";

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "checkText", text, language: languageSelect.value },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          }
        );
      });

      if (response.error) {
        results.innerHTML = `<div class="result-item"><span class="result-message" style="color:#ff5f57;">stderr: ${response.error}</span></div>`;
        results.style.display = "block";
        return;
      }

      const matches = response.matches || [];

      if (matches.length === 0) {
        results.innerHTML = `<div class="result-success">exit 0 — sin errores encontrados</div>`;
      } else {
        results.innerHTML = matches
          .map((m, i) => {
            const catType = getCatType(m);
            const errorText = text.substring(m.offset, m.offset + m.length);
            const suggestion = m.replacements.length > 0 ? m.replacements[0].value : "";
            return `
              <div class="result-item">
                <div class="result-category ${catType}">[${getCatLabel(catType)}] ln:${m.offset}</div>
                <div class="result-message">${escapeHtml(m.message)}</div>
                <div class="result-context">
                  <span class="error-text">${escapeHtml(errorText)}</span>
                  ${suggestion ? ` → <span class="suggestion">${escapeHtml(suggestion)}</span>` : ""}
                </div>
              </div>
            `;
          })
          .join("");
      }

      results.style.display = "block";
    } catch (err) {
      results.innerHTML = `<div class="result-item"><span class="result-message" style="color:#ff5f57;">stderr: ${err.message}</span></div>`;
      results.style.display = "block";
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = "$ ejecutar revisión";
    }
  });

  function getCatType(match) {
    const catId = (match.rule?.category?.id || "").toUpperCase();
    if (catId.includes("TYPO") || catId.includes("SPELL")) return "spelling";
    if (catId.includes("STYLE") || catId.includes("REDUNDANCY")) return "style";
    return "grammar";
  }

  function getCatLabel(type) {
    return { spelling: "ORTOGRAFÍA", grammar: "GRAMÁTICA", style: "ESTILO" }[type] || "ERROR";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }
});
