// 單字怪獸（第二代）：外型由單字決定、屬性由雅思主題分類決定、階段由複習歷史推導（見 MONSTER-PLAN.md）。
// 這裡只產生 SVG 字串與判斷階段，不碰畫面與儲存。
import { L } from "./i18n.js";

/** 12 個雅思主題屬性。鍵是 words.json 的 category（資料鍵，不翻譯）；label 只用於顯示；icon 是 24×24 線條路徑。 */
export const ELEMENTS = {
  "環境與自然": { id: "env", label: L("環境", "Environment"), full: L("環境與自然", "Environment & Nature"), icon: "M4 20C4 10 10 4 20 4C20 14 14 20 4 20ZM4 20L14 10" },
  "科技與科學": { id: "sci", label: L("科技", "Science"), full: L("科技與科學", "Science & Technology"), icon: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 3C15 3 17 7 17 12C17 17 15 21 12 21C9 21 7 17 7 12C7 7 9 3 12 3ZM4 8L20 16M20 8L4 16" },
  "健康與醫療": { id: "health", label: L("健康", "Health"), full: L("健康與醫療", "Health & Medicine"), icon: "M9 4H15V9H20V15H15V20H9V15H4V9H9Z" },
  "教育與學習": { id: "edu", label: L("教育", "Education"), full: L("教育與學習", "Education & Learning"), icon: "M4 5H10C11 5 12 6 12 7V20C12 19 11 18 10 18H4ZM20 5H14C13 5 12 6 12 7V20C12 19 13 18 14 18H20Z" },
  "工作與經濟": { id: "work", label: L("經濟", "Economy"), full: L("工作與經濟", "Work & Economy"), icon: "M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 7V17M9.5 9.5C9.5 8 14.5 8 14.5 10C14.5 12 9.5 12 9.5 14C9.5 16 14.5 16 14.5 14.5" },
  "社會與法律": { id: "soc", label: L("法律", "Society"), full: L("社會與法律", "Society, Government & Law"), icon: "M12 4V20M5 8H19M8 20H16M5 8L2 14H8ZM19 8L16 14H22Z" },
  "文化與媒體": { id: "cul", label: L("文化", "Culture"), full: L("文化與媒體", "Culture, Arts & Media"), icon: "M4 5H20V15H12L7 19V15H4ZM8 9H16M8 12H13" },
  "城市與旅行": { id: "city", label: L("城市", "Cities"), full: L("城市與旅行", "Cities, Housing & Travel"), icon: "M3 21H21M5 21V9L10 6V21M14 21V11L19 9V21M7 11H8M7 14H8M7 17H8M16 13H17M16 16H17" },
  "人際與心理": { id: "ppl", label: L("人際", "People"), full: L("人際與心理", "People & Relationships"), icon: "M12 20L4.5 12.5C2.5 10.5 2.5 7 5 5.5C7 4.3 9.5 5 12 7.5C14.5 5 17 4.3 19 5.5C21.5 7 21.5 10.5 19.5 12.5Z" },
  "圖表與數據": { id: "data", label: L("數據", "Data"), full: L("圖表與數據", "Data & Trends"), icon: "M4 20H20M6 16V11M11 16V6M16 16V9M6 9L11 4L16 7L20 3" },
  "學術與論證": { id: "acad", label: L("學術", "Academic"), full: L("學術與論證", "Academic & Argument"), icon: "M4 20L14 10M14 10L20 4L18 10L12 12ZM4 20L8 16" },
  "日常與動作": { id: "daily", label: L("日常", "Everyday"), full: L("日常與動作", "Everyday & Actions"), icon: "M5 7H17V15C17 18 14 20 11 20C8 20 5 18 5 15ZM17 9H19C21 9 21 14 19 14H17M4 4H18" },
};
export const TOPIC_NAMES = Object.keys(ELEMENTS);
export const elementOf = (category) => ELEMENTS[category] || ELEMENTS["學術與論證"];

export const STAGES = ["unseen", "egg", "hatchling", "adult", "final"];
export const STAGE_LABELS = { unseen: L("未遇見", "Not met yet"), egg: L("蛋", "Egg"), hatchling: L("幼獸", "Baby"), adult: L("成獸", "Grown-up"), final: L("完全體", "Final form") };
export const PARTS = { body: 8, eyeCount: 3, eyes: 4, mouth: 5, ears: 5, limbs: 4, pattern: 4, tail: 3 };

/** FNV-1a 雜湊：同一個字在任何裝置都得到相同的部件。 */
export function hashWord(word) {
  let h = 0x811c9dc5;
  for (const ch of String(word)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function partsOf(word) {
  let h = hashWord(word) ^ 0x9e3779b9;
  const take = (n) => { const v = (h >>> 0) % n; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return v; };
  const p = {};
  for (const k of Object.keys(PARTS)) p[k] = take(PARTS[k]);
  return p;
}

const BODY = [
  '<circle class="b1" cx="50" cy="58" r="30"/>',
  '<ellipse class="b1" cx="50" cy="58" rx="24" ry="34"/>',
  '<ellipse class="b1" cx="50" cy="62" rx="36" ry="26"/>',
  '<path class="b1" d="M50 26C62 26 84 66 82 78C80 90 20 90 18 78C16 66 38 26 50 26Z"/>',
  '<rect class="b1" x="22" y="30" width="56" height="58" rx="12"/>',
  '<path class="b1" d="M50 26C70 26 82 48 82 64C82 82 66 90 50 90C34 90 18 82 18 64C18 48 30 26 50 26Z"/>',
  '<path class="b1" d="M38 28C60 22 86 40 82 64C78 86 54 92 36 86C18 80 14 56 22 44C26 36 30 30 38 28Z"/>',
  '<path class="b1" d="M20 70C20 40 30 26 50 26C70 26 80 40 80 70L74 88L26 88Z"/>',
];
const EARS = [
  "",
  '<path class="b2" d="M26 38L22 14L42 30Z"/><path class="b2" d="M74 38L78 14L58 30Z"/>',
  '<path class="b2" d="M34 36L30 12L36 22L42 10L44 32Z"/><path class="b2" d="M66 36L70 12L64 22L58 10L56 32Z"/>',
  '<circle class="b2" cx="24" cy="32" r="10"/><circle class="b2" cx="76" cy="32" r="10"/>',
  '<path class="b2" d="M45 32L50 10L55 32Z"/>',
];
const LIMBS_BACK = ["", "", '<path class="b2" d="M24 50L4 36L10 54L2 66L24 64Z"/><path class="b2" d="M76 50L96 36L90 54L98 66L76 64Z"/>', ""];
const LIMBS_FRONT = [
  "",
  '<ellipse class="b2" cx="21" cy="68" rx="7" ry="12" transform="rotate(20 21 68)"/><ellipse class="b2" cx="79" cy="68" rx="7" ry="12" transform="rotate(-20 79 68)"/>',
  "",
  '<path class="b2" d="M22 60L6 70L22 76Z"/><path class="b2" d="M78 60L94 70L78 76Z"/>',
];
const TAIL = ["", '<path class="b2" d="M78 76Q98 72 94 54Q92 68 76 72Z"/>', '<path class="b2" d="M78 76Q90 76 92 70"/><circle class="b2" cx="92" cy="68" r="6"/>'];
const PATTERN = [
  "",
  '<circle class="b2" cx="36" cy="74" r="3"/><circle class="b2" cx="58" cy="78" r="3"/><circle class="b2" cx="48" cy="84" r="3"/>',
  '<path class="b2" d="M30 76Q50 70 70 76L70 81Q50 75 30 81Z"/>',
  '<ellipse class="wt" cx="50" cy="72" rx="14" ry="12" opacity=".55"/>',
];
const FEET = '<ellipse class="b2" cx="38" cy="89" rx="8" ry="4"/><ellipse class="b2" cx="62" cy="89" rx="8" ry="4"/>';
const AURA = '<circle class="au" cx="50" cy="58" r="44"/><path class="sp" d="M12 20L14 26L20 28L14 30L12 36L10 30L4 28L10 26ZM86 14L87.5 18L92 19.5L87.5 21L86 25L84.5 21L80 19.5L84.5 18ZM90 84L91 87L94 88L91 89L90 92L89 89L86 88L89 87Z"/>';

function eyes(style, count, wild) {
  const pos = count === 0 ? [[50, 52, 1.3]] : count === 1 ? [[40, 52, 1], [60, 52, 1]] : [[37, 55, 1], [63, 55, 1], [50, 43, .65]];
  if (wild) return pos.map(([x, y, s]) => `<path class="ln" d="M${x - 4 * s} ${y - 4 * s}L${x + 4 * s} ${y + 4 * s}M${x + 4 * s} ${y - 4 * s}L${x - 4 * s} ${y + 4 * s}"/>`).join("");
  return pos.map(([x, y, s]) => {
    if (style === 0) return `<circle class="wt" cx="${x}" cy="${y}" r="${7 * s}"/><circle class="ey" cx="${x + 1}" cy="${y + 1}" r="${3.5 * s}"/>`;
    if (style === 1) return `<circle class="wt" cx="${x}" cy="${y}" r="${9 * s}"/><circle class="ey" cx="${x + 1}" cy="${y + 1}" r="${5 * s}"/><circle class="wt" cx="${x - 1}" cy="${y - 2}" r="${1.5 * s}"/>`;
    if (style === 2) return `<path class="ln" d="M${x - 6 * s} ${y + 2 * s}Q${x} ${y - 7 * s} ${x + 6 * s} ${y + 2 * s}"/>`;
    return `<circle class="wt" cx="${x}" cy="${y}" r="${5.5 * s}"/><circle class="ey" cx="${x}" cy="${y}" r="${2.4 * s}"/>`;
  }).join("");
}
const MOUTH = [
  '<path class="ln" d="M42 67Q50 74 58 67"/>',
  '<ellipse class="ey" cx="50" cy="69" rx="5" ry="4"/>',
  '<path class="ln" d="M43 68L57 68"/>',
  '<path class="ln" d="M42 67Q50 74 58 67"/><path class="wt" d="M53 67L56 72L58 67Z"/>',
  '<path class="ln" d="M40 66Q50 78 60 66Z"/><path class="wt" d="M44 67L46 71L48 67ZM52 67L54 71L56 67Z"/>',
];
const WILD_MOUTH = '<path class="ln" d="M42 71Q50 65 58 71"/>';

/** 每個屬性的標誌配件，所有階段都顯示，讓人不靠顏色也認得出屬性。 */
const SIGNATURE = {
  env: '<path class="ln2" d="M50 28L50 14"/><path class="b2" d="M50 18C50 10 58 6 62 10C60 16 54 20 50 18Z"/><path class="b2" d="M50 24C50 16 42 12 38 16C40 22 46 26 50 24Z"/>',
  sci: '<path class="ln2" d="M50 28L50 12"/><circle class="b2" cx="50" cy="10" r="5"/><circle class="wt" cx="50" cy="10" r="2"/><path class="ln2" d="M38 20L44 18M62 20L56 18"/>',
  health: '<rect class="wt" x="46" y="64" width="8" height="18" rx="2" opacity=".9"/><rect class="wt" x="41" y="69" width="18" height="8" rx="2" opacity=".9"/>',
  edu: '<path class="ey" d="M28 28L50 18L72 28L50 36Z"/><rect class="ey" x="43" y="32" width="14" height="5" rx="1"/><path class="ln2" d="M70 28L70 38"/>',
  work: '<path class="ey" d="M46 62L54 62L52 68L55 84L50 90L45 84L48 68Z"/>',
  soc: '<path class="wt" d="M50 62L52.5 68.5L59 68.5L54 72.5L56 79L50 75L44 79L46 72.5L41 68.5L47.5 68.5Z"/>',
  cul: '<path class="ey" d="M28 30C28 18 72 18 72 30C66 34 34 34 28 30Z"/><circle class="ey" cx="50" cy="18" r="3"/>',
  city: '<path class="b2" d="M30 32C30 16 70 16 70 32Z"/><rect class="wt" x="40" y="24" width="20" height="4" rx="2" opacity=".85"/><rect class="b2" x="24" y="30" width="52" height="5" rx="2"/>',
  ppl: '<path class="wt" d="M50 44L44 38C42 36 42 32 45 31C47 30 49 31 50 33C51 31 53 30 55 31C58 32 58 36 56 38Z"/>',
  data: '<rect class="b2" x="38" y="20" width="6" height="12" rx="1"/><rect class="b2" x="47" y="12" width="6" height="20" rx="1"/><rect class="b2" x="56" y="24" width="6" height="8" rx="1"/>',
  acad: '<path class="ln2" d="M78 46L92 18"/><path class="b2" d="M84 32C82 24 88 16 96 14C96 22 92 30 84 32Z"/>',
  daily: '<path class="ey" d="M34 80L48 87L48 73ZM66 80L52 87L52 73Z"/><circle class="ey" cx="50" cy="80" r="3.5"/>',
};

/**
 * 產生怪獸 SVG。stage 為 hatchling / adult / final；wild 為野化。
 * 輸出不含單字本身（藏字模式下也不會洩題），label 由呼叫端決定是否加上。
 */
export function monsterSvg({ word, category, stage = "hatchling", wild = false, size = 48, label = "", silhouette = false }) {
  return composeSvg(partsOf(word), { category, stage, wild, size, label, silhouette });
}

/** 以指定部件組合畫怪獸（美術設定表與日後的編輯器用）。 */
export function composeSvg(p, { category, stage = "hatchling", wild = false, size = 48, label = "", silhouette = false }) {
  const el = elementOf(category);
  const grown = stage !== "hatchling";
  const inner = [
    stage === "final" ? AURA : "",
    grown ? TAIL[p.tail] : "",
    grown ? LIMBS_BACK[p.limbs] : "",
    grown ? EARS[p.ears] : "",
    BODY[p.body],
    PATTERN[p.pattern],
    grown ? LIMBS_FRONT[p.limbs] : "",
    eyes(p.eyes, p.eyeCount, wild),
    wild ? WILD_MOUTH : MOUTH[p.mouth],
    SIGNATURE[el.id] || "",
    grown ? FEET : "",
  ].join("");
  const body = grown ? inner : `<g transform="translate(50 62) scale(.8) translate(-50 -58)">${inner}</g>`;
  const cls = ["mon", "el-" + el.id, "st-" + stage, wild ? "wild" : "", silhouette ? "sil" : ""].filter(Boolean).join(" ");
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="${cls}" viewBox="0 0 100 100" width="${size}" height="${size}" ${a11y}>${body}</svg>`;
}

const CRACKS = ["M44 40L50 48", "M50 48L46 56", "M46 56L52 64", "M52 64L48 72", "M56 44L60 52", "M60 52L56 60", "M38 52L42 60", "M42 60L38 68"];

/** 蛋：cracks 為已完成的練習項數（0 到 8），不帶任何單字資訊；category 可省略（藏字模式）。 */
export function eggSvg({ cracks = 0, category = null, size = 48, label = "" }) {
  const n = Math.max(0, Math.min(CRACKS.length, cracks | 0));
  const el = category ? " el-" + elementOf(category).id : "";
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="mon egg${el}" viewBox="0 0 100 100" width="${size}" height="${size}" ${a11y}><ellipse class="eg" cx="50" cy="56" rx="26" ry="34"/>${n ? `<path class="ck" d="${CRACKS.slice(0, n).join("")}"/>` : ""}${category ? '<circle class="b1" cx="50" cy="62" r="7"/>' : ""}</svg>`;
}

/** 屬性標籤：圖示加短名，顏色跟怪獸同一組。text 可改成全名。 */
export function topicTag(category, text = null) {
  const el = elementOf(category);
  return `<span class="ttag el-${el.id}"><svg class="ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="${el.icon}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${text ?? el.label}</span>`;
}

/**
 * 推導階段。history 為 { meaning: {日期: 評分}, usage: {日期: 評分} }；hatched 為孵化日期或空。
 * 進化只看孵化日之後、詞義與造句同一天都評「能獨立完成」的複習日，連續 1 次成獸、3 次完全體，階段不降。
 * 野化 = 最近一次詞義或造句評分低於「能獨立完成」。
 */
export function stageOf({ history, hatched, seen = false }) {
  const m = history?.meaning || {}, u = history?.usage || {};
  const latest = (map) => { const d = Object.keys(map).sort().pop(); return d ? map[d] : null; };
  const lm = latest(m), lu = latest(u);
  const wild = (lm !== null && lm < 2) || (lu !== null && lu < 2);
  if (!hatched) return { stage: seen || lm !== null || lu !== null ? "egg" : "unseen", wild, passes: 0, best: 0 };
  const days = [...new Set([...Object.keys(m), ...Object.keys(u)])].filter((d) => d > hatched).sort();
  let run = 0, best = 0, passes = 0;
  for (const d of days) {
    const pass = m[d] === 2 && u[d] === 2;
    run = pass ? run + 1 : 0;
    if (pass) passes++;
    best = Math.max(best, run);
  }
  return { stage: best >= 3 ? "final" : best >= 1 ? "adult" : "hatchling", wild, passes, best };
}

/** 既有使用者沒有孵化紀錄時，以最早的評分日視為孵化日。 */
export function inferHatched(history) {
  const days = [...Object.keys(history?.meaning || {}), ...Object.keys(history?.usage || {})].sort();
  return days[0] || null;
}
