// 介面語言：中文（預設）或英文。只在載入時讀一次；切換語言會重新載入頁面。
// 學習內容（中文詞義、例句翻譯、使用提示、造句情境）不翻譯。
const KEY = "lexi:lang";

function readLang() {
  try {
    if (typeof localStorage === "undefined") return "zh";
    return localStorage.getItem(KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export const LANG = readLang();
export const L = (zh, en) => (LANG === "en" ? en : zh);

export function setLang(lang) {
  try {
    localStorage.setItem(KEY, lang === "en" ? "en" : "zh");
  } catch {
    /* 存不了就維持原本的語言 */
  }
}
