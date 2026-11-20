import { localToday, isValidDate, addDays } from "./core/dates.js";
import { groupIndex, buildMenu, swapCandidate, isValidMenu, mergeRating, posMod, nextReviewDate } from "./core/schedule.js";
import { checkSubword, hintFor, longest, checkRecall, GAME_REASONS } from "./core/game.js";
import { STEPS, STEP_IDS, TEXT_STEPS, RATINGS, MAX_TEXT, doneCount, isWordComplete, nextPendingStep, nextStep, isProtected, canRate } from "./core/training.js";
import { deepMerge } from "./core/merge.js";
import { diffWords } from "./core/diff.js";
import { createStore } from "./store.js";
import { createSpeech } from "./speech.js";
import { usedWords } from "./core/usedwords.js";
import { monsterSvg, eggSvg, stageOf, elementOf, STAGE_LABELS, TOPIC_NAMES, ELEMENTS, topicTag } from "./core/monster.js";
import { BADGES, advanceStreak, streakNow, newBadges, badgeProgress } from "./core/badges.js";
import { LANG, L, setLang } from "./core/i18n.js";
import { tokenize, normWord, buildLexIndex, resolveLex, clipSentence, MAX_SENTENCE } from "./core/lookup.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "a" + Date.now().toString(36) + Math.random().toString(36).slice(2));
const FORM_LABELS = { plural: L("複數", "Plural"), thirdPerson: L("第三人稱單數", "Third person singular"), past: L("過去式", "Past tense"), pastParticiple: L("過去分詞", "Past participle"), presentParticiple: L("現在分詞", "-ing form"), comparative: L("比較級", "Comparative"), superlative: L("最高級", "Superlative") };

const S = {
  today: localToday(), date: null, pinned: false,
  words: {}, training: {}, details: {}, games: {}, course: null,
  day: null, daySaved: false, schedule: { h: {} },
  word: null, step: "game",
  status: { localOk: true },
  page: "daily", bankIdx: {},
  game: { hatched: {}, streak: null, badges: {}, longest: 0 }, plain: false, // 怪獸：孵化紀錄；簡潔模式（只存在這個瀏覽器）
  mywords: {}, // 我的生字：小寫單字 → { t, s, from, lemma, pos, zh, x }，x=1 表示已移除
};
// 生字小卡（目前開著的那一張）、查詢狀態、我的生字清單的畫面狀態
let T = null, LEX = new Map();
const MW = { shown: 30 };
const MAX_MYWORDS = 500;
// 單字庫與學習紀錄的畫面狀態
const B = { q: "", cat: "", pos: "", status: "", page: 0, detail: null, wd: null, pick: [], applyDate: null, msg: null, writeDraft: "", view: "list" };
const C = { topic: null }; // 收藏頁：目前展開的屬性
const R = { loaded: {}, shown: 14, busy: false };
const PAGE_SIZE = 40;
let U = freshUi();
let store = null, speech = null, draftTimer = null, toastTimer = null;

function freshUi() {
  return { revealed: false, played: false, speaking: false, pick: [], typed: "", msg: null, hint: null, showZh: false, recallAnswer: false, justHatched: null };
}

/* ---------- 啟動 ---------- */
document.documentElement.lang = LANG === "en" ? "en" : "zh-Hant";
if (LANG === "en") {
  // index.html 裡寫死的中文：英文介面時在啟動時換掉
  const sub = document.querySelector("#top .brand small");
  if (sub) sub.textContent = "10 words a day";
  const loading = document.querySelector("#main .center p");
  if (loading) loading.textContent = "Getting today's 10 words ready…";
}
init();

async function init() {
  try {
    const names = ["words", "training-examples", "word-details", "game-answers", "course"];
    const [words, training, details, games, course] = await Promise.all(
      names.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })),
    );
    for (const w of words) S.words[w.word] = w;
    Object.assign(S, { training, details, games, course });
    LEX = buildLexIndex(S.words, details);
  } catch {
    $("#main").innerHTML = `<div class="center card"><p>${L("單字資料載入失敗，可能是網路斷了。", "The word data didn't load. Your internet connection may have dropped.")}</p><button class="btn primary" data-act="reload">${L("重新載入", "Reload")}</button></div>`;
    $("#main").addEventListener("click", (e) => e.target.closest('[data-act="reload"]') && location.reload(), { once: true });
    return;
  }
  [store, speech] = await Promise.all([createStore((st) => { S.status = st; renderTop(); }), createSpeech()]);
  const sch = await store.load("schedule");
  if (sch.data?.h) S.schedule = sch.data;

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("hashchange", () => {
    const d = dateFromHash(), pg = pageFromHash();
    if (pg !== "daily") { if (pg !== S.page) setPage(pg); }
    else if (d && d !== S.date) openDate(d, true);
    else if (S.page !== "daily") setPage("daily");
  });
  window.addEventListener("storage", onStorage);
  document.addEventListener("toggle", (e) => { if (e.target.matches?.("details.course")) S.courseOpen = e.target.open; }, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushDraft(); else checkNewDay(); });
  setInterval(checkNewDay, 60000);

  const idx = await store.load("bankidx");
  if (idx.data?.p) S.bankIdx = idx.data.p;
  const gm0 = await store.load("game");
  if (gm0.data?.hatched) S.game.hatched = gm0.data.hatched;
  if (gm0.data?.streak) S.game.streak = gm0.data.streak;
  if (gm0.data?.badges) S.game.badges = gm0.data.badges;
  S.game.longest = gm0.data?.longest || 0;
  const mw0 = await store.load("mywords");
  if (mw0.data?.w && typeof mw0.data.w === "object" && !Array.isArray(mw0.data.w)) S.mywords = mw0.data.w;
  try { S.plain = localStorage.getItem(store.prefix + "plain") === "1"; } catch { S.plain = false; }
  checkBadges(false);
  try { const saved = JSON.parse(localStorage.getItem(store.prefix + "pick") || "[]"); if (Array.isArray(saved)) B.pick = saved.filter((w) => S.words[w]).slice(0, 10); } catch { /* 沒有暫存的自選清單 */ }
  const fromHash = dateFromHash(), startPage = pageFromHash();
  await openDate(fromHash || S.today, Boolean(fromHash && fromHash !== S.today));
  if (startPage !== "daily") setPage(startPage);
}

function dateFromHash() {
  const m = /^#day-(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
  return m && isValidDate(m[1]) ? m[1] : null;
}

function pageFromHash() {
  return location.hash === "#bank" ? "bank" : location.hash === "#collection" ? "collection" : location.hash === "#records" ? "records" : "daily";
}
function setHash(h) {
  if (location.hash === h) return;
  try { history.replaceState(null, "", h || location.pathname + location.search); } catch { /* 外框不允許改網址時略過 */ }
}

function checkNewDay() {
  const now = localToday();
  if (now === S.today) return;
  S.today = now;
  if (!S.pinned && S.page === "daily") openDate(now, false);
  else { if (!S.pinned) S.stale = true; renderTop(); }
}

/* ---------- 日期與菜單 ---------- */
const dayKey = (d) => "day_" + d;
const known = () => new Set(Object.keys(S.words));

async function openDate(date, pinned) {
  flushDraft();
  speech.stop();
  S.date = date;
  S.page = "daily";
  S.stale = false; T = null;
  S.pinned = pinned && date !== S.today;
  setHash(S.pinned ? "#day-" + date : "");
  $("#main").innerHTML = `<div class="center card"><p>${L(`正在讀取 ${esc(date)} 的進度…`, `Loading progress for ${esc(date)}…`)}</p></div>`;
  renderTop();
  const { data } = await store.load(dayKey(date));
  if (S.date !== date) return; // 讀取期間使用者又換了日期
  if (data && isValidMenu(data.wordIds, known())) {
    S.day = data; S.daySaved = true;
  } else {
    const wordIds = buildMenu({ date, groups: S.course.advanced, startDate: S.course.startDate, history: S.schedule.h });
    S.day = { date, level: "advanced", wordIds, swapped: [], training: {}, game: {} };
    S.daySaved = false;
  }
  S.word = S.day.wordIds.find((w) => !isWordComplete(tr(w))) || S.day.wordIds[0];
  S.step = STEP_IDS.find((s) => !tr(S.word).done?.[s]) || "game";
  U = freshUi();
  syncHatch(false);
  renderAll();
}

/* ---------- 怪獸 ---------- */
/** 這一天八項都完成、但還沒有孵化紀錄的字，記為在這一天孵化。回傳這次新孵化的字。 */
function syncHatch(announce) {
  if (!S.day) return [];
  const fresh = S.day.wordIds.filter((w) => isWordComplete(tr(w)) && !S.game.hatched[w]);
  if (!fresh.length) return [];
  const patch = {};
  for (const w of fresh) { S.game.hatched[w] = S.day.date; patch[w] = S.day.date; }
  const gp = { hatched: patch };
  if (announce) {
    U.justHatched = fresh[fresh.length - 1];
    S.game.streak = advanceStreak(S.game.streak, S.today); // 今天有字孵化才算練過
    gp.streak = S.game.streak;
  }
  store.patch("game", gp).catch(() => {});
  checkBadges(announce);
  return fresh;
}

/* ---------- 連續天數與徽章 ---------- */
function gameStats() {
  const hatched = Object.keys(S.game.hatched).filter((w) => S.words[w]);
  const byTopic = {};
  let hasFinal = false;
  for (const w of hatched) {
    byTopic[S.words[w].category] = (byTopic[S.words[w].category] || 0) + 1;
    if (!hasFinal && monsterOf(w).stage === "final") hasFinal = true;
  }
  return {
    hatched: hatched.length,
    dayFull: Boolean(S.day?.wordIds?.length) && S.day.wordIds.every((w) => S.game.hatched[w]),
    dayHatched: S.day?.wordIds?.filter((w) => S.game.hatched[w]).length || 0,
    hasFinal,
    streak: streakNow(S.game.streak, S.today),
    topicMax: Math.max(0, ...Object.values(byTopic)),
    longestSubword: S.game.longest || 0,
  };
}
/** 檢查是否有新徽章；announce 為 true 時用提示告知。 */
function checkBadges(announce) {
  const ids = newBadges(gameStats(), S.game.badges);
  if (!ids.length) return;
  const patch = {};
  for (const id of ids) { S.game.badges[id] = S.today; patch[id] = S.today; }
  store.patch("game", { badges: patch }).catch(() => {});
  if (announce) toast(L(`獲得徽章：${ids.map((id) => BADGES.find((b) => b.id === id).name).join("、")}`, `Badge earned: ${ids.map((id) => BADGES.find((b) => b.id === id).name).join(", ")}`));
}
/** 今日遭遇進度帶：十隻怪獸或蛋，裂痕數等於完成項數；cheer 為今日收尾的慶祝動畫（只播一次）。 */
function encounterHtml(size, cheer = false) {
  if (S.plain || !S.day) return "";
  const hide = masked();
  const n = S.day.wordIds.filter((w) => S.game.hatched[w]).length;
  return `<div class="encounter ${cheer ? "cheer" : ""}" role="img" aria-label="${L(`今天遇到 10 隻，已孵化 ${n} 隻`, `10 monsters today, ${n} hatched`)}">${S.day.wordIds.map((w, i) => `<span style="animation-delay:${i * 70}ms">${w === S.word && hide ? eggSvg({ cracks: 0, size }) : monsterHtml(w, size, { cracks: doneCount(tr(w)) })}</span>`).join("")}</div>`;
}
const streakLine = () => { const n = streakNow(S.game.streak, S.today); return n ? L(`連續練習 ${n} 天。`, `${n}-day streak. `) : ""; };
const badgeCount = () => Object.keys(S.game.badges).filter((id) => BADGES.some((b) => b.id === id)).length;
/** 徽章清單；progress 為 true 時，未獲得的顯示目前進度與進度條。 */
function badgesHtml(progress = false) {
  const got = badgeCount(), pr = progress ? badgeProgress(gameStats()) : null;
  const sub = (b) => {
    const d = S.game.badges[b.id];
    if (d) return `<small>${L(`${esc(d)} 獲得`, `Earned ${esc(d)}`)}</small>`;
    const p = pr?.[b.id];
    if (!p || p.goal === 1) return `<small>${L("未獲得", "Not yet")}</small>`;
    return `<small>${L(`目前 ${p.now} / ${p.goal}`, `${p.now} / ${p.goal} so far`)}</small><span class="pbar" role="progressbar" aria-valuenow="${p.now}" aria-valuemin="0" aria-valuemax="${p.goal}"><i style="width:${Math.round((p.now / p.goal) * 100)}%"></i></span>`;
  };
  return `<div class="badgebox"><h3>${L("徽章", "Badges")} <span class="lead">${got} / ${BADGES.length}</span></h3><ul class="badges">${BADGES.map((b) => `<li class="${S.game.badges[b.id] ? "got" : "locked"}"><b>${b.name}</b><span>${b.desc}</span>${sub(b)}</li>`).join("")}</ul></div>`;
}
const monsterOf = (w) => ({ ...stageOf({ history: S.schedule.h?.[w], hatched: S.game.hatched[w], seen: Boolean(S.bankIdx[w]) || Boolean(S.day?.wordIds.includes(w)) }), hatched: S.game.hatched[w] || null, el: elementOf(S.words[w]?.category) });
/** 怪獸圖：已孵化畫怪獸，否則畫蛋（裂痕數等於完成項數）。 */
function monsterHtml(w, size, opts = {}) {
  const m = monsterOf(w);
  if (m.stage === "unseen" && opts.silhouette) return monsterSvg({ word: w, category: S.words[w]?.category, stage: "hatchling", size, label: opts.label, silhouette: true });
  if (m.stage === "unseen" || m.stage === "egg") return eggSvg({ cracks: opts.cracks ?? 0, category: S.words[w]?.category, size, label: opts.label });
  return monsterSvg({ word: w, category: S.words[w]?.category, stage: m.stage, wild: m.wild, size, label: opts.label, silhouette: opts.silhouette });
}
const stageTag = (m) => `<span class="stagetag ${m.wild ? "wild" : ""}">${m.wild ? L("逃走中 · ", "Ran off · ") : ""}${STAGE_LABELS[m.stage]}</span>`;
function monsterMeta(w) {
  const m = monsterOf(w);
  const line = m.stage === "unseen" ? L("還沒遇見。", "Not met yet.") : m.stage === "egg" ? L("做完八項練習就會孵化。", "It hatches when you finish all eight steps.") : m.stage === "final" ? L("連續三次複習通過，已是完全體。", "You passed three reviews in a row, so it has reached its final form.") : m.stage === "adult" ? L("複習連續通過就會變成完全體。", "Keep passing reviews in a row to reach its final form.") : L("之後某天複習時，詞義理解與造句運用都評「能獨立完成」就會進化。", "It evolves when, on a later review day, you rate both Meaning and Usage as \"Can do it alone\".");
  return `<div class="monmeta"><div>${stageTag(m)} ${topicTag(S.words[w]?.category, m.el.full)}</div>${m.hatched ? `<div>${L(`孵化 ${esc(m.hatched)} · 複習通過 ${m.passes} 次`, `Hatched ${esc(m.hatched)} · Reviews passed: ${m.passes}`)}</div>` : ""}<div>${m.wild ? L("最近一次自評還不到「能獨立完成」，下次複習通過就會回來。", "Your latest rating was below \"Can do it alone\". Pass the next review to bring it back.") : line}</div></div>`;
}
function setPlain(on) {
  S.plain = on;
  try { localStorage.setItem(store.prefix + "plain", on ? "1" : "0"); } catch { /* 存不了就只影響這次 */ }
  if (on) B.view = "list";
  renderAll();
}

const tr = (w) => S.day.training?.[w] || {};
const gm = (w) => S.day.game?.[w] || { found: [], phase: S.games[w]?.length ? "play" : "recall", solved: false };
const answersOf = (w) => S.games[w] || [];

/** 保存當日進度。成功回傳 true；失敗顯示提示並回傳 false，畫面狀態不變。 */
async function saveDay(patch, wait = true) {
  const date = S.day.date;
  const full = S.daySaved ? patch : deepMerge({ date, level: S.day.level, wordIds: S.day.wordIds, swapped: S.day.swapped || [] }, patch);
  try {
    await store.patch(dayKey(date), full, { wait });
    if (S.day.date === date) {
      S.day = deepMerge(S.day, full);
      S.daySaved = true;
      syncHatch(true);
    }
    return true;
  } catch {
    toast(L("儲存失敗，內容還在畫面上。請檢查瀏覽器的儲存空間再試一次。", "Couldn't save. Your work is still on screen. Check your browser storage and try again."));
    return false;
  }
}

/* ---------- 草稿 ---------- */
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, 600);
}
function flushDraft() {
  clearTimeout(draftTimer);
  draftTimer = null;
  if (!S.day) return;
  if (S.pendingCap) {
    const c = S.pendingCap;
    S.pendingCap = null;
    if (c.date === S.day.date) saveDay({ capstone: { draft: c.text } }, false);
  }
  if (!S.pendingDraft) return;
  const { date, word, step, text } = S.pendingDraft;
  S.pendingDraft = null;
  if (date !== S.day.date) return;
  saveDay({ training: { [word]: { drafts: { [step]: text } } } }, false);
}

/* ---------- 事件 ---------- */
function onStorage(e) {
  if (!S.day || e.key !== store.prefix + dayKey(S.day.date) || !e.newValue) return;
  try {
    const other = JSON.parse(e.newValue);
    if (!isValidMenu(other.wordIds, known())) return;
    const mine = S.pendingDraft;
    S.day = deepMerge(S.day, other);
    S.daySaved = true;
    if (mine && mine.date === S.day.date) S.day = deepMerge(S.day, { training: { [mine.word]: { drafts: { [mine.step]: mine.text } } } });
    renderLight();
  } catch { /* 其他分頁寫入的內容無法解析時略過 */ }
}

function onChange(e) {
  const t = e.target;
  if (t.id === "datepick" && isValidDate(t.value)) return openDate(t.value, true);
  if (t.id === "bcat" || t.id === "bpos" || t.id === "bstatus") { B[t.id.slice(1)] = t.value; B.page = 0; return renderBankResults(); }
  if (t.id === "bdate") { B.applyDate = t.value; B.msg = null; return renderPick(); }
  if (t.id === "plain") return setPlain(t.checked);
  if (t.dataset?.pickw) return togglePick(t.dataset.pickw, t.checked);
}

function onKeydown(e) {
  const tw = e.target.closest?.('[data-act="tapword"]');
  if (tw && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return openCard(tw); }
  if (e.key === "Escape" && T?.el?.isConnected && (e.target === T.tok || T.el.contains(e.target))) { e.preventDefault(); return closeCard(true); }
  if (e.key !== "Enter") return;
  if (e.target.id === "gtype") { e.preventDefault(); submitSub(); }
  if (e.target.id === "grecall") { e.preventDefault(); submitRecall(); }
}

function onInput(e) {
  const t = e.target;
  if (t.id === "gtype") { U.typed = t.value; return; }
  if (t.id === "grecall") { U.typed = t.value; return; }
  if (t.id === "bq") { B.q = t.value; B.page = 0; return renderBankResults(); }
  if (t.id === "bwrite") { B.writeDraft = t.value.slice(0, MAX_TEXT); const btn = $('[data-act="bsave"]'); if (btn) btn.disabled = !B.writeDraft.trim(); return; }
  if (t.id === "capdraft") {
    const text = t.value.slice(0, MAX_TEXT);
    S.day = deepMerge(S.day, { capstone: { draft: text } });
    S.pendingCap = { date: S.day.date, text };
    scheduleDraft();
    return renderCapMeta();
  }
  const step = t.dataset?.draft;
  if (!step) return;
  const text = t.value.slice(0, MAX_TEXT);
  const w = S.word;
  S.day = deepMerge(S.day, { training: { [w]: { drafts: { [step]: text } } } });
  S.pendingDraft = { date: S.day.date, word: w, step, text };
  scheduleDraft();
  if (TEXT_STEPS.includes(step)) {
    if (step !== "write") U.revealed = false; // 造句的用法參考可以邊看邊寫
    // 已評過級的項目，改答案後維持完成與原評級；重新對照後可以再評一次
    renderLight(); renderReveal();
  }
}

async function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "prev") return openDate(addDays(S.date, -1), true);
  if (a === "next") return openDate(addDays(S.date, 1), true);
  if (a === "today") return openDate(S.today, false);
  if (a === "lang") {
    flushDraft();
    setLang(LANG === "en" ? "zh" : "en");
    return location.reload();
  }
  if (a === "page" && b.dataset.p === S.page && (S.page === "bank" || S.page === "collection")) { speech.stop(); B.detail = null; B.wd = null; C.topic = null; return renderAll(); }
  if (a === "ctopic") { C.topic = C.topic === b.dataset.c ? null : b.dataset.c; renderAll(); if (C.topic) $("#topicdex")?.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
  if (a === "page") return b.dataset.p === "daily" ? (S.stale ? openDate(S.today, false) : setPage("daily")) : setPage(b.dataset.p);
  if (a === "bdetail") return openDetail(b.dataset.w);
  if (a === "bback") { speech.stop(); B.detail = null; B.wd = null; return renderAll(); }
  if (a === "bpage") { B.page = Number(b.dataset.n); renderBankResults(); return $("#bres")?.scrollIntoView({ block: "start" }); }
  if (a === "bclear") { Object.assign(B, { q: "", cat: "", pos: "", status: "", page: 0 }); return renderAll(); }
  if (a === "bview") { B.view = b.dataset.v === "dex" ? "dex" : "list"; B.page = 0; return renderAll(); }
  if (a === "unpick") return togglePick(b.dataset.w, false);
  if (a === "fillpick") return fillPick();
  if (a === "applypick") return applyPick();
  if (a === "bsave") return saveWriting();
  if (a === "bsay") { const w = B.detail; const res = await speech.speak(b.dataset.t === "word" ? w : S.words[w].example.en); if (!res.ok && res.message) toast(res.message); return; }
  if (a === "rmore") { R.shown += 14; return loadRecords(); }
  if (a === "goattempt") { const { d, w, m } = b.dataset; await openDate(d, d !== S.today); if (S.day.wordIds.includes(w)) select(w, m === "meaning" ? "chinese" : "write"); return; }
  if (a === "group") return openDate(addDays(S.date, posMod(Number(b.dataset.g) - groupIndex(S.date, S.course.startDate, S.course.advanced.length), S.course.advanced.length)), true);
  if (a === "word") return select(b.dataset.w, null);
  if (a === "step") return select(S.word, b.dataset.step);
  if (a === "nextstep") return select(S.word, nextStep(S.step));
  if (a === "nextword") return select(S.day.wordIds[(S.day.wordIds.indexOf(S.word) + 1) % 10], null);
  if (a === "swap") return swapWord(b.dataset.w);
  if (a === "manual") return manualComplete();
  if (a === "confirm") return completeStep({});
  if (a === "rate") return rate(Number(b.dataset.r));
  if (a === "reveal") { U.revealed = true; renderReveal(); renderActs(); renderHead(); renderMenu(); return; }
  if (a === "whint") return moreHint();
  if (a === "zh") { U.showZh = !U.showZh; return renderBody(); }
  if (a === "say") return say(b.dataset.say, b.dataset.mark === "1");
  if (a === "tile") { U.pick.push(Number(b.dataset.i)); U.typed = ""; U.msg = null; return renderBody(); }
  if (a === "undo") { if (U.typed) U.typed = U.typed.slice(0, -1); else U.pick.pop(); U.msg = null; return renderBody(); }
  if (a === "clear") { U.pick = []; U.typed = ""; U.msg = null; return renderBody(); }
  if (a === "sub") return submitSub();
  if (a === "hint") { const h = hintFor(answersOf(S.word), gm(S.word).found); U.hint = h; U.msg = h ? null : { kind: "ok", text: L("這一關的小字都找到了。", "You've found all the hidden words.") }; return renderBody(); }
  if (a === "torecall") return setGame({ phase: "recall" });
  if (a === "toplay") return setGame({ phase: "play" });
  if (a === "recall") return submitRecall();
  if (a === "gameanswers") { U.gameAnswers = !U.gameAnswers; return renderBody(); }
  if (a === "showanswer") { U.recallAnswer = true; return renderBody(); }
  // 生字小卡與我的生字
  if (a === "tapword") return openCard(b);
  if (a === "wclose") return closeCard(true);
  if (a === "wsave") return T && saveMyWord(T.key, { s: T.full, word: T.word, from: T.from, ...(T.base ? { lemma: T.base, pos: S.words[T.base].pos, zh: S.words[T.base].zh } : {}) });
  if (a === "wremove" || a === "mwremove") return removeMyWord(a === "wremove" ? T?.key : b.dataset.w);
  if (a === "wdetail") { const w = b.dataset.w; if (!S.words[w]) return; T = null; if (S.page !== "bank") setPage("bank"); return openDetail(w); }
  if (a === "mwmore") { MW.shown += 30; return renderMyWords(); }
}

function select(word, step) {
  flushDraft();
  speech.stop();
  S.word = word;
  S.step = step || STEP_IDS.find((s) => !tr(word).done?.[s]) || "game";
  U = freshUi(); T = null;
  renderAll();
  $("#panel")?.scrollIntoView({ block: "nearest" });
}

async function swapWord(w) {
  if (isProtected(tr(w), S.day.game?.[w])) return toast(L("這個字已經有練習紀錄，不能換掉。", "This word already has practice saved, so it can't be swapped."));
  const cand = swapCandidate({ date: S.date, groups: S.course.advanced, startDate: S.course.startDate, menu: S.day.wordIds, excluded: S.day.swapped || [] });
  if (!cand) return toast(L("沒有可以換的字了。", "There are no other words to swap in."));
  const wordIds = S.day.wordIds.map((x) => (x === w ? cand : x));
  const swapped = [...(S.day.swapped || []), w];
  if (await saveDay({ wordIds, swapped })) { toast(L(`已把 ${w} 換成 ${cand}。`, `Swapped ${w} for ${cand}.`)); select(cand, "game"); }
}

async function completeStep(extra) {
  const w = S.word, s = S.step;
  flushDraft();
  if (await saveDay(deepMerge({ training: { [w]: { done: { [s]: true }, manual: { [s]: false } } } }, extra))) renderAll();
}

async function manualComplete() {
  const w = S.word, s = S.step;
  flushDraft();
  if (!(await saveDay({ training: { [w]: { done: { [s]: true }, manual: { [s]: true } } } }))) return;
  const next = nextPendingStep(tr(w), s);
  if (next) select(w, next);
  else renderAll();
}

async function rate(r) {
  const w = S.word, s = S.step;
  const draft = tr(w).drafts?.[s] || "";
  if (!canRate(s, { draft, revealed: U.revealed, played: U.played, speechAvailable: speech.kind !== "none" })) return;
  flushDraft();
  if (!(await saveDay({ training: { [w]: { done: { [s]: true }, manual: { [s]: false }, ratings: { [s]: r }, drafts: { [s]: draft } } } }))) return;
  const mode = s === "chinese" ? "meaning" : s === "write" ? "usage" : null;
  if (mode) {
    const practiceDate = localToday();
    const id = uuid();
    const attempt = { id, wordId: w, practiceDate, menuDate: S.day.date, mode, answer: draft, rating: r, slot: S.day.wordIds.indexOf(w), menuWordIds: S.day.wordIds, time: new Date().toISOString() };
    // 同一天練了好幾次，取最低的評級
    const merged = mergeRating(S.schedule.h?.[w]?.[mode], practiceDate, r);
    const hp = { h: { [w]: { [mode]: { [practiceDate]: merged } } } };
    S.schedule = deepMerge(S.schedule, hp);
    try {
      await store.patch("att_" + practiceDate, { items: { [id]: attempt } });
      await store.patch("schedule", hp);
    } catch { toast(L("作答已記入今日進度，但沒寫進學習紀錄。", "Your answer is saved in today's progress, but it couldn't be added to your history.")); }
  }
  renderAll();
}

async function say(key, mark) {
  const text = key === "word" ? S.word : exampleFor(S.word, key)?.en;
  if (!text) return;
  const at = S.word + "/" + S.step;
  const buttons = () => document.querySelectorAll('[data-act="say"]');
  U.speaking = true; U.msg = null; renderMsg();
  buttons().forEach((b) => (b.disabled = true));
  const res = await speech.speak(text);
  if (at !== S.word + "/" + S.step) return; // 播放期間已切到別的題目
  U.speaking = false;
  buttons().forEach((b) => (b.disabled = false));
  if (res.ok && mark) {
    U.played = true;
    buttons().forEach((b) => { if (b.dataset.mark === "1") b.textContent = L("▶ 再聽一次", "▶ Play again"); });
  }
  if (!res.ok && res.message) U.msg = { kind: "warn", text: res.message + (S.step === "listen" ? L("可以直接按「太簡單，標記完成」。", " You can also press \"Too easy, mark as done\".") : "") };
  renderMsg();
  renderActs();
}

/* ---------- 字中找字 ---------- */
async function setGame(patch, extra = {}) {
  const w = S.word;
  const g = { ...gm(w), ...patch };
  U = { ...freshUi() };
  if (await saveDay(deepMerge({ game: { [w]: g } }, extra))) renderAll();
}

async function submitSub() {
  const w = S.word, g = gm(w);
  const raw = U.typed.trim() || U.pick.map((i) => w[i]).join("");
  const res = checkSubword(w, raw, answersOf(w), g.found);
  if (!res.ok) { U.msg = { kind: "warn", text: GAME_REASONS[res.reason] }; return renderBody(); }
  const found = [...g.found, res.word];
  U.pick = []; U.typed = ""; U.hint = null;
  U.msg = { kind: "ok", text: L(`找到 ${res.word} 了。`, `Found ${res.word}!`) };
  if (res.word.length > (S.game.longest || 0)) { S.game.longest = res.word.length; store.patch("game", { longest: S.game.longest }).catch(() => {}); }
  if (await saveDay({ game: { [w]: { found, phase: "play", solved: g.solved } } }, false)) { checkBadges(true); renderAll(); }
}

async function submitRecall() {
  const w = S.word, g = gm(w);
  if (!checkRecall(w, U.typed)) {
    U.msg = { kind: "warn", text: U.typed.trim() ? L("還不對，再想想拼法。", "Not quite. Think about the spelling again.") : L("先輸入你記得的拼法。", "Type the spelling you remember first.") };
    return renderBody();
  }
  U = freshUi();
  if (await saveDay({ game: { [w]: { found: g.found, phase: "done", solved: true } }, training: { [w]: { done: { game: true }, manual: { game: false } } } })) renderAll();
}

/* ---------- 自主造句的提示：搭配詞、用法、可以寫的內容，一次給一點 ---------- */
const HINTS = new Map(); // 單字 -> { list, shown }；只留在這次開啟的頁面裡

function staticHints(w) {
  const info = S.words[w], ex = exampleFor(w, "write");
  const out = [];
  if (info.collocations?.length) out.push({ title: L("可用的搭配", "Collocations you can use"), html: `<ul class="chips en" lang="en">${info.collocations.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` });
  if (info.hint) out.push({ title: L("用法提醒", "Usage note"), html: `<p>${esc(info.hint)}</p>` });
  if (ex?.zh) out.push({ title: L("沒靈感時，試著用英文說這句話", "If you're out of ideas, try saying this in English"), html: `<p>${esc(ex.zh)}</p>` });
  return out;
}

function moreHint() {
  const w = S.word;
  let st = HINTS.get(w);
  if (st) st.shown = Math.min(st.list.length, st.shown + 1);
  else { const list = staticHints(w); HINTS.set(w, (st = { list, shown: list.length ? 1 : 0 })); }
  renderHints();
}

function renderHints() {
  const el = $("#hintbox");
  if (!el) return;
  const st = HINTS.get(S.word);
  if (!st) { el.innerHTML = `<div class="row"><button class="btn" data-act="whint">${L("給我提示", "Give me a hint")}</button><span class="lead">${L("一次給一點。", "One step at a time.")}</span></div>`; return; }
  const n = st.list.length;
  el.innerHTML = `<div class="note hints">
    ${n ? `<ol>${st.list.slice(0, st.shown).map((x) => `<li><h3>${x.title}</h3>${x.html}</li>`).join("")}</ol>` : `<p class="none">${L("這個字沒有現成的提示。", "No hints for this word.")}</p>`}
    ${st.shown < n ? `<div class="row"><button class="btn small" data-act="whint">${L(`再多一點提示（${st.shown}/${n}）`, `One more hint (${st.shown}/${n})`)}</button></div>` : n ? `<p class="lead">${L("提示給完了。", "That's all the hints.")}</p>` : ""}</div>`;
}

/* ---------- 生字：可點的字、生字小卡、我的生字 ---------- */
/** 例句容器的屬性：sk 標記是哪一句（重畫後用來把小卡放回原位），from 是這句屬於哪個詞庫單字。 */
const tsAttr = (sk, from) => ` data-sk="${esc(sk)}" data-from="${esc(from || "")}"`;
const isTarget = (tok, target) => {
  if (!target) return false;
  const n = normWord(tok);
  return n === normWord(target) || resolveLex(LEX, tok) === target || Object.values(S.details[target]?.forms || {}).some((f) => normWord(f) === n);
};
/** 把一句英文變成可點的字；正在練習的目標單字維持一般文字。標點與空白原樣保留。 */
function tapInner(text, target) {
  return tokenize(text).map((x) => (x.w && !isTarget(x.t, target) ? `<span class="tw" role="button" tabindex="0" data-act="tapword">${esc(x.t)}</span>` : esc(x.t))).join("");
}
const liveWord = (k) => { const e = S.mywords[k]; return e && e.x !== 1 ? e : null; };
const liveCount = () => Object.values(S.mywords).filter((e) => e && e.x !== 1).length;

function openCard(tok) {
  const c = tok.closest(".tsent");
  if (!c) return;
  const idx = [...c.querySelectorAll(".tw")].indexOf(tok);
  if (T?.el?.isConnected && T.c === c && T.idx === idx) return closeCard(true);
  closeCard(false);
  const word = tok.textContent, base = resolveLex(LEX, word), key = base || normWord(word).replace(/'s$/, "");
  const full = c.textContent;
  T = { word, key, base, full, sk: c.dataset.sk, from: c.dataset.from, idx, msg: null };
  mountCard(c, tok);
}
function mountCard(c, tok) {
  const el = document.createElement(c.tagName === "DD" ? "dd" : "div");
  el.className = "wcard";
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", L(`生字 ${T.word}`, `Word: ${T.word}`));
  c.after(el);
  Object.assign(T, { el, c, tok });
  tok.classList.add("on");
  tok.setAttribute("aria-expanded", "true");
  renderCard();
}
function closeCard(focusTok) {
  if (!T) return;
  const tok = T.tok;
  T.el?.remove();
  if (tok) { tok.classList.remove("on"); tok.removeAttribute("aria-expanded"); if (focusTok && tok.isConnected) tok.focus(); }
  T = null;
}
/** 畫面局部重畫後，把原本開著的小卡放回同一句、同一個字底下。 */
function restoreCard() {
  if (!T || T.el?.isConnected) return;
  const c = [...document.querySelectorAll(".tsent")].find((x) => x.dataset.sk === T.sk && x.dataset.from === T.from && x.textContent === T.full);
  const tok = c?.querySelectorAll(".tw")[T.idx];
  if (tok) mountCard(c, tok);
}

function renderCard() {
  if (!T?.el?.isConnected) return;
  const x = T.base ? S.words[T.base] : null, saved = liveWord(T.key), n = normWord(T.word);
  let h = `<div class="wchead"><p><b lang="en">${esc(T.word)}</b>${x && T.base !== n ? ` <span class="lead">${L(`原形 <span lang="en">${esc(T.base)}</span>`, `base form <span lang="en">${esc(T.base)}</span>`)}</span>` : ""}</p><button class="x" data-act="wclose" aria-label="${L("關閉生字小卡", "Close word card")}">×</button></div>`;
  if (x) h += `<p class="gloss"><b>${esc(x.pos)}</b>${esc(x.zh)}</p><p class="lead">${L("這個字在詞庫裡。", "This word is in the word list.")}</p>`;
  else h += `<p class="lead">${L("這個字不在詞庫裡，可以先存起來。", "This word isn't in the word list, but you can still save it.")}</p>`;
  if (T.msg) h += `<p class="msg warn" role="status">${esc(T.msg)}</p>`;
  let row = "";
  row += saved
    ? `<span class="doneline">${L("✓ 已在我的生字", "✓ In my saved words")}</span><button class="btn small" data-act="wremove">${L("移除", "Remove")}</button>`
    : `<button class="btn small primary" data-act="wsave">${L("加入我的生字", "Save to my words")}</button>`;
  if (x) row += `<button class="btn small quiet" data-act="wdetail" data-w="${esc(T.base)}">${L("看單字詳情", "See word details")}</button>`;
  T.el.innerHTML = h + `<div class="row">${row}</div>`;
}
/** 小卡重畫後，把焦點放回小卡裡（按鈕被換掉時避免焦點掉到頁首）。 */
function focusCard(sel) {
  if (!T?.el?.isConnected) return;
  (T.el.querySelector(sel) || T.el.querySelector("button:not([disabled])"))?.focus();
}

async function saveMyWord(key, { s, word, from, lemma, pos, zh }) {
  if (!key) return;
  const prev = S.mywords[key];
  if (!liveWord(key) && liveCount() >= MAX_MYWORDS) {
    const text = L(`我的生字已滿 ${MAX_MYWORDS} 個，請先到單字庫的「我的生字」移除一些。`, `You can save up to ${MAX_MYWORDS} words and the list is full. Remove some in "My saved words" on the word bank page first.`);
    if (T?.key === key) { T.msg = text; renderCard(); focusCard('[data-act="wsave"]'); } else toast(text);
    return;
  }
  const entry = { t: new Date().toISOString(), s: clipSentence(s, word || key, MAX_SENTENCE), from: from || "", lemma: lemma || prev?.lemma || "", pos: pos || prev?.pos || "", zh: zh || prev?.zh || "", x: 0 };
  S.mywords[key] = entry;
  if (T?.key === key) { T.msg = null; renderCard(); focusCard('[data-act="wremove"]'); }
  try { await store.patch("mywords", { w: { [key]: entry } }); }
  catch {
    if (prev) S.mywords[key] = prev; else delete S.mywords[key];
    toast(L("儲存失敗，請檢查瀏覽器的儲存空間再試一次。", "Couldn't save. Check your browser storage and try again."));
    renderCard();
  }
}

async function removeMyWord(key) {
  if (!key || !liveWord(key)) return;
  S.mywords[key] = { ...S.mywords[key], x: 1 };
  if (T?.key === key) { renderCard(); focusCard('[data-act="wsave"]'); }
  renderMyWords();
  try { await store.patch("mywords", { w: { [key]: { x: 1 } } }); }
  catch {
    S.mywords[key] = { ...S.mywords[key], x: 0 };
    toast(L("移除失敗，請再試一次。", "Couldn't remove it. Please try again."));
    renderCard(); renderMyWords();
  }
}

/** 單字庫頁面的「我的生字」清單。 */
function renderMyWords() {
  const el = $("#mywords");
  if (!el) return;
  const items = Object.entries(S.mywords).filter(([, e]) => e && typeof e === "object" && e.x !== 1).sort((a, b) => (String(a[1].t) < String(b[1].t) ? 1 : -1));
  let h = `<h2 class="sec">${L("我的生字", "My saved words")}</h2>`;
  if (!items.length) {
    el.innerHTML = h + `<p class="lead">${L("還沒有生字。在英文例句裡點一下不認識的字，再按「加入我的生字」，就會收在這裡。", "No saved words yet. In any English example sentence in practice or word details, tap a word you don't know and press \"Save to my words\". It will show up here.")}</p>`;
    return;
  }
  h += `<p class="lead">${L(`共 ${items.length} 個，新存的在前面。`, `${items.length} saved, newest first.`)}${items.length >= MAX_MYWORDS ? L(`已達上限 ${MAX_MYWORDS} 個，要再存新字請先移除一些。`, ` You've reached the limit of ${MAX_MYWORDS}. Remove some to save new ones.`) : ""}</p>`;
  h += `<ul class="mylist">${items.slice(0, MW.shown).map(([k, e]) => {
    const lex = resolveLex(LEX, k) || (e.lemma ? resolveLex(LEX, e.lemma) : null);
    const x = lex ? S.words[lex] : null;
    const pos = x ? x.pos : e.pos, zh = x ? x.zh : e.zh;
    const hit = (t) => { const n = normWord(t); return n === k || n === normWord(e.lemma) || n.replace(/'s$/, "") === k || (lex && resolveLex(LEX, t) === lex); };
    const sent = tokenize(e.s).map((t) => (t.w && hit(t.t) ? `<b>${esc(t.t)}</b>` : esc(t.t))).join("");
    const d = e.t ? localToday(new Date(e.t)) : "";
    const meta = [isValidDate(d) ? esc(d) : "", e.from && S.words[e.from] ? L(`出自 <span lang="en">${esc(e.from)}</span> 的例句`, `from an example for <span lang="en">${esc(e.from)}</span>`) : ""].filter(Boolean).join(" · ");
    let acts = "";
    if (x) acts += `<button class="btn small" data-act="bdetail" data-w="${esc(lex)}">${L("看單字詳情", "See word details")}</button>`;
    acts += `<button class="btn small quiet" data-act="mwremove" data-w="${esc(k)}" aria-label="${L(`從我的生字移除 ${esc(k)}`, `Remove ${esc(k)} from my saved words`)}">${L("移除", "Remove")}</button>`;
    return `<li><p class="errhead"><b lang="en">${esc(k)}</b>${e.lemma && e.lemma !== k && !x ? `<span>${L("原形", "base form")} <span lang="en">${esc(e.lemma)}</span></span>` : ""}</p>
      ${zh ? `<p class="gloss"><b>${esc(pos)}</b>${esc(zh)}</p>` : ""}
      ${e.s ? `<p class="tr mysent" lang="en">${sent}</p>` : ""}
      ${meta ? `<p class="lead mymeta">${meta}</p>` : ""}
      <div class="row">${acts}</div></li>`;
  }).join("")}</ul>`;
  if (items.length > MW.shown) h += `<div class="row" style="margin-top:12px"><button class="btn" data-act="mwmore">${L(`再顯示 30 個（還有 ${items.length - MW.shown} 個）`, `Show 30 more (${items.length - MW.shown} left)`)}</button></div>`;
  el.innerHTML = h;
}

/* ---------- 今日串寫 ---------- */
const capWords = () => S.day.wordIds.map((w) => ({ word: w, pos: S.words[w].pos, zh: S.words[w].zh, forms: S.details[w]?.forms }));

function renderCapstone() {
  const el = $("#capstone");
  if (!el) return;
  el.innerHTML = `<h2 class="sec">${L("今日串寫", "Today's paragraph")}</h2>
    <p class="lead">${L("從今天的十個字挑至少三個，寫兩到四句連貫的英文。這是加練，不算進八項進度。", "Pick at least three of today's 10 words and write two to four connected English sentences. This is extra practice and doesn't count toward the eight steps.")}</p>
    <label class="field" for="capdraft">${L("短文", "Your paragraph")}<textarea id="capdraft" rows="5" maxlength="${MAX_TEXT}" lang="en" spellcheck="false">${esc(S.day.capstone?.draft || "")}</textarea></label>
    <div id="capmeta" class="body" style="margin-top:10px"></div>`;
  renderCapMeta();
}

function renderCapMeta() {
  const el = $("#capmeta");
  if (!el) return;
  const used = usedWords(S.day.capstone?.draft || "", capWords());
  const enough = used.length >= 3, hatched = S.day.wordIds.filter((w) => S.game.hatched[w]).length;
  const cheer = enough && U.capEnough === false; // 剛用滿三個字的那一刻才歡呼
  U.capEnough = enough;
  const encLine = enough
    ? (hatched === 10 ? L("短文寫了，十隻也都孵化了，今天收工。", "Paragraph written and all ten hatched. That's today done.") : L("短文寫了，剩下的蛋孵完就收工。", "Paragraph written. Hatch the rest and today is done."))
    : L(`今天遇到 10 隻，已孵化 ${hatched} 隻。最後寫一篇短文收尾。`, `10 monsters today, ${hatched} hatched. Finish the day with a short paragraph.`);
  let h = S.plain ? "" : `<div class="encwrap">${encounterHtml(32, cheer)}<p class="lead">${encLine}</p></div>`;
  h += `<ul class="chips en" lang="en" aria-label="${L("今天的十個字", "Today's 10 words")}">${S.day.wordIds.map((w) => `<li class="${used.includes(w) ? "used" : ""}">${used.includes(w) ? "✓ " : ""}${esc(w)}</li>`).join("")}</ul>
    <p class="lead" role="status">${L(`已用到 ${used.length} 個今日單字${enough ? "。" : "，至少用三個。"}`, `Today's words used: ${used.length}${enough ? "." : ". Use at least three."}`)}</p>
    <p class="lead">${L("草稿會自動存。寫完自己唸一遍，檢查每個字的詞性和搭配。", "Your draft saves automatically. Read it aloud when you finish and check each word's form and collocation.")}</p>`;
  el.innerHTML = h;
  restoreCard();
}

/* ---------- 題目快照 ---------- */
function exampleFor(w, step) {
  const snap = tr(w).examples?.[step];
  if (snap) return snap;
  return step === "base" ? S.words[w].example : S.training[w]?.[step];
}
function snapshotExample(w, step) {
  if (!S.training[w]?.[step] || tr(w).examples?.[step]) return;
  // 首次開啟時保存題目，之後資料更新也沿用原題
  saveDay({ training: { [w]: { examples: { [step]: S.training[w][step] } } } }, false);
}

/* ---------- 顯示 ---------- */
function masked() {
  if (S.step === "listen") return !U.revealed;
  if (S.step === "english") return !U.revealed;
  if (S.step === "game") { const g = gm(S.word); return g.phase === "recall" && !g.solved; }
  return false;
}

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

function renderTop() {
  const st = S.status;
  const cls = st.localOk ? "" : "is-error";
  const label = st.localOk ? L("進度存在這個瀏覽器", "Progress is saved in this browser") : L("瀏覽器不允許儲存，重新整理後進度會消失", "This browser can't save. Your progress will be lost when you reload.");
  const isToday = S.date === S.today;
  $("#top").innerHTML = `
    <div class="brand"><h1>詞習<span>Lexi</span></h1><small>${L("每日十詞", "10 words a day")}</small>${LANG === "en" ? '<button class="btn small" data-act="lang" lang="zh-Hant" aria-label="切換成中文介面">中文</button>' : '<button class="btn small" data-act="lang" lang="en" aria-label="Switch to English">EN</button>'}</div>
    <nav class="nav" aria-label="${L("主要頁面", "Main pages")}">${[["daily", L("每日訓練", "Daily practice")], ["bank", L("單字庫", "Word bank")], ["collection", L("收藏", "Collection")], ["records", L("學習紀錄", "History")]].map(([pg, l]) => `<button class="navb" data-act="page" data-p="${pg}" ${S.page === pg ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</nav>
    ${S.page === "daily" ? `<div class="datebar" role="group" aria-label="${L("選擇日期", "Choose a date")}">
      <button class="btn" data-act="prev" aria-label="${L("前一天", "Previous day")}">${L("‹ 前一天", "‹ Previous day")}</button>
      <input type="date" id="datepick" aria-label="${L("訓練日期", "Practice date")}" value="${esc(S.date || S.today)}">
      <button class="btn" data-act="next" aria-label="${L("後一天", "Next day")}">${L("後一天 ›", "Next day ›")}</button>
      <button class="btn" data-act="today" ${isToday ? "disabled" : ""}>${L("今天", "Today")}</button>
    </div>` : ""}
    <div class="status ${cls}" role="status" aria-live="polite"><span class="dot" aria-hidden="true"></span><span>${label}</span></div>`;
}

function setPage(pg) {
  flushDraft();
  speech.stop();
  S.page = pg; T = null;
  setHash(pg === "daily" ? (S.pinned ? "#day-" + S.date : "") : "#" + pg);
  if (pg === "bank" && !B.applyDate) B.applyDate = S.date;
  renderAll();
  if (pg === "records") loadRecords();
  window.scrollTo(0, 0);
}

function renderAll() {
  renderTop();
  if (S.page === "bank") return renderBank();
  if (S.page === "collection") return renderCollection();
  if (S.page === "records") return renderRecords();
  $("#main").innerHTML = `
    <div class="layout">
      <section class="card" id="menu" aria-label="${L("今日十詞", "Today's 10 words")}"></section>
      <section class="card" id="panel" aria-label="${L("單字訓練", "Word practice")}">
        <div id="head"></div><div class="tabs" id="tabs" role="tablist" aria-label="${L("八項練習", "Eight practice steps")}"></div>
        <div class="body" id="body"></div><div id="foot"></div>
      </section>
    </div>
    <div class="stack" id="extras">
      <section class="card" id="capstone" aria-label="${L("今日串寫", "Today's paragraph")}"></section>
      <section class="card" id="course"></section>
    </div>`;
  renderCapstone(); renderCourse();
  renderMenu(); renderHead(); renderTabs(); renderBody(); renderFoot();
  if (TEXT_STEPS.includes(S.step) || ["example", "speak"].includes(S.step)) snapshotExample(S.word, S.step);
}

function renderLight() { renderMenu(); renderHead(); renderTabs(); renderActs(); renderFoot(); }

function renderMenu() {
  const el = $("#menu");
  if (!el) return;
  const full = S.day.wordIds.filter((w) => isWordComplete(tr(w))).length;
  const hide = masked();
  const extras = $("#extras");
  if (extras) extras.hidden = hide; // 回想作答期間，下方會列出今日單字的區塊先收起來
  const mons = !S.plain;
  const hatchedToday = S.day.wordIds.filter((w) => S.game.hatched[w]).length;
  el.innerHTML = `
    <div class="menuhead"><h2>${S.date === S.today ? L("今日十詞", "Today's 10 words") : L(esc(S.date) + " 的十詞", "10 words for " + esc(S.date))}</h2><span class="tally" aria-label="${L(`已完成 ${full} 個字，共 10 個`, `${full} of 10 words done`)}">${full}/10</span></div>
    ${mons ? encounterHtml(22) : ""}
    <p class="level">${mons ? L(`今天遇到 10 隻怪獸，做完八項練習就會孵化${hatchedToday ? `，已孵化 ${hatchedToday} 隻` : ""}。`, `You've met 10 monsters today. Each one hatches when you finish all eight steps${hatchedToday ? ` (${hatchedToday} hatched so far)` : ""}. `) + streakLine() : ""}${S.day.level === "custom" ? L("這天練的是你自選的十個字。", "This day uses the 10 words you picked in your word bank.") : L(`IELTS 進階：${Object.keys(S.words).length} 詞，${S.course.advanced.length} 天一輪。`, `IELTS advanced: ${Object.keys(S.words).length} words, one round every ${S.course.advanced.length} days.`)}</p>
    <ol class="menu ${mons ? "mons" : ""}">${S.day.wordIds.map((w, i) => {
      const n = doneCount(tr(w)), sel = w === S.word;
      const label = sel && hide ? L("（練習中）", "(practising)") : esc(w);
      const canSwap = !isProtected(tr(w), S.day.game?.[w]) && !(sel && hide);
      const avatar = !mons ? "" : sel && hide ? eggSvg({ cracks: 0, size: 30 }) : monsterHtml(w, 30, { cracks: n });
      return `<li class="mi ${sel ? "sel" : ""} ${n === 8 ? "full" : ""}">
        <button class="pick" data-act="word" data-w="${esc(w)}" ${sel ? 'aria-current="true"' : ""}><span class="no">${String(i + 1).padStart(2, "0")}</span>${avatar}<span class="mw">${label}</span><span class="mc" aria-label="${L(`完成 ${n} 項，共 8 項`, `${n} of 8 steps done`)}">${n}/8</span></button>
        ${canSwap ? `<button class="swap" data-act="swap" data-w="${esc(w)}" aria-label="${L(`太簡單，把 ${esc(w)} 換成另一個進階詞`, `Too easy: swap ${esc(w)} for another advanced word`)}">${L("換字", "Swap")}</button>` : ""}
      </li>`;
    }).join("")}</ol>`;
}

function renderHead() {
  const el = $("#head");
  if (!el) return;
  const w = S.word, info = S.words[w], n = doneCount(tr(w));
  const slot = L(`第 ${String(S.day.wordIds.indexOf(w) + 1).padStart(2, "0")} 詞 · 已完成 ${n}/8`, `Word ${String(S.day.wordIds.indexOf(w) + 1).padStart(2, "0")} · ${n}/8 done`);
  if (masked()) {
    const showZh = S.step !== "listen";
    el.innerHTML = `<div class="head"><div><p class="slot">${slot}</p><h2 class="hw masked">${L("英文先藏起來，作答後再顯示", "The English is hidden until you answer")}</h2>${showZh ? `<p class="gloss"><b>${esc(info.pos)}</b>${esc(info.zh)}</p>` : ""}</div></div>`;
    return;
  }
  const m = monsterOf(w);
  const mon = S.plain ? "" : `<div class="monhead">${monsterHtml(w, 72, { cracks: n, label: L(`${w} 的怪獸，${STAGE_LABELS[m.stage]}`, `Monster for ${w}, ${STAGE_LABELS[m.stage]}`) })}<div class="monmeta"><div>${stageTag(m)}</div><div>${topicTag(S.words[w]?.category)}${m.hatched ? L(` · 孵化 ${esc(m.hatched)}`, ` · Hatched ${esc(m.hatched)}`) : ""}</div></div></div>`;
  el.innerHTML = `<div class="head">
    <div><p class="slot">${slot}</p><h2 class="hw" lang="en">${esc(w)}</h2><p class="gloss"><b>${esc(info.pos)}</b>${esc(info.zh)}</p></div>
    <div class="row">${mon}<span class="phon" lang="en">${info.phonetic ? "/" + esc(info.phonetic) + "/" : ""}</span><button class="btn small" data-act="say" data-say="word">${L("▶ 聽發音", "▶ Listen")}</button></div>
  </div>`;
}

function renderTabs() {
  const el = $("#tabs");
  if (!el) return;
  el.innerHTML = STEPS.map((s) => {
    const d = tr(S.word).done?.[s.id];
    return `<button class="tab ${d ? "done" : ""}" role="tab" aria-selected="${s.id === S.step}" data-act="step" data-step="${s.id}">${d ? "✓ " : ""}${s.label}</button>`;
  }).join("");
}

const playBtn = (key, label, mark = false) => `<button class="btn" data-act="say" data-say="${key}" data-mark="${mark ? 1 : 0}" ${U.speaking ? "disabled" : ""}>▶ ${label}</button>`;
function renderMsg() {
  const el = $("#msgbox");
  if (el) el.innerHTML = U.msg ? `<p class="msg ${U.msg.kind}" role="status">${esc(U.msg.text)}</p>` : "";
}
const textarea = (step, label, lang, rows = 3) =>
  `<label class="field" for="draft-${step}">${label}<textarea id="draft-${step}" data-draft="${step}" maxlength="${MAX_TEXT}" rows="${rows}" lang="${lang}" autocapitalize="${lang === "en" ? "sentences" : "off"}" spellcheck="false">${esc(tr(S.word).drafts?.[step] || "")}</textarea></label>`;

function renderBody() {
  const el = $("#body");
  if (!el) return;
  const w = S.word, info = S.words[w], s = S.step;
  let html = "";
  if (s === "game") html = gameHtml(w);
  if (s === "example") {
    const ex = exampleFor(w, "example");
    html = `<p class="lead">${L(`讀這個句子，看 ${esc(w)} 在句中怎麼用。不認識的字點一下，可以存進「我的生字」。`, `Read the sentence and see how ${esc(w)} is used in context. Tap any word you don't know to save it to My saved words.`)}</p>
      <p class="sent tsent" lang="en"${tsAttr("example", w)}>${tapInner(ex.en, w)}</p>
      <div class="row">${playBtn("example", L("播放句子", "Play sentence"))}<button class="btn" data-act="zh" aria-expanded="${U.showZh}">${U.showZh ? L("收起中譯", "Hide Chinese") : L("顯示中譯", "Show Chinese")}</button></div>
      ${U.showZh ? `<p class="tr">${esc(ex.zh)}</p>` : ""}
      <div class="note"><h3>${L("使用提示", "Usage tip")}</h3><p>${esc(info.hint)}</p></div>
      <div class="note"><h3>${L("常見搭配", "Common collocations")}</h3><ul class="chips en" lang="en">${info.collocations.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      ${textarea("example", L("情境筆記（選填）：這個字讓你想到什麼情境？", "Notes (optional): what situation does this word make you think of?"), "zh-Hant", 2)}`;
  }
  if (s === "listen") {
    html = `<p class="lead">${L("播放句子，把聽到的英文寫下來。對照前不會顯示原句。", "Play the sentence and write down what you hear. The sentence stays hidden until you compare.")}</p>
      <div class="row">${playBtn("listen", U.played ? L("再聽一次", "Play again") : L("播放句子", "Play sentence"), true)}</div>
      ${speech.kind === "none" ? `<p class="msg warn">${L("這個瀏覽器無法朗讀。可以直接對照原句當閱讀練習，或按「太簡單，標記完成」。", "This browser can't read aloud right now. You can compare with the sentence as reading practice, or press \"Too easy, mark as done\".")}</p>` : ""}
      ${textarea("listen", L("聽到的句子", "What you heard"), "en")}`;
  }
  if (s === "chinese") {
    const ex = exampleFor(w, "chinese");
    html = `<p class="lead">${L("把這個英文句子翻成中文。", "Translate this sentence into Chinese.")}</p><p class="sent tsent" lang="en"${tsAttr("chinese", w)}>${tapInner(ex.en, w)}</p>
      <div class="row">${playBtn("chinese", L("播放句子", "Play sentence"))}</div>${textarea("chinese", L("中文翻譯", "Your Chinese translation"), "zh-Hant")}`;
  }
  if (s === "english") {
    const ex = exampleFor(w, "english");
    html = `<p class="lead">${L("把這個中文句子翻成英文，記得用上這個單字。", "Translate this sentence into English. Remember to use the word.")}</p><p class="sent zh">${esc(ex.zh)}</p>${textarea("english", L("英文翻譯", "Your English translation"), "en")}`;
  }
  if (s === "speak") {
    const ex = exampleFor(w, "speak");
    html = `<p class="lead">${L(`先聽示範，再自己大聲唸兩三遍，最後試著換個情境用 ${esc(w)} 說一句。`, `Listen to the example, then say it out loud two or three times. Finally, try saying your own sentence with ${esc(w)} in a different situation.`)}</p>
      <p class="sent tsent" lang="en"${tsAttr("speak", w)}>${tapInner(ex.en, w)}</p><p class="tr">${esc(ex.zh)}</p>
      <div class="row">${playBtn("speak", L("播放示範", "Play example"))}</div>
      <p class="note">${L("這裡不錄音、不評發音，唸過就自己標記完成。", "This version doesn't record or score your pronunciation. Mark this step done once you've said it aloud.")}</p>`;
  }
  if (s === "family") html = familyHtml(w);
  if (s === "write") {
    html = `<p class="lead">${L(`用 ${esc(w)}（或變化形）造一個句子，寫得具體一點。可以從下面的情境挑一個。`, `Write your own sentence with ${esc(w)} (or one of its forms) and add specific details. You can pick a situation below.`)}</p>
      <div class="note"><h3>${L("情境", "Situations")}</h3><ul style="margin:0;padding-left:1.2em">${info.writePrompts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
      <div id="hintbox"></div>
      ${textarea("write", L("造句", "Your sentence"), "en", 4)}`;
  }
  el.innerHTML = html + `<div id="msgbox"></div><div id="reveal"></div><div id="acts"></div>`;
  renderMsg();
  renderReveal();
  renderActs();
  renderHints();
  restoreCard();
  const g = $("#gtype") || $("#grecall");
  if (g) g.value = U.typed;
}

/** 字中找字的解答：列出這一關全部的小字，已找到的打勾。看解答不會算成自己找到。 */
function gameAnswersHtml(w) {
  const g = gm(w), answers = answersOf(w);
  if (!U.gameAnswers || !answers.length) return "";
  const left = answers.filter((x) => !g.found.includes(x)).length;
  return `<div class="note"><h3>${L(`解答：共 ${answers.length} 個小字${left ? `，還有 ${left} 個沒找到` : "，你全都找到了"}`, `Answers: ${answers.length} hidden words${left ? `, ${left} not found yet` : ", and you found them all"}`)}</h3>
    <ul class="chips en" lang="en">${answers.map((x) => `<li class="${g.found.includes(x) ? "used" : ""}">${g.found.includes(x) ? "✓ " : ""}${esc(x)}</li>`).join("")}</ul>
    <p class="lead">${L("看答案不算你找到的小字，自己找到的照樣可以送出。", "Looking at the answers doesn't count as finding them. You can still submit the ones you spot yourself.")}</p></div>`;
}
const gameAnswersBtn = () => `<button class="btn" data-act="gameanswers" aria-expanded="${Boolean(U.gameAnswers)}">${U.gameAnswers ? L("收起答案", "Hide answers") : L("看答案", "Show answers")}</button>`;

function gameHtml(w) {
  const g = gm(w), answers = answersOf(w), info = S.words[w];
  if (g.phase === "play" && answers.length) {
    const last = U.pick.length ? U.pick[U.pick.length - 1] : -1;
    const big = longest(g.found);
    return `<p class="lead">${L(`從 ${esc(w)} 的字母裡，由左往右挑出藏在裡面的小字（至少三個字母，可以跳過中間的字母）。`, `Find smaller words hidden in ${esc(w)}. Pick letters from left to right (at least three letters; you can skip letters in between).`)}</p>
      <div class="tiles" role="group" aria-label="${L(`${esc(w)} 的字母`, `Letters of ${esc(w)}`)}">${[...w].map((ch, i) => `<button class="tile ${U.pick.includes(i) ? "on" : ""}" data-act="tile" data-i="${i}" ${i <= last ? "disabled" : ""} aria-label="${L(`第 ${i + 1} 個字母 ${ch}`, `Letter ${i + 1}: ${ch}`)}" aria-pressed="${U.pick.includes(i)}">${ch}</button>`).join("")}</div>
      <p class="pickline" aria-live="polite">${U.pick.length ? esc(U.pick.map((i) => w[i]).join("")) : L("<em>點字母，或在下面直接輸入</em>", "<em>Tap letters, or type below</em>")}</p>
      <label class="field" for="gtype">${L("用鍵盤輸入小字", "Type a hidden word")}<input type="text" id="gtype" lang="en" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="${w.length}"></label>
      <div class="row"><button class="btn primary" data-act="sub">${L("送出", "Submit")}</button><button class="btn" data-act="undo">${L("退一格", "Back")}</button><button class="btn" data-act="clear">${L("清除", "Clear")}</button><button class="btn" data-act="hint">${L("給我提示", "Hint")}</button>${gameAnswersBtn()}</div>
      ${U.hint ? `<p class="msg ok" role="status">${L(`還有一個 ${U.hint.length} 個字母的小字，${esc(U.hint.first)} 開頭、${esc(U.hint.last)} 結尾。`, `There's a ${U.hint.length}-letter word that starts with ${esc(U.hint.first)} and ends with ${esc(U.hint.last)}.`)}</p>` : ""}
      <div class="note"><h3>${L(`已找到 ${g.found.length} 個${big ? `，最長的是 ${esc(big)}（${big.length} 個字母）` : ""}`, `Found: ${g.found.length}${big ? ` · Longest: ${esc(big)} (${big.length} letters)` : ""}`)}</h3>
        ${g.found.length ? `<ul class="chips en" lang="en">${g.found.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p class="none">${L("還沒找到小字。", "No hidden words yet.")}</p>`}</div>
      ${gameAnswersHtml(w)}
      <div class="row"><button class="btn" data-act="torecall" ${g.found.length ? "" : "disabled"}>${L("結束找字，測測記憶", "Done, test my memory")}</button>${g.found.length ? "" : `<span class="lead">${L("先找到至少一個小字。", "Find at least one hidden word first.")}</span>`}</div>`;
  }
  if (g.solved) {
    return `<p class="msg ok">${L(`拼對了：${esc(w)}。${g.found.length ? `你找到的小字：${esc(g.found.join("、"))}。` : ""}`, `Correct: ${esc(w)}.${g.found.length ? ` Hidden words you found: ${esc(g.found.join(", "))}.` : ""}`)}</p>
      ${answers.length ? `<div class="row"><button class="btn" data-act="toplay">${L("再找一次小字", "Find hidden words again")}</button>${gameAnswersBtn()}</div>${gameAnswersHtml(w)}` : ""}`;
  }
  return `<p class="lead">${answers.length ? "" : L("這個字裡沒有合適的小字，直接練拼字。", "This word has no good hidden words, so let's go straight to spelling. ")}${L("看中文意思，拼出完整的英文單字。", "Look at the Chinese meaning and spell the whole English word.")}</p>
    <p class="sent zh">${esc(info.pos)} ${esc(info.zh)}</p>
    <label class="field" for="grecall">${L("完整拼字", "Full spelling")}<input type="text" id="grecall" lang="en" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24"></label>
    <div class="row"><button class="btn primary" data-act="recall">${L("核對", "Check")}</button><button class="btn" data-act="showanswer">${L("看答案", "Show answer")}</button>${answers.length ? `<button class="btn quiet" data-act="toplay">${L("回去找字", "Back to word hunt")}</button>` : ""}</div>
    ${U.recallAnswer ? `<p class="msg warn" role="status">${L(`答案是 <span lang="en">${esc(w)}</span>。看答案不算完成，自己再拼一次。`, `The answer is <span lang="en">${esc(w)}</span>. Looking at the answer doesn't count. Spell it yourself once more.`)}</p>` : ""}`;
}

function familyHtml(w) {
  const d = S.details[w] || { forms: {}, senses: [], family: [] };
  const forms = Object.entries(FORM_LABELS).filter(([k]) => d.forms?.[k]);
  const list = (arr) => (arr?.length ? `<span lang="en">${arr.map(esc).join(L("、", ", "))}</span>` : `<span class="none">${L("未收錄", "Not listed")}</span>`);
  return `<p class="lead">${L("這個字的詞形變化、不同詞義和相關的字。", "Look at the forms of this word, its different meanings and related words.")}</p>
    <div class="note"><h3>${L("詞形變化", "Word forms")}</h3>${forms.length ? `<dl class="kv">${forms.map(([k, label]) => `<dt>${label}</dt><dd lang="en">${esc(d.forms[k])}</dd>`).join("")}</dl>` : `<p class="none">${L("未收錄", "Not listed")}</p>`}</div>
    <div class="note"><h3>${L("詞義與關聯", "Meanings, synonyms and antonyms")}</h3>${d.senses.map((sn) => `<div class="sense"><p><b style="color:var(--brand)">${esc(sn.pos)}</b> ${esc(sn.zh)}</p><dl class="kv"><dt>${L("近義詞", "Synonyms")}</dt><dd>${list(sn.synonyms)}</dd><dt>${L("反義詞", "Antonyms")}</dt><dd>${list(sn.antonyms)}</dd></dl></div>`).join("")}</div>
    <div class="note"><h3>${L("詞族", "Word family")}</h3>${d.family?.length ? `<dl class="kv">${d.family.map((f) => `<dt lang="en" style="font-family:var(--serif);color:var(--ink);font-size:1.05rem">${esc(f.word)}</dt><dd class="zh">${esc(f.pos)} ${esc(f.zh)}</dd>`).join("")}</dl>` : `<p class="none">${L("未收錄", "Not listed")}</p>`}</div>`;
}

function renderReveal() {
  const el = $("#reveal");
  if (!el) return;
  const s = S.step, w = S.word;
  if (!TEXT_STEPS.includes(s)) { el.innerHTML = ""; return; }
  const ex = exampleFor(w, s), draft = tr(w).drafts?.[s] || "";
  let h = "";
  if (U.revealed) {
    if (s === "listen") {
      const d = diffWords(ex.en, draft);
      h += `<div class="ref"><h3>${draft.trim() ? L("原句（紅色是沒寫對的字）", "Original sentence (words in red are wrong or missing)") : L("原句", "Original sentence")}</h3><p class="sent diff tsent" lang="en"${tsAttr("listen-ref", w)}>${d.words.map((x) => `<span class="${x.ok || !draft.trim() ? "" : "miss"}">${tapInner(x.word, w)}</span>`).join(" ")}</p><p class="tr">${esc(ex.zh)}</p><p class="lead" ${draft.trim() ? "" : "hidden"}>${L(`${d.total} 個字裡寫對 ${d.correct} 個${d.extra ? `，另外多寫了 ${d.extra} 個字` : ""}。`, `${d.correct} of ${d.total} words correct${d.extra ? `, plus ${d.extra} extra words` : ""}.`)}</p></div>`;
    } else if (s === "chinese") h += `<div class="ref"><h3>${L("參考譯文", "Reference translation")}</h3><p>${esc(ex.zh)}</p><p class="lead">${L("意思對、說法不同也算對，依理解程度自評。", "A different wording with the same meaning is also correct. Rate yourself on how well you understood.")}</p></div>`;
    else if (s === "english") h += `<div class="ref"><h3>${L("參考譯文", "Reference translation")}</h3><p class="sent tsent" lang="en"${tsAttr("english-ref", w)}>${tapInner(ex.en, w)}</p><div class="row">${playBtn("english", L("播放句子", "Play sentence"))}</div><p class="lead">${L("說法不同也算對，重點是這個字有沒有用對。", "Other reasonable wordings are also correct. What matters is whether you used the word correctly.")}</p></div>`;
    else h += `<div class="ref"><h3>${L("用法參考（不是唯一答案）", "Usage example (not the only answer)")}</h3><p class="sent tsent" lang="en"${tsAttr(s + "-ref", w)}>${tapInner(ex.en, w)}</p><p class="tr">${esc(ex.zh)}</p></div>`;
  }
  el.innerHTML = h;
  restoreCard();
}

function renderActs() {
  const el = $("#acts");
  if (!el) return;
  const w = S.word, s = S.step, t = tr(w), done = t.done?.[s];
  let html = "";
  if (TEXT_STEPS.includes(s)) {
    const draft = t.drafts?.[s] || "";
    const speechOk = speech.kind !== "none";
    const empty = !draft.trim();
    let row = "";
    if (!U.revealed) {
      // 參考答案不必先作答就能看；聽寫仍要先播放完一次
      const need = s === "listen" && speechOk && !U.played ? L("先把句子聽完一次。", "Play the sentence once first.") : "";
      const label = { listen: L("對照原句", "Compare with the sentence"), chinese: L("對照參考譯文", "Compare with reference"), english: L("對照參考譯文", "Compare with reference"), write: L("看用法參考", "See usage example") }[s];
      row += `<button class="btn primary" data-act="reveal" ${need ? "disabled" : ""}>${label}</button>${need ? `<span class="lead">${need}</span>` : ""}`;
    }
    if (row) html += `<div class="row">${row}</div>`;
    if (U.revealed && !empty) {
      const ok = canRate(s, { draft, revealed: U.revealed, played: U.played, speechAvailable: speechOk });
      const chosen = t.ratings?.[s];
      html += `<p class="lead">${L("對照之後，這題做得如何？", "After comparing, how did you do?")}</p><div class="rate" role="group" aria-label="${L("自評", "Self-rating")}">${RATINGS.map((r, i) => `<button class="btn ${chosen === i ? "primary" : ""}" data-act="rate" data-r="${i}" ${ok ? "" : "disabled"}>${r}</button>`).join("")}</div>`;
    }
    if (done && !t.manual?.[s] && t.ratings?.[s] != null) html += `<p class="doneline">${L(`✓ 已完成，自評：${RATINGS[t.ratings[s]]}。改了答案可以重新對照，再評一次。`, `✓ Done. Your rating: ${RATINGS[t.ratings[s]]}. If you change your answer, you can compare and rate yourself again.`)}</p>`;
  } else if (s !== "game" && !done) {
    html += `<div class="row"><button class="btn primary" data-act="confirm">${L("完成這項", "I've done this step")}</button></div>`;
  } else if (s !== "game" && done && !t.manual?.[s]) html += `<p class="doneline">${L("✓ 已完成，隨時可以重練。", "✓ Done. You can practise again any time.")}</p>`;
  if (done && t.manual?.[s]) html += `<p class="doneline">${L("✓ 已標記完成，沒有作答紀錄。隨時可以重練。", "✓ Marked as done (no answer saved). You can practise again any time.")}</p>`;
  el.innerHTML = html;
}

function renderFoot() {
  const el = $("#foot");
  if (!el) return;
  const t = tr(S.word), done = t.done?.[S.step], all = isWordComplete(t);
  const fullWords = S.day.wordIds.filter((w) => isWordComplete(tr(w))).length;
  let hatch = "";
  if (all && !S.plain && !masked()) {
    const m = monsterOf(S.word), total = Object.keys(S.game.hatched).length;
    const fresh = U.justHatched === S.word;
    if (fresh) U.justHatched = null; // 孵化動畫只播一次
    const svg = monsterHtml(S.word, 56, { label: L(`${S.word} 的怪獸`, `Monster for ${S.word}`) }).replace('class="mon', `class="mon${fresh ? " pop" : ""}`);
    hatch = `<span class="hatch">${svg}<span>${fresh ? L(`孵化了！你的第 ${total} 隻怪獸，${m.el.label}屬性。之後複習通過就會進化。`, `It hatched! This is monster number ${total}, ${m.el.label} type. Pass later reviews to help it evolve.`) : L(`這個字的八項都完成了，怪獸已孵化（${STAGE_LABELS[m.stage]}）。`, `All eight steps are done for this word, and its monster has hatched (${STAGE_LABELS[m.stage]}).`)}${fullWords === 10 ? L("今天十個字都完成了，想重練隨時可以。", " All 10 of today's words are done. You can still go back and practise.") : ""}</span></span>`;
  } else if (all) hatch = `<span>${L("這個字的八項都完成了。", "All eight steps are done for this word.")}${fullWords === 10 ? L("今天十個字都完成了，想重練隨時可以。", " All 10 of today's words are done. You can still go back and practise.") : ""}</span>`;
  el.innerHTML = `
    ${all ? `<div class="banner">${hatch}<button class="btn primary" data-act="nextword">${L("完成，下一個字", "Done, next word")}</button></div>` : ""}
    <div class="foot">
      <div class="row">${done ? "" : `<button class="btn" data-act="manual">${L("太簡單，標記完成", "Too easy, mark as done")}</button>`}</div>
      <div class="row"><button class="btn" data-act="nextstep">${L("下一項練習", "Next step")}</button><button class="btn" data-act="nextword">${L("暫停這個字，換下一個", "Leave this word for now")}</button></div>
    </div>`;
}

function renderCourse() {
  const el = $("#course");
  if (!el) return;
  const groups = S.course.advanced, now = groupIndex(S.date, S.course.startDate, groups.length);
  el.innerHTML = `<details class="course" ${S.courseOpen ? "open" : ""}><summary>${L(`課表：IELTS 進階 ${groups.length} 天`, `Course plan: IELTS advanced, ${groups.length} days`)}</summary>
    <p class="lead" style="margin-top:8px">${L(`這是預排的順序。到期複習和換字會改變實際菜單，不一定剛好 ${groups.length} 天學完 ${Object.keys(S.words).length} 個字。`, `This is the planned order. Your actual word list changes with due reviews and swaps, so covering all ${Object.keys(S.words).length} words may not take exactly ${groups.length} days.`)}</p>
    <div class="groups">${groups.map((g, i) => `<div class="group ${i === now ? "now" : ""}"><h3>${L(`第 ${String(i + 1).padStart(2, "0")} 組`, `Set ${String(i + 1).padStart(2, "0")}`)}${i === now ? L("（這一天）", " (this day)") : ""}</h3><p lang="en">${g.map(esc).join(" · ")}</p><div><button class="btn small" data-act="group" data-g="${i}">${L("開啟這天的訓練菜單", "Open this day's word list")}</button></div></div>`).join("")}</div>
  </details>`;
}

/* ---------- 我的單字庫 ---------- */
const CATS = TOPIC_NAMES;
// 分類名稱是單字資料裡的鍵，不能改；英文介面只在顯示時換成英文名稱。
const CAT_EN = Object.fromEntries(Object.entries(ELEMENTS).map(([c, e]) => [c, e.full]));
const catName = (c) => L(c, CAT_EN[c] || c);
const POS = [["n.", L("名詞", "Noun")], ["v.", L("動詞", "Verb")], ["adj.", L("形容詞", "Adjective")], ["adv.", L("副詞", "Adverb")]];
const latestRating = (dayMap) => { const d = Object.keys(dayMap || {}).sort().pop(); return d ? { date: d, rating: dayMap[d] } : null; };

/** 已練習：有理解或造句的作答，或在單字詳情開啟、練寫過。待加強：理解或造句最近一次評分低於「能獨立完成」。 */
function wordStatus(w) {
  const h = S.schedule.h?.[w];
  const m = latestRating(h?.meaning), u = latestRating(h?.usage);
  if ((m && m.rating < 2) || (u && u.rating < 2)) return "weak";
  return m || u || S.bankIdx[w] ? "done" : "new";
}
const STATUS_LABEL = { new: L("未練習", "New"), done: L("已練習", "Practised"), weak: L("待加強", "Needs work") };

function bankFiltered() {
  const q = B.q.trim().toLowerCase();
  return Object.values(S.words).filter((x) => {
    if (q && !x.word.includes(q) && !x.zh.toLowerCase().includes(q)) return false;
    if (B.cat && x.category !== B.cat) return false;
    if (B.pos && !x.pos.split(" / ").includes(B.pos)) return false;
    if (B.status) { const st = wordStatus(x.word); if (B.status === "done" ? st === "new" : st !== B.status) return false; }
    return true;
  });
}

function renderBank() {
  if (B.detail) return renderDetail();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`;
  $("#main").innerHTML = `
    <section class="card" aria-label="${L("自選十詞", "Pick your own 10")}"><div id="bpick"></div></section>
    <section class="card" style="margin-top:18px" aria-label="${L("單字庫", "Word bank")}">
      <div class="menuhead"><h2 class="sec">${L("單字庫", "Word bank")}</h2>
        ${S.plain ? "" : `<div class="viewsw" role="group" aria-label="${L("顯示方式", "View")}">${[["list", L("清單", "List")], ["dex", L("怪獸圖鑑", "Monster collection")]].map(([v, l]) => `<button class="navb" data-act="bview" data-v="${v}" ${B.view === v ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</div>`}</div>
      ${B.view === "dex" && !S.plain ? collectHtml() : ""}
      <div class="filters">
        <label class="field" for="bq">${L("搜尋英文或中文", "Search in English or Chinese")}<input type="text" id="bq" value="${esc(B.q)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="field" for="bcat">${L("分類", "Category")}<select id="bcat">${opt("", L("全部分類", "All categories"), B.cat)}${CATS.map((c) => opt(c, catName(c), B.cat)).join("")}</select></label>
        <label class="field" for="bpos">${L("詞性", "Part of speech")}<select id="bpos">${opt("", L("全部詞性", "All parts of speech"), B.pos)}${POS.map(([v, l]) => opt(v, l, B.pos)).join("")}</select></label>
        <label class="field" for="bstatus">${L("學習狀態", "Status")}<select id="bstatus">${opt("", L("全部", "All"), B.status)}${opt("new", STATUS_LABEL.new, B.status)}${opt("done", STATUS_LABEL.done, B.status)}${opt("weak", STATUS_LABEL.weak, B.status)}</select></label>
      </div>
      <p class="lead">${L("「已練習」：做過英翻中或自主造句的自評，或在單字詳情開啟、練寫過；只按「太簡單，標記完成」不算。「待加強」：最近一次自評還不到「能獨立完成」。", "\"Practised\" means you rated yourself on To Chinese or Your sentence, or opened the word's details or wrote with it there. Just pressing \"Too easy, mark as done\" doesn't count. \"Needs work\" means your latest rating was below \"Can do it alone\".")}</p>
      <div id="bres"></div>
      <label class="field inline" style="margin-top:14px" for="plain"><input type="checkbox" id="plain" ${S.plain ? "checked" : ""}> ${L("簡潔模式：不顯示怪獸與圖鑑（只影響這個瀏覽器）", "Simple mode: hide monsters and the monster collection (this browser only)")}</label>
    </section>
    <section class="card" style="margin-top:18px" id="mywords" aria-label="${L("我的生字", "My saved words")}"></section>`;
  renderPick(); renderBankResults(); renderMyWords();
}

/** 圖鑑格：怪獸、單字、階段；withTag 時加屬性標籤。未遇見的畫剪影。 */
function dexItem(w, withTag) {
  const m = monsterOf(w), unseen = m.stage === "unseen";
  return `<li><button data-act="bdetail" data-w="${esc(w)}" aria-label="${L(`${esc(w)}，${STAGE_LABELS[m.stage]}${m.wild ? "，逃走中" : ""}`, `${esc(w)}, ${STAGE_LABELS[m.stage]}${m.wild ? ", ran off" : ""}`)}">${monsterHtml(w, 64, { silhouette: unseen })}<span class="dw ${unseen ? "unseen" : ""}" lang="en">${esc(w)}</span><span class="ds">${m.wild ? L("逃走中", "Ran off") : STAGE_LABELS[m.stage]}</span>${withTag ? topicTag(S.words[w]?.category) : ""}</button></li>`;
}

/** 收集進度：各階段幾隻。 */
function collectHtml() {
  const c = { hatchling: 0, adult: 0, final: 0, wild: 0 };
  for (const w of Object.keys(S.game.hatched)) { if (!S.words[w]) continue; const m = monsterOf(w); c[m.stage] = (c[m.stage] || 0) + 1; if (m.wild) c.wild++; }
  const total = c.hatchling + c.adult + c.final;
  return `<div class="collect" role="status"><span>${L("已孵化", "Hatched")} <b>${total}</b> / ${Object.keys(S.words).length}</span><span>${L("幼獸", "Baby")} <b>${c.hatchling}</b></span><span>${L("成獸", "Grown-up")} <b>${c.adult}</b></span><span>${L("完全體", "Final form")} <b>${c.final}</b></span><span>${L("逃走中", "Ran off")} <b>${c.wild}</b></span><span>${L("連續", "Streak")} <b>${streakNow(S.game.streak, S.today)}</b> ${L("天", "days")}${S.game.streak?.best ? L(`（最長 ${S.game.streak.best}）`, ` (best ${S.game.streak.best})`) : ""}</span><span>${L("徽章", "Badges")} <b>${badgeCount()}</b> / ${BADGES.length}</span></div>`;
}

function renderBankResults() {
  const el = $("#bres");
  if (!el) return;
  const all = bankFiltered(), pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  B.page = Math.min(B.page, pages - 1);
  const rows = all.slice(B.page * PAGE_SIZE, (B.page + 1) * PAGE_SIZE);
  if (!all.length) {
    el.innerHTML = `<div class="center"><p>${L("沒有符合條件的單字。", "No words match.")}</p><button class="btn" data-act="bclear">${L("清除所有條件", "Clear all filters")}</button></div>`;
    return;
  }
  const pager = pages > 1 ? `<div class="pager" role="navigation" aria-label="${L("分頁", "Pages")}"><button class="btn small" data-act="bpage" data-n="${B.page - 1}" ${B.page === 0 ? "disabled" : ""}>${L("上一頁", "Previous")}</button><span>${L(`第 ${B.page + 1} / ${pages} 頁`, `Page ${B.page + 1} of ${pages}`)}</span><button class="btn small" data-act="bpage" data-n="${B.page + 1}" ${B.page >= pages - 1 ? "disabled" : ""}>${L("下一頁", "Next")}</button></div>` : "";
  if (B.view === "dex" && !S.plain) {
    el.innerHTML = `<p class="count" role="status">${L(`符合 ${all.length} 個字`, `${all.length} words`)}</p>
      <ul class="dex">${rows.map((x) => dexItem(x.word, true)).join("")}</ul>${pager}`;
    return;
  }
  el.innerHTML = `<p class="count" role="status">${L(`符合 ${all.length} 個字`, `${all.length} words`)}</p>
    <ul class="rows">${rows.map((x) => { const st = wordStatus(x.word); return `<li>
      <input type="checkbox" id="pk-${esc(x.word)}" data-pickw="${esc(x.word)}" ${B.pick.includes(x.word) ? "checked" : ""} aria-label="${L(`把 ${esc(x.word)} 加入自選十詞`, `Add ${esc(x.word)} to your 10 picks`)}">
      <button class="rowmain" data-act="bdetail" data-w="${esc(x.word)}"><span class="rw" lang="en">${esc(x.word)}</span><span class="rz"><b>${esc(x.pos)}</b> ${esc(x.zh)}</span></button>
      <span class="rmeta">${esc(catName(x.category))}</span><span class="badge ${st}">${STATUS_LABEL[st]}</span></li>`; }).join("")}</ul>${pager}`;
}

/* 自選十詞 */
function savePick() { try { localStorage.setItem(store.prefix + "pick", JSON.stringify(B.pick)); } catch { /* 只是方便下次接續，存不了也沒關係 */ } }
function togglePick(w, on) {
  B.msg = null;
  if (on && !B.pick.includes(w)) {
    if (B.pick.length >= 10) { B.msg = { kind: "warn", text: L("最多只能選十個字，先移除一個再加入。", "You can pick up to 10 words. Remove one before adding another.") }; const cb = document.getElementById("pk-" + w); if (cb) cb.checked = false; return renderPick(); }
    B.pick.push(w);
  } else if (!on) B.pick = B.pick.filter((x) => x !== w);
  savePick(); renderPick();
  const cb = document.getElementById("pk-" + w);
  if (cb) cb.checked = B.pick.includes(w);
}
function fillPick() {
  for (const x of bankFiltered()) { if (B.pick.length >= 10) break; if (!B.pick.includes(x.word)) B.pick.push(x.word); }
  B.msg = B.pick.length < 10 ? { kind: "warn", text: L(`篩選結果不夠補到十個，目前 ${B.pick.length} 個。放寬條件後再補一次。`, `Not enough matching words to reach 10 (you have ${B.pick.length}). Loosen the filters and try again.`) } : null;
  savePick(); renderPick(); renderBankResults();
}
async function applyPick() {
  const d = B.applyDate;
  if (B.pick.length !== 10 || !isValidDate(d)) return;
  const { data } = await store.load(dayKey(d));
  if (data && isValidMenu(data.wordIds, known()) && data.wordIds.some((w) => isProtected(data.training?.[w], data.game?.[w]))) {
    B.msg = { kind: "bad", text: L(`${d} 已經有練習紀錄或草稿，不能整份換掉，請選其他日期。`, `${d} already has practice or drafts saved, so its word list can't be replaced. Please choose another date.`) };
    return renderPick();
  }
  try {
    await store.patch(dayKey(d), { date: d, level: "custom", wordIds: [...B.pick], swapped: [] }, { wait: true });
  } catch { B.msg = { kind: "bad", text: L("儲存失敗，請再試一次。", "Couldn't save. Please try again.") }; return renderPick(); }
  B.pick = []; B.msg = null; savePick();
  toast(L(`已把自選的十個字套用到 ${d}。`, `Your 10 words are now set for ${d}.`));
  openDate(d, d !== S.today);
}
function renderPick() {
  const el = $("#bpick");
  if (!el) return;
  const n = B.pick.length;
  el.innerHTML = `<h2 class="sec">${L("自選十詞", "Pick your own 10")}</h2>
    <p class="lead">${L("在下面的清單勾選想練的字，滿十個就能套用到某一天。", "Tick the words you want to practise in the list below. Once you have 10, you can use them as the word list for any day.")}</p>
    <p role="status"><b>${L(`已選 ${n} / 10`, `Picked ${n} / 10`)}</b></p>
    ${n ? `<ul class="chips en">${B.pick.map((w) => `<li><span lang="en">${esc(w)}</span> <button class="x" data-act="unpick" data-w="${esc(w)}" aria-label="${L(`移除 ${esc(w)}`, `Remove ${esc(w)}`)}">×</button></li>`).join("")}</ul>` : ""}
    <div class="row" style="margin-top:8px">
      <button class="btn" data-act="fillpick" ${n >= 10 ? "disabled" : ""}>${L("從篩選結果補足十詞", "Fill up to 10 from results")}</button>
      <label class="field inline" for="bdate">${L("套用日期", "Date")}<input type="date" id="bdate" value="${esc(B.applyDate || S.date)}"></label>
      <button class="btn primary" data-act="applypick" ${n === 10 ? "" : "disabled"}>${L("套用到這一天", "Use for this day")}</button>
      ${n === 10 ? "" : `<span class="lead">${L("要剛好十個字才能套用。", "You need exactly 10 words.")}</span>`}
    </div>
    ${B.msg ? `<p class="msg ${B.msg.kind}" role="status" style="margin-top:8px">${esc(B.msg.text)}</p>` : ""}`;
}

/* 單字詳情 */
async function openDetail(w) {
  speech.stop();
  B.detail = w; B.wd = null; B.writeDraft = "";
  renderAll();
  window.scrollTo(0, 0);
  const { data } = await store.load("wd_" + w);
  if (B.detail !== w) return;
  const opens = (data?.opens || 0) + 1;
  B.wd = { opens, writes: data?.writes || {} };
  renderDetail();
  S.bankIdx[w] = 1;
  store.patch("wd_" + w, { opens, lastOpen: new Date().toISOString() }).catch(() => {});
  store.patch("bankidx", { p: { [w]: 1 } }).catch(() => {});
}

async function saveWriting() {
  const w = B.detail, text = B.writeDraft.trim();
  if (!w || !text || !B.wd) return;
  const id = uuid(), ev = { text, time: new Date().toISOString() };
  try { await store.patch("wd_" + w, { writes: { [id]: ev } }, { wait: true }); }
  catch { return toast(L("儲存失敗，內容還在輸入框裡，請再試一次。", "Couldn't save. Your text is still in the box. Please try again.")); }
  B.wd.writes[id] = ev; B.writeDraft = "";
  renderDetail();
}

const fmtTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${localToday(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function renderDetail() {
  const w = B.detail, x = S.words[w], h = S.schedule.h?.[w];
  const tomorrow = addDays(S.today, 1);
  const modeLine = (label, map) => {
    const l = latestRating(map);
    return `<dt>${label}</dt><dd class="zh">${l ? L(`${RATINGS[l.rating]}（${l.date}），下次複習 ${nextReviewDate(map, tomorrow)}`, `${RATINGS[l.rating]} (${l.date}), next review ${nextReviewDate(map, tomorrow)}`) : `<span class="none">${L("尚未作答", "Not answered yet")}</span>`}</dd>`;
  };
  const writes = B.wd ? Object.values(B.wd.writes).sort((a, b) => (a.time < b.time ? 1 : -1)) : [];
  $("#main").innerHTML = `<section class="card body" aria-label="${L("單字詳情", "Word details")}">
    <div class="row"><button class="btn" data-act="bback">${S.page === "collection" ? L("‹ 回到收藏", "‹ Back to collection") : L("‹ 回到單字庫", "‹ Back to word bank")}</button><span class="badge ${wordStatus(w)}">${STATUS_LABEL[wordStatus(w)]}</span></div>
    ${S.plain ? "" : `<div class="note dexcard">${monsterHtml(w, 128, { silhouette: monsterOf(w).stage === "unseen", label: L(`${w} 的怪獸`, `Monster for ${w}`) })}${monsterMeta(w)}</div>`}
    <div class="head"><div><h2 class="hw" lang="en">${esc(w)}</h2><p class="gloss"><b>${esc(x.pos)}</b>${esc(x.zh)}</p></div>
      <div class="row"><span class="phon" lang="en">${x.phonetic ? "/" + esc(x.phonetic) + "/" : ""}</span><button class="btn small" data-act="bsay" data-t="word">${L("▶ 聽發音", "▶ Listen")}</button></div></div>
    <div class="note"><h3>${L("基本例句", "Example sentence")}</h3><p class="sent tsent" lang="en"${tsAttr("detail-ex", w)}>${tapInner(x.example.en, w)}</p><p class="tr">${esc(x.example.zh)}</p>
      <div class="row"><button class="btn small" data-act="bsay" data-t="ex">${L("▶ 播放例句", "▶ Play example")}</button></div>
      <details style="margin-top:6px"><summary class="lead">${L("資料來源", "Sources")}</summary><p class="lead">${L("例句與中文翻譯：詞習自編練習例句（由 AI 撰寫，經程式檢查，未經專業編輯逐句審校）。音標與詞形變化：ECDICT（MIT 授權，作者 Linwei）。", "Example sentences and Chinese translations: Lexi's own practice sentences (written by AI and checked by a program, but not reviewed one by one by an editor). Phonetics and word forms: ECDICT (MIT license, by Linwei).")}</p></details></div>
    <div class="note"><h3>${L("使用提示", "Usage tip")}</h3><p>${esc(x.hint)}</p></div>
    <div class="note"><h3>${L("常見搭配", "Common collocations")}</h3><ul class="chips en" lang="en">${x.collocations.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
    ${familyHtml(w).replace(/^<p class="lead">[^<]*<\/p>/, "")}
    <div class="note"><h3>${L("作答狀況", "Your answers")}</h3><dl class="kv">${modeLine(L("詞義理解", "Meaning"), h?.meaning)}${modeLine(L("造句運用", "Usage"), h?.usage)}</dl></div>
    <div class="note"><h3>${L("自由練寫", "Free writing")}</h3>
      <p class="lead">${B.wd ? L(`開啟 ${B.wd.opens} 次，練寫 ${writes.length} 次。`, `Opened ${B.wd.opens} times, written ${writes.length} times. `) : L("正在讀取這個字的紀錄…", "Loading this word's history… ")}${L("練拼字或隨手造句都行，每次儲存算一筆。", "Practise the spelling or write any sentence. Each save is kept as a separate entry.")}</p>
      <label class="field" for="bwrite">${L("這次的練寫", "Your writing")}<textarea id="bwrite" rows="3" maxlength="${MAX_TEXT}" lang="en" spellcheck="false">${esc(B.writeDraft)}</textarea></label>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-act="bsave" ${B.wd && B.writeDraft.trim() ? "" : "disabled"}>${L("儲存", "Save")}</button></div>
      ${writes.length ? `<ol class="errs">${writes.map((e) => `<li><p class="errhead"><span>${esc(fmtTime(e.time))}</span></p><p lang="en" style="overflow-wrap:anywhere">${esc(e.text)}</p></li>`).join("")}</ol>` : B.wd ? `<p class="none" style="margin-top:8px">${L("還沒有練寫紀錄。", "Nothing written yet.")}</p>` : ""}
    </div></section>`;
  restoreCard();
}

/* ---------- 收藏 ---------- */
const STAGE_RANK = { final: 4, adult: 3, hatchling: 2, egg: 1, unseen: 0 };
const monRank = (m) => STAGE_RANK[m.stage] - (m.wild ? 0.5 : 0);
/** 每個屬性的收藏統計；best 是展示用的代表（階段最高、最近孵化、沒逃走優先）。 */
function topicStats() {
  const mk = () => ({ total: 0, hatched: 0, hatchling: 0, adult: 0, final: 0, wild: 0, best: null });
  const by = {};
  for (const c of TOPIC_NAMES) by[c] = mk();
  for (const [w, x] of Object.entries(S.words)) {
    const t = by[x.category] || (by[x.category] = mk());
    t.total++;
    if (!S.game.hatched[w]) continue;
    const m = monsterOf(w);
    t.hatched++; t[m.stage] = (t[m.stage] || 0) + 1; if (m.wild) t.wild++;
    const r = monRank(m);
    if (!t.best || r > t.best.r || (r === t.best.r && m.hatched > t.best.date)) t.best = { word: w, r, date: m.hatched };
  }
  return by;
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
/** 顯示用百分比：不到 10% 時留一位小數，才看得出 1 / 2000 的差別。 */
const pctText = (a, b) => { const v = b ? (a / b) * 100 : 0; return (v > 0 && v < 10 ? v.toFixed(1) : Math.round(v)) + "%"; };
const pbar = (now, goal, cls = "") => `<span class="pbar ${cls}" role="progressbar" aria-valuenow="${now}" aria-valuemin="0" aria-valuemax="${goal}"><i style="width:${now > 0 ? Math.max(1, pct(now, goal)) : 0}%"></i></span>`;

/** 某個屬性的全部怪獸：階段高的在前，再依孵化日期新到舊，沒遇見的剪影排最後。 */
function topicDexHtml(c, t) {
  const rows = Object.keys(S.words).filter((w) => S.words[w].category === c).map((w) => ({ w, m: monsterOf(w) }))
    .sort((a, b) => (monRank(b.m) - monRank(a.m)) || ((b.m.hatched || "") > (a.m.hatched || "") ? 1 : (b.m.hatched || "") < (a.m.hatched || "") ? -1 : 0) || a.w.localeCompare(b.w));
  return `<div class="topicdex" id="topicdex"><div class="menuhead"><h3>${topicTag(c, ELEMENTS[c].full)} <span class="lead">${L(`已孵化 ${t.hatched} / ${t.total}`, `${t.hatched} / ${t.total} hatched`)}</span></h3><button class="btn small" data-act="ctopic" data-c="${esc(c)}">${L("收合", "Collapse")}</button></div>
    <ul class="dex">${rows.map((x) => dexItem(x.w, false)).join("")}</ul></div>`;
}

function renderCollection() {
  if (B.detail) return renderDetail();
  const plainBox = `<label class="field inline" style="margin-top:14px" for="plain"><input type="checkbox" id="plain" ${S.plain ? "checked" : ""}> ${L("簡潔模式：不顯示怪獸與圖鑑（只影響這個瀏覽器）", "Simple mode: hide monsters and the monster collection (this browser only)")}</label>`;
  if (S.plain) {
    $("#main").innerHTML = `<section class="card" aria-label="${L("收藏", "Collection")}"><h2 class="sec">${L("收藏", "Collection")}</h2>
      <p class="lead">${L("簡潔模式開著，怪獸收藏先不顯示；連續天數與徽章照常。", "Simple mode is on, so the monster collection is hidden. Streak and badges still show.")}</p>
      <div class="collect" role="status"><span>${L("已孵化", "Hatched")} <b>${Object.keys(S.game.hatched).filter((w) => S.words[w]).length}</b> / ${Object.keys(S.words).length}</span><span>${L("連續", "Streak")} <b>${streakNow(S.game.streak, S.today)}</b> ${L("天", "days")}${S.game.streak?.best ? L(`（最長 ${S.game.streak.best}）`, ` (best ${S.game.streak.best})`) : ""}</span></div>${badgesHtml(true)}${plainBox}</section>`;
    return;
  }
  const by = topicStats(), total = Object.keys(S.words).length;
  const sum = (k) => Object.values(by).reduce((a, t) => a + t[k], 0);
  const hatched = sum("hatched"), c = { hatchling: sum("hatchling"), adult: sum("adult"), final: sum("final"), wild: sum("wild") };
  const streak = streakNow(S.game.streak, S.today);
  const recent = Object.entries(S.game.hatched).filter(([w]) => S.words[w]).sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0].localeCompare(b[0]))).slice(0, 12);
  $("#main").innerHTML = `
    <section class="card" aria-label="${L("收藏", "Collection")}">
      <h2 class="sec">${L("收藏", "Collection")}</h2>
      <div class="prog"><div class="progline"><b>${L(`已孵化 ${hatched} / ${total} 隻`, `${hatched} / ${total} hatched`)}</b><span>${pctText(hatched, total)}</span></div>${pbar(hatched, total)}</div>
      <div class="collect" role="status"><span>${L("幼獸", "Baby")} <b>${c.hatchling}</b></span><span>${L("成獸", "Grown-up")} <b>${c.adult}</b></span><span>${L("完全體", "Final form")} <b>${c.final}</b></span><span>${L("逃走中", "Ran off")} <b>${c.wild}</b></span><span>${L("連續", "Streak")} <b>${streak}</b> ${L("天", "days")}${S.game.streak?.best ? L(`（最長 ${S.game.streak.best}）`, ` (best ${S.game.streak.best})`) : ""}</span><span>${L("徽章", "Badges")} <b>${badgeCount()}</b> / ${BADGES.length}</span></div>
      ${recent.length ? `<h3 class="sub">${L("最近孵化", "Recently hatched")}</h3><ul class="recent">${recent.map(([w, d]) => `<li><button data-act="bdetail" data-w="${esc(w)}" aria-label="${L(`${esc(w)}，孵化 ${esc(d)}`, `${esc(w)}, hatched ${esc(d)}`)}">${monsterHtml(w, 48)}<b lang="en">${esc(w)}</b><span>${esc(d.slice(5))}</span></button></li>`).join("")}</ul>` : `<p class="lead">${L("還沒有孵化任何怪獸。到每日訓練把一個字的八項做完，第一隻就會出現在這裡。", "No monsters hatched yet. Finish all eight steps for one word in Daily practice and the first one will appear here.")}</p>`}
    </section>
    <section class="card" style="margin-top:18px" aria-label="${L("屬性收藏", "Collection by topic")}">
      <h2 class="sec">${L("十二種屬性", "Twelve topics")}</h2>
      <p class="lead">${L("每種屬性各自的收藏進度。點一種屬性，看它的全部怪獸；還沒遇見的是剪影。", "Progress for each topic. Pick a topic to see all its monsters. The ones you haven't met are silhouettes.")}</p>
      <ul class="topics">${TOPIC_NAMES.map((k) => { const t = by[k], el = ELEMENTS[k], open = C.topic === k; return `<li><button data-act="ctopic" data-c="${esc(k)}" aria-expanded="${open}" aria-controls="topicdex">${t.best ? monsterHtml(t.best.word, 48) : eggSvg({ cracks: 0, category: k, size: 48 })}<span class="tn">${topicTag(k, el.full)}</span><span class="tc">${t.hatched} / ${t.total}${t.final ? L(` · 完全體 ${t.final}`, ` · final ${t.final}`) : ""}${t.wild ? L(` · 逃走 ${t.wild}`, ` · ran off ${t.wild}`) : ""}</span>${pbar(t.hatched, t.total, "el-" + el.id)}</button></li>`; }).join("")}</ul>
      ${C.topic && by[C.topic] ? topicDexHtml(C.topic, by[C.topic]) : ""}
    </section>
    <section class="card" style="margin-top:18px" aria-label="${L("徽章", "Badges")}">${badgesHtml(true)}${plainBox}</section>`;
}

/* ---------- 學習紀錄 ---------- */
function recordDates() {
  const set = new Set();
  for (const h of Object.values(S.schedule.h || {})) for (const m of ["meaning", "usage"]) for (const d of Object.keys(h[m] || {})) set.add(d);
  return [...set].sort().reverse();
}

async function loadRecords() {
  if (R.busy) return;
  R.busy = true;
  const need = recordDates().slice(0, R.shown).filter((d) => !R.loaded[d] || d === S.today);
  await Promise.all(need.map(async (d) => { const { data } = await store.load("att_" + d); R.loaded[d] = Object.values(data?.items || {}); }));
  R.busy = false;
  if (S.page === "records") renderRecords();
}

function renderRecords() {
  const dates = recordDates(), shown = dates.slice(0, R.shown);
  const items = shown.flatMap((d) => R.loaded[d] || []).sort((a, b) => (a.time < b.time ? 1 : -1));
  const pending = shown.some((d) => !R.loaded[d]);
  const mode = { meaning: L("詞義理解", "Meaning"), usage: L("造句運用", "Usage") };
  let body;
  if (!dates.length) body = `<div class="center"><p>${L("還沒有作答紀錄。在每日訓練做完英翻中或自主造句的自評，就會記在這裡。", "No answers yet. After you rate yourself on To Chinese or Your sentence in Daily practice, they'll appear here.")}</p><button class="btn primary" data-act="page" data-p="daily">${L("去做今天的練習", "Go to today's practice")}</button></div>`;
  else if (pending && !items.length) body = `<div class="center"><p>${L("正在讀取紀錄…", "Loading history…")}</p></div>`;
  else body = `<ol class="recs">${items.map((a) => `<li>
      <p class="errhead"><b lang="en">${esc(a.wordId)}</b><span>${mode[a.mode] || ""} · ${L("作答", "Answered")} ${esc(a.practiceDate)}${a.menuDate !== a.practiceDate ? ` · ${L("菜單", "Word list")} ${esc(a.menuDate)}` : ""}</span></p>
      <p><span class="badge ${a.rating === 2 ? "done" : "weak"}">${L("自評：", "Your rating: ")}${RATINGS[a.rating] ?? ""}</span></p>
      <p class="tr" style="overflow-wrap:anywhere">${esc(a.answer)}</p>
      <div><button class="btn small" data-act="goattempt" data-d="${esc(a.menuDate)}" data-w="${esc(a.wordId)}" data-m="${esc(a.mode)}">${L("回到這一天的練習", "Go to this day's practice")}</button></div></li>`).join("")}</ol>
      ${dates.length > R.shown ? `<div class="row" style="margin-top:12px"><button class="btn" data-act="rmore" ${R.busy ? "disabled" : ""}>${L("載入更早的紀錄", "Load older history")}</button></div>` : ""}`;
  $("#main").innerHTML = `<section class="card" aria-label="${L("學習紀錄", "History")}"><h2 class="sec">${L("學習紀錄", "History")}</h2>
    <p class="lead">${L("怪獸與徽章的收集進度在", "Monster and badge progress is on the ")}<button class="btn small" data-act="page" data-p="collection">${L("收藏", "Collection")}</button>${L("頁。", " page.")}</p>
    <p class="lead">${L("作答並自評過的題目，由新到舊。英翻中記為詞義理解，自主造句記為造句運用。只按「太簡單，標記完成」的不會出現在這裡。", "These are the questions you answered and rated yourself on, newest first. To Chinese counts as Meaning, and Your sentence counts as Usage. Steps you only marked with \"Too easy, mark as done\" have no answer, so they don't appear here.")}</p>${body}</section>`;
}
