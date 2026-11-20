/** 今日串寫：粗略計算用到了哪些今日單字（含變化形）。 */
export function usedWords(text, words) {
  const t = " " + String(text).toLowerCase().replace(/[^a-z']+/g, " ") + " ";
  return words.filter((w) => [w.word, ...Object.values(w.forms || {})].some((f) => f && t.includes(" " + String(f).toLowerCase() + " "))).map((w) => w.word);
}
