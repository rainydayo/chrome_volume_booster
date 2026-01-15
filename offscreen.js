/**
 * ต่อแท็บหนึ่งตัว -> หนึ่งชุด pipeline
 * tabId -> { audioCtx, source, gain, dest, audioEl, stream }
 */
const pipelines = new Map();

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function boostToGain(boostPercent) {
  // 100% = 1.0, 600% = 6.0
  const b = clamp(Number(boostPercent), 0, 600);
  return b / 100;
}

async function startPipeline(tabId, streamId) {
  // ถ้ามีอยู่แล้ว ให้หยุดก่อนเพื่อกันซ้อนเสียง
  await stopPipeline(tabId);

  // สร้าง MediaStream จาก streamId ของ tabCapture
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();

  const source = audioCtx.createMediaStreamSource(stream);
  const gain = audioCtx.createGain();
  gain.gain.value = 1.0;

  // Route ไปยัง destination ของ AudioContext แล้วใช้ <audio> เล่นออกลำโพง
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(dest);

  const audioEl = new Audio();
  audioEl.srcObject = dest.stream;
  audioEl.autoplay = true;
  audioEl.muted = false;
  audioEl.playsInline = true;

  // จำเป็นในบางเคสให้ resume context
  await audioCtx.resume();

  pipelines.set(tabId, { audioCtx, source, gain, dest, audioEl, stream });
}

async function stopPipeline(tabId) {
  const p = pipelines.get(tabId);
  if (!p) return;

  try {
    p.audioEl.pause();
    p.audioEl.srcObject = null;
  } catch {}

  try {
    p.stream.getTracks().forEach((t) => t.stop());
  } catch {}

  try {
    await p.audioCtx.close();
  } catch {}

  pipelines.delete(tabId);
}

function setBoost(tabId, boostPercent) {
  const p = pipelines.get(tabId);
  if (!p) return;

  const g = boostToGain(boostPercent);
  // setTargetAtTime ทำให้ปรับนุ่ม ไม่กระตุก
  const now = p.audioCtx.currentTime;
  p.gain.gain.setTargetAtTime(g, now, 0.01);
}

chrome.runtime.onMessage.addListener((msg) => {
  (async () => {
    if (msg?.type === "OFFSCREEN_START") {
      await startPipeline(msg.tabId, msg.streamId);
    }
    if (msg?.type === "OFFSCREEN_STOP") {
      await stopPipeline(msg.tabId);
    }
    if (msg?.type === "OFFSCREEN_SET_BOOST") {
      setBoost(msg.tabId, msg.boost);
    }
  })();

  return false;
});
