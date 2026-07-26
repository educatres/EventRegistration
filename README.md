# EventRegistration

免登入的活動報名系統。主辦人可建立限時、限額的報名表單，分享匿名連結與 QR Code，並使用獨立六位數密鑰管理及下載報名資料。

## 功能

- 姓名、Email 必填，電話選填。
- 主辦人可加入最多 20 個自訂文字欄位。
- 活動說明支援純文字或經安全清理的 HTML。
- 可設定報名起訖時間與 1–5000 人的人數上限。
- Firebase 原子寫入避免最後名額同時送出造成超收。
- 報名資料只有六位數密鑰驗證成功後才能讀取。
- 主辦人可調整報名時間、關閉報名及下載 UTF-8 CSV。
- 活動建立 28 天後立即停止存取，並由 GitHub Actions 定期實際刪除。

## 技術架構

- 原生 HTML、CSS、JavaScript
- GitHub Pages
- Firebase Anonymous Authentication
- Firebase Realtime Database（`asia-southeast1`）

Firebase 顯示名稱為 `EventRegistration`，Project ID 為 `eventregistration-tw`。Web API key 是 Firebase 公開用戶端設定，資料權限由 `database.rules.json` 控制；服務帳號只存放於 GitHub Actions Secret。

## 本機執行

```bash
python3 -m http.server 8080
```

開啟 <http://localhost:8080/>。Firebase ES modules 不支援直接以 `file://` 開啟。

## 檢查與部署

```bash
node --check js/config.js
node --check js/create.js
node --check js/respond.js
node --check js/results.js
node -e "JSON.parse(require('fs').readFileSync('database.rules.json', 'utf8'))"
firebase deploy --only database --project eventregistration-tw
```

GitHub Pages 由 `main` 分支根目錄發布。

## 隱私與限制

報名資料包含個人資訊，請只收集活動所需欄位。六位數密鑰適合短期、低風險活動；高敏感資料應改用正式帳號登入及伺服器端嘗試次數限制。

## 授權

MIT License
