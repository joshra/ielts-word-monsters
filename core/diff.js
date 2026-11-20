// 聽寫逐字比對：以參考句為準，標出哪些字有寫對（最長共同子序列）。
export const tokenize = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+(?:['’][a-z]+)?/g) || []).map((w) => w.replace("’", "'"));

export function diffWords(reference, answer) {
  const ref = String(reference || "").match(/\S+/g) || [];
  const a = ref.map((w) => tokenize(w).join(""));
  const b = tokenize(answer);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n) {
    if (j < m && a[i] === b[j]) { out.push({ word: ref[i], ok: true }); i++; j++; }
    else if (j < m && L[i][j + 1] >= L[i + 1][j]) j++;
    else { out.push({ word: ref[i], ok: false }); i++; }
  }
  const correct = out.filter((x) => x.ok).length;
  return { words: out, correct, total: n, extra: Math.max(0, m - correct) };
}
