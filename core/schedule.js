// 課表、複習間隔與每日菜單（規格 FR-MENU-02、FR-MENU-03、FR-MENU-04）。
import { addDays, dayDiff } from "./dates.js";

export const posMod = (a, n) => ((a % n) + n) % n;

/** 該日對應的預排組別索引；起算日前的日期也能正確映射。 */
export function groupIndex(date, startDate, groupCount) {
  return posMod(dayDiff(date, startDate), groupCount);
}

/** 從某日的預排組開始，把整個詞池循環排列。 */
export function cyclicPool(groups, startGroup) {
  const out = [];
  for (let i = 0; i < groups.length; i++) out.push(...groups[(startGroup + i) % groups.length]);
  return out;
}

const INTERVALS = [1, 3, 7, 14];

/**
 * dayMap: { "YYYY-MM-DD": 當日最低評分 }。只採計 beforeDate 之前的作答。
 * 回傳下次複習日；沒有歷史時回傳 null。
 */
export function nextReviewDate(dayMap, beforeDate) {
  const days = Object.keys(dayMap || {}).filter((d) => d < beforeDate).sort();
  if (!days.length) return null;
  let streak = 0;
  for (const d of days) streak = dayMap[d] >= 2 ? streak + 1 : 0;
  return addDays(days[days.length - 1], INTERVALS[Math.min(streak, 3)]);
}

/** 詞義理解與造句運用分開計算，取較早者。 */
export function wordDueDate(wordHistory, beforeDate) {
  if (!wordHistory) return null;
  const dates = [nextReviewDate(wordHistory.meaning, beforeDate), nextReviewDate(wordHistory.usage, beforeDate)].filter(Boolean);
  return dates.length ? dates.sort()[0] : null;
}

/** 同日多次評分取最低值。回傳應寫入的評分。 */
export function mergeRating(dayMap, date, rating) {
  const prev = dayMap?.[date];
  return prev === undefined || prev === null ? rating : Math.min(prev, rating);
}

export const MIN_EGGS = 4;

/**
 * 沒有快照時排出當日十詞：到期詞先佔名額（越早到期越優先），剩下的名額依循環詞序補新字。排出來的順序是新字在前、複習在後。
 * hatched: { 詞: 孵化日 }。有給的話，已孵化的字最多佔 size - minEggs 個名額，確保當天至少有 minEggs 顆蛋；沒孵化的字不夠時才用已孵化的補滿。
 */
export function buildMenu({ date, groups, startDate, history, hatched = null, size = 10, minEggs = MIN_EGGS }) {
  const pool = cyclicPool(groups, groupIndex(date, startDate, groups.length));
  const rank = new Map(pool.map((w, i) => [w, i]));
  const due = [];
  for (const w of pool) {
    const d = wordDueDate(history?.[w], date);
    if (d && d <= date) due.push([d, rank.get(w), w]);
  }
  due.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  const isHatched = (w) => Boolean(hatched?.[w]);
  const maxHatched = hatched ? Math.max(size - minEggs, 0) : size;
  const picked = new Set();
  let nHatched = 0;
  const take = (w, list) => {
    if (picked.size >= size || picked.has(w)) return;
    if (isHatched(w)) { if (nHatched >= maxHatched) return; nHatched++; }
    picked.add(w); list.push(w);
  };
  const review = [], fresh = [];
  for (const [, , w] of due) take(w, review);
  for (const w of pool) take(w, fresh);
  for (const w of pool) { // 蛋不夠四顆時，用已孵化的字補滿十個
    if (picked.size >= size) break;
    if (!picked.has(w)) { picked.add(w); fresh.push(w); }
  }
  return [...fresh, ...review];
}

/** 換字候選：依當日循環詞序，取第一個不在菜單、也沒被換掉過的詞。only 是硬條件、prefer 是偏好，都找不到符合的才逐步放寬。沒有則回傳 null。 */
export function swapCandidate({ date, groups, startDate, menu, excluded = [], prefer = null, only = null }) {
  const pool = cyclicPool(groups, groupIndex(date, startDate, groups.length));
  const ok = (w) => !menu.includes(w) && !excluded.includes(w);
  const tries = [only && prefer ? (w) => only(w) && prefer(w) : null, only, prefer, () => true].filter(Boolean);
  for (const t of tries) { const hit = pool.find((w) => ok(w) && t(w)); if (hit) return hit; }
  return null;
}

/** 由淺入深的課表：整個詞池依難度穩定排序後重新切組，同難度內維持原本的順序。沒有難度的字當作中間級。 */
export function groupsByBand(groups, bandOf, size = 10) {
  const flat = groups.flat().map((w, i) => [bandOf(w) ?? 7, i, w]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  const out = [];
  for (let i = 0; i < flat.length; i += size) out.push(flat.slice(i, i + size));
  return out;
}

export function isValidMenu(wordIds, known, size = 10) {
  return Array.isArray(wordIds) && wordIds.length === size && new Set(wordIds).size === size && wordIds.every((w) => known.has(w));
}
