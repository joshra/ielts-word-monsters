# 詞習 Lexi：雅思單字怪獸

每天十個雅思單字，每個字八項練習（字中找字、例句閱讀、聽寫、英翻中、中翻英、跟讀口說、詞性與關聯、自主造句）。做完八項，這個字的怪獸就會孵化，之後複習通過會進化。

純靜態網頁，不需要後端、帳號或金鑰，可以安裝成 PWA 離線使用。

- 詞庫：2,000 詞、200 組，200 天一輪
- 進度存在瀏覽器的 localStorage，不會上傳；換瀏覽器或清除網站資料就會不見
- 朗讀使用瀏覽器內建的英文語音
- 作答用「對照參考答案＋自評」，沒有自動批改

## 本機執行

需要透過 HTTP 開啟（直接點兩下 `index.html` 不行）：

```bash
python3 -m http.server 8000
```

然後開 http://localhost:8000 。

## 放上 GitHub Pages

1. 在 GitHub 建一個新的 repository，把這個資料夾的內容推上去。
2. 到 repository 的 Settings → Pages，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
3. 等一兩分鐘，網址會是 `https://<你的帳號>.github.io/<repository 名稱>/`。

所有路徑都是相對路徑，放在子路徑下可以直接用。

## 更新

改完檔案推上去就好。程式檔有網路時一律拿最新的；單字資料先用快取、背景更新，重新開啟一次就會換成新版。新增或改名檔案時，記得同步改 `sw.js` 裡的檔案清單。

## 檔案

| 路徑 | 內容 |
| --- | --- |
| `index.html` | 頁面與樣式 |
| `app.js` | 畫面與互動 |
| `store.js`、`speech.js` | 瀏覽器儲存、朗讀 |
| `core/` | 排程、遊戲、怪獸、徽章等規則（不碰畫面） |
| `data/` | 詞庫與例句 |
| `sw.js`、`manifest.webmanifest`、`icons/` | 離線快取與安裝設定 |

## 資料來源與授權

見 [DATA-LICENSES.md](DATA-LICENSES.md)。音標與詞形變化來自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 授權，全文在 `LICENSE-ECDICT`）；例句與中文翻譯由 AI 撰寫、經程式檢查，未經專業編輯逐句審校。
