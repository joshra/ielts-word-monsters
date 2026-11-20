// 連續天數與徽章的規則（MONSTER-PLAN.md 第四節）。純函式，不碰畫面與儲存。
import { L } from "./i18n.js";
import { addDays } from "./dates.js";

/** 徽章清單：條件都能從現有資料判斷。 */
export const BADGES = [
  { id: "first", name: L("第一隻", "First hatch"), desc: L("孵化第一隻怪獸", "Hatch your first monster") },
  { id: "ten", name: L("滿員", "Full house"), desc: L("同一天的十個字全部孵化", "Hatch all ten words of one day") },
  { id: "final", name: L("完全體", "Final form"), desc: L("養出第一隻完全體", "Raise a monster to its final form") },
  { id: "streak7", name: L("一週不斷", "Week streak"), desc: L("連續練習 7 天", "Practise 7 days in a row") },
  { id: "streak30", name: L("一月不斷", "Month streak"), desc: L("連續練習 30 天", "Practise 30 days in a row") },
  { id: "topic30", name: L("收藏家", "Collector"), desc: L("同一屬性孵化 30 隻", "Hatch 30 monsters of one topic") },
  { id: "subword7", name: L("找字高手", "Word finder"), desc: L("字中找字找到 7 個字母以上的小字", "Find a hidden word of 7 or more letters") },
];
export const BADGE_IDS = BADGES.map((b) => b.id);

/**
 * 今天練過（至少一個字八項完成）時更新連續天數。
 * streak: { count, last, best }；同一天重複呼叫不會重複加。
 */
export function advanceStreak(streak, today) {
  const s = { count: streak?.count || 0, last: streak?.last || null, best: streak?.best || 0 };
  if (s.last === today) return s;
  s.count = s.last === addDays(today, -1) ? s.count + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best, s.count);
  return s;
}

/** 目前有效的連續天數：昨天或今天練過才算，否則歸零（紀錄裡的 count 不動）。 */
export function streakNow(streak, today) {
  if (!streak?.last) return 0;
  return streak.last === today || streak.last === addDays(today, -1) ? streak.count : 0;
}

/**
 * 每個徽章的進度 { now, goal }，給收藏頁顯示；goal 為 1 的是一次達成型。
 * stats 同 newBadges，另可帶 dayHatched（這一天已孵化幾隻）。
 */
export function badgeProgress(stats) {
  const cap = (n, goal) => ({ now: Math.min(Math.max(0, n || 0), goal), goal });
  return {
    first: cap(stats.hatched, 1),
    ten: cap(stats.dayFull ? 10 : stats.dayHatched, 10),
    final: cap(stats.hasFinal ? 1 : 0, 1),
    streak7: cap(stats.streak, 7),
    streak30: cap(stats.streak, 30),
    topic30: cap(stats.topicMax, 30),
    subword7: cap(stats.longestSubword, 7),
  };
}

/**
 * 依目前狀況找出新達成、尚未擁有的徽章。
 * stats: { hatched, dayFull, hasFinal, streak, topicMax, longestSubword }
 */
export function newBadges(stats, earned = {}) {
  const hit = {
    first: stats.hatched >= 1,
    ten: Boolean(stats.dayFull),
    final: Boolean(stats.hasFinal),
    streak7: stats.streak >= 7,
    streak30: stats.streak >= 30,
    topic30: stats.topicMax >= 30,
    subword7: stats.longestSubword >= 7,
  };
  return BADGE_IDS.filter((id) => hit[id] && !earned[id]);
}
