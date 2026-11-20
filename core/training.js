// 八項練習的進度規則（規格第 6、7 節）。
import { L } from "./i18n.js";

export const STEPS = [
  { id: "game", label: L("字中找字", "Word hunt") },
  { id: "example", label: L("例句閱讀", "Example") },
  { id: "listen", label: L("聽寫", "Dictation") },
  { id: "chinese", label: L("英翻中", "To Chinese") },
  { id: "english", label: L("中翻英", "To English") },
  { id: "speak", label: L("跟讀口說", "Speak") },
  { id: "family", label: L("詞性與關聯", "Word family") },
  { id: "write", label: L("自主造句", "Your sentence") },
];
export const STEP_IDS = STEPS.map((s) => s.id);
export const TEXT_STEPS = ["listen", "chinese", "english", "write"];
export const RATINGS = [L("需要重練", "Needs more practice"), L("還不熟悉", "Not confident yet"), L("能獨立完成", "Can do it alone")];
export const MAX_TEXT = 1800;

export const doneCount = (t) => STEP_IDS.filter((s) => t?.done?.[s]).length;
export const isWordComplete = (t) => doneCount(t) === STEP_IDS.length;

/** 從目前項目的下一項開始循環，找第一個未完成項目；全部完成回傳 null。 */
export function nextPendingStep(t, fromStep) {
  const i = STEP_IDS.indexOf(fromStep);
  for (let k = 1; k <= STEP_IDS.length; k++) {
    const s = STEP_IDS[(i + k) % STEP_IDS.length];
    if (!t?.done?.[s]) return s;
  }
  return null;
}

export const nextStep = (step) => STEP_IDS[(STEP_IDS.indexOf(step) + 1) % STEP_IDS.length];

/** 有完成項目、評分、草稿或找字紀錄的詞受保護，不可換字。 */
export function isProtected(t, g) {
  if (STEP_IDS.some((s) => t?.done?.[s])) return true;
  if (Object.values(t?.ratings || {}).some((r) => r !== null && r !== undefined)) return true;
  if (Object.values(t?.drafts || {}).some((d) => d && d.trim())) return true;
  return Boolean(g?.found?.length || g?.solved);
}

/** 文字練習可否自評：要有非空白答案並已顯示參考；聽寫還要播放過。 */
export function canRate(step, { draft, revealed, played, speechAvailable = true }) {
  if (!TEXT_STEPS.includes(step)) return false;
  if (!draft || !draft.trim() || !revealed) return false;
  if (step === "listen" && speechAvailable && !played) return false;
  return true;
}
