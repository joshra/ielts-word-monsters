// 日期工具：一律以「裝置當地日期」的 YYYY-MM-DD 字串運算，不經過 UTC 時間換算。
const pad = (n) => String(n).padStart(2, "0");

export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function toDayNumber(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function fromDayNumber(n) {
  const t = new Date(n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const addDays = (s, n) => fromDayNumber(toDayNumber(s) + n);
export const dayDiff = (a, b) => toDayNumber(a) - toDayNumber(b);
