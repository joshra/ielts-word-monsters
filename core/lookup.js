// 生字查詢：把例句切成可點的字、對照詞庫找原形。

// 只把字母（含常見拉丁字母）、字中的撇號與連字號當成字；其他字元原樣保留。
const WORD_RE = /[A-Za-zÀ-ɏ]+(?:['’-][A-Za-zÀ-ɏ]+)*/g;

/** 切成 [{ t, w }]：w=true 是字，false 是空白或標點。所有 t 接起來等於原文。 */
export function tokenize(text) {
  const s = String(text ?? "");
  const out = [];
  let last = 0;
  for (const m of s.matchAll(WORD_RE)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), w: false });
    out.push({ t: m[0], w: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), w: false });
  return out;
}

/** 比對用的寫法：小寫，彎撇號換成直撇號。 */
export const normWord = (w) => String(w ?? "").toLowerCase().replace(/’/g, "'");

/** 詞庫索引：單字本身與所有變化形 → 原本的詞條。詞條本身優先於別的字的變化形。 */
export function buildLexIndex(words, details) {
  const idx = new Map();
  for (const w of Object.keys(words || {})) idx.set(normWord(w), w);
  for (const [w, d] of Object.entries(details || {})) {
    if (!words?.[w]) continue;
    for (const f of Object.values(d?.forms || {})) {
      const k = normWord(f);
      if (f && !idx.has(k)) idx.set(k, w);
    }
  }
  return idx;
}

/** 這個字（或去掉所有格 's 之後）是詞庫裡的哪個詞條；不在詞庫回傳 null。 */
export function resolveLex(idx, word) {
  const n = normWord(word);
  if (idx.has(n)) return idx.get(n);
  if (n.endsWith("'s") && idx.has(n.slice(0, -2))) return idx.get(n.slice(0, -2));
  return null;
}

/** 句子太長時，只保留生字前後的一段（最多 max 個字元）。 */
export function clipSentence(sentence, word, max = 300) {
  const s = String(sentence ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const at = Math.max(0, s.toLowerCase().indexOf(normWord(word)));
  const room = max - 2;
  let start = Math.max(0, at - Math.floor((room - String(word).length) / 2));
  start = Math.min(start, s.length - room);
  return (start > 0 ? "…" : "") + s.slice(start, start + room).trim() + (start + room < s.length ? "…" : "");
}

export const MAX_SENTENCE = 300;
