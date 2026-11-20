// 儲存層：進度只存在這個瀏覽器的 localStorage，不上傳到任何地方。
import { deepMerge } from "./core/merge.js";

const LS = "lexi:v1:local:";

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(LS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function createStore(onStatus = () => {}) {
  // 請瀏覽器不要自動清掉這個網站的資料；被拒絕也照常使用
  try { navigator.storage?.persist?.(); } catch { /* 不支援就略過 */ }
  let localOk = true;
  const report = () => onStatus({ localOk });
  report();

  return {
    /** 讀取一份文件。 */
    async load(key) {
      return { data: lsGet(key) };
    },

    /** 合併寫入；寫不進去就丟出錯誤。回傳合併後的完整文件。 */
    async patch(key, partial) {
      const merged = deepMerge(lsGet(key) || {}, partial);
      localOk = lsSet(key, merged);
      report();
      if (!localOk) throw new Error("local-write-failed");
      return merged;
    },

    readLocal: lsGet,
    /** 瀏覽器儲存使用的鍵值前綴。 */
    prefix: LS,
  };
}
