// 字中找字規則（規格 FR-GAME-01）。
import { L } from "./i18n.js";

export function isSubsequence(sub, target) {
  let i = 0;
  for (const ch of target) if (ch === sub[i]) i++;
  return i === sub.length;
}

export const GAME_REASONS = {
  short: L("小字至少要三個字母。", "A hidden word needs at least three letters."),
  whole: L("不能直接用整個題目字。", "You can't use the whole word."),
  notsub: L("字母要由左往右取，每格只能用一次，不能調換順序。", "Take letters from left to right. Use each letter once and keep the order."),
  notlisted: L("這個字不在這一關的答案裡，換一個試試。", "That word isn't on the answer list for this word. Try another one."),
  dup: L("這個小字已經找過了。", "You've already found that one."),
};

export function checkSubword(target, raw, answers, found) {
  const word = String(raw || "").trim().toLowerCase();
  if (word.length < 3) return { ok: false, word, reason: "short" };
  if (word === target) return { ok: false, word, reason: "whole" };
  if (!isSubsequence(word, target)) return { ok: false, word, reason: "notsub" };
  if (found.includes(word)) return { ok: false, word, reason: "dup" };
  if (!answers.includes(word)) return { ok: false, word, reason: "notlisted" };
  return { ok: true, word };
}

export function hintFor(answers, found) {
  const left = answers.filter((a) => !found.includes(a));
  if (!left.length) return null;
  const a = left[0];
  return { length: a.length, first: a[0], last: a[a.length - 1] };
}

export function longest(found) {
  return found.reduce((best, w) => (w.length > best.length ? w : best), "");
}

export function checkRecall(target, raw) {
  return String(raw || "").trim().toLowerCase() === target;
}
