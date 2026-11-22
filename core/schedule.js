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

/** 沒有快照時排出當日十詞：到期詞在前（越早到期越優先），其餘依循環詞序補足。 */
export function buildMenu({ date, groups, startDate, history, size = 10 }) {
  const pool = cyclicPool(groups, groupIndex(date, startDate, groups.length));
  const rank = new Map(pool.map((w, i) => [w, i]));
  const due = [];
  for (const w of pool) {
    const d = wordDueDate(history?.[w], date);
    if (d && d <= date) due.push([d, rank.get(w), w]);
  }
  due.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  const menu = [];
  for (const [, , w] of due) if (menu.length < size && !menu.includes(w)) menu.push(w);
  for (const w of pool) {
    if (menu.length >= size) break;
    if (!menu.includes(w)) menu.push(w);
  }
  return menu;
}

/** 換字候選：依當日循環詞序，取第一個不在菜單、也沒被換掉過的詞。有 prefer 時先找符合的，找不到才退回一般順序。沒有則回傳 null。 */
export function swapCandidate({ date, groups, startDate, menu, excluded = [], prefer = null }) {
  const pool = cyclicPool(groups, groupIndex(date, startDate, groups.length));
  const ok = (w) => !menu.includes(w) && !excluded.includes(w);
  return (prefer ? pool.find((w) => ok(w) && prefer(w)) : null) ?? pool.find(ok) ?? null;
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
