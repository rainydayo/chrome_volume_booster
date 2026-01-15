const OFFSCREEN_URL = "offscreen.html";

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Capture tab audio and apply gain for volume boosting."
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  (async () => {
    if (msg?.type === "START") {
      await ensureOffscreen();

      // ขอ streamId สำหรับจับเสียงแท็บนี้
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: msg.tabId
      });

      // ส่งไปให้ offscreen เริ่มจับ/เล่น
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_START",
        tabId: msg.tabId,
        streamId
      });
    }

    if (msg?.type === "STOP") {
      await ensureOffscreen();
      chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP", tabId: msg.tabId });
    }

    if (msg?.type === "SET_BOOST") {
      await ensureOffscreen();
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_SET_BOOST",
        tabId: msg.tabId,
        boost: msg.boost
      });
    }
  })();

  // async response not used
  return false;
});
