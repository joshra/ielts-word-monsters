// 深層合併：物件遞迴合併，其餘（含陣列）整個取代。與雲端資料庫 update 的語意一致。
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function deepMerge(base, patch) {
  if (!isObj(patch)) return patch;
  const out = isObj(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) ? deepMerge(out[k], v) : v;
  return out;
}
