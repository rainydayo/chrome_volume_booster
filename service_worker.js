// service_worker.js (Manifest V3, type: module)

const OFFSCREEN_URL = "offscreen.html";

// Prevent race conditions when multiple messages try to create offscreen at once.
let creatingOffscreen = null;

async function hasOffscreenDocument() {
  // Preferred: reliably detect existing offscreen document (newer Chrome).
  if (chrome.runtime?.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    return contexts.length > 0;
  }

  // Fallback (may not exist on some versions/environments).
  if (chrome.offscreen?.hasDocument) {
    return await chrome.offscreen.hasDocument();
  }

  return false;
}

async function ensureOffscreen() {
  if (await hasOffscreenDocument()) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Capture tab audio and apply gain for volume boosting.",
      });
    } catch (e) {
      // If it already exists, ignore. Otherwise rethrow.
      const msg = String(e?.message || e);
      if (!msg.includes("Only a single offscreen document may be created")) {
        throw e;
      }
    } finally {
      creatingOffscreen = null;
    }
  })();

  await creatingOffscreen;
}

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  (async () => {
    if (!msg || !msg.type) return;

    if (msg.type === "START") {
      await ensureOffscreen();

      // Get a streamId for capturing the target tab's audio
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: msg.tabId,
      });

      // Tell offscreen to start processing/playing the captured audio
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_START",
        tabId: msg.tabId,
        streamId,
      });
      return;
    }

    if (msg.type === "STOP") {
      await ensureOffscreen();
      chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP", tabId: msg.tabId });
      return;
    }

    if (msg.type === "SET_BOOST") {
      await ensureOffscreen();
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_SET_BOOST",
        tabId: msg.tabId,
        boost: msg.boost,
      });
      return;
    }
  })().catch((err) => {
    // Keep service worker alive and avoid unhandled promise rejections
    console.error("Service worker error:", err);
  });

  // No synchronous response
  return false;
});
