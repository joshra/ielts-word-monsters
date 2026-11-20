// 英文朗讀：用瀏覽器內建語音；沒有就如實回報。
import { L } from "./core/i18n.js";

const RATE = 0.85;

export async function createSpeech() {
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  let blocked = false; // 使用者關閉了這個頁面的朗讀
  let voice = null;

  const pickVoice = () => {
    if (!synth) return null;
    const vs = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
    return vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0] || null;
  };
  if (synth) {
    voice = pickVoice();
    synth.addEventListener?.("voiceschanged", () => (voice = pickVoice()));
  }

  return {
    get kind() {
      if (blocked) return "none";
      return synth ? "browser" : "none";
    },

    /** 播放完成回傳 { ok: true }；失敗回傳 { ok: false, message }。 */
    async speak(text) {
      if (blocked) return { ok: false, message: L("你已關閉這個頁面的朗讀。", "You turned off read-aloud for this page.") };
      if (!synth) return { ok: false, message: L("這個瀏覽器不支援朗讀。", "This browser can't read text aloud.") };
      voice = voice || pickVoice();
      if (!voice) return { ok: false, message: L("這台裝置沒有可用的英文語音。", "This device has no English voice available.") };
      return new Promise((resolve) => {
        try {
          synth.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.voice = voice;
          u.lang = voice.lang;
          u.rate = RATE;
          u.onend = () => resolve({ ok: true });
          u.onerror = (ev) => resolve({ ok: false, message: ev.error === "interrupted" || ev.error === "canceled" ? "" : L("語音播放失敗。", "Couldn't play the audio.") });
          synth.speak(u);
        } catch {
          resolve({ ok: false, message: L("語音播放失敗。", "Couldn't play the audio.") });
        }
      });
    },

    stop() {
      try {
        synth?.cancel();
      } catch {
        /* 沒有進行中的朗讀 */
      }
    },
  };
}
