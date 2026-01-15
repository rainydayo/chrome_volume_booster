const slider = document.getElementById("slider");
const pct = document.getElementById("pct");
const toggleBtn = document.getElementById("toggle");

function setPctLabel(v) {
  pct.textContent = `${v}%`;
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function loadState(tabId) {
  const key = `tab:${tabId}`;
  const data = await chrome.storage.session.get(key);
  return data[key] || { enabled: false, boost: 100 };
}

async function saveState(tabId, state) {
  const key = `tab:${tabId}`;
  await chrome.storage.session.set({ [key]: state });
}

function updateToggleUI(enabled) {
  toggleBtn.textContent = enabled ? "Disable on this tab" : "Enable on this tab";
}

(async () => {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  const state = await loadState(tabId);
  slider.value = String(state.boost ?? 100);
  setPctLabel(Number(slider.value));
  updateToggleUI(!!state.enabled);

  slider.addEventListener("input", async () => {
    const v = Number(slider.value);
    setPctLabel(v);

    const next = { ...(await loadState(tabId)), boost: v };
    await saveState(tabId, next);

    // ส่งค่าไปยัง service worker -> offscreen
    chrome.runtime.sendMessage({ type: "SET_BOOST", tabId, boost: v });
  });

  toggleBtn.addEventListener("click", async () => {
    const current = await loadState(tabId);
    const enabled = !current.enabled;
    const next = { ...current, enabled };
    await saveState(tabId, next);
    updateToggleUI(enabled);

    chrome.runtime.sendMessage({ type: enabled ? "START" : "STOP", tabId });
  });
})();
