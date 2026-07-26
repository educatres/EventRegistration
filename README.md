# schedule-a-meeting

以 Firebase Realtime Database 建置的開源會議時間調查工具，可直接部署到 GitHub Pages。

正式網站：<https://educatres.github.io/schedule-a-meeting/>

## 功能

- 發起人設定日期區間、每日時段、週末與回覆截止時間。
- 建立後產生參加者連結、結果連結與獨立的六位數管理密鑰。
- 參加者只需要連結即可輸入姓名、可行時間與備註，不需要密鑰。
- 同一個標準化姓名再次送出時，直接覆蓋舊回覆，以最後一次為準。
- 統計頁即時同步，顯示全員可行時段、推薦時段與參加者明細。
- 設定最終時間等修改操作，必須先輸入正確的六位數管理密鑰。
- 每個會議建立 21 天後，安全規則立即禁止存取；GitHub Actions 每 30 分鐘清除到期資料。

## Firebase 專案

- 顯示名稱：`schedule-a-meeting`
- Project ID：`schedule-a-meeting-tw`（`schedule-a-meeting` 已被其他 Firebase 使用者占用）
- Realtime Database：`schedule-a-meeting-tw-default-rtdb`
- 區域：`asia-southeast1`
- 驗證：Anonymous Authentication

Firebase Web App 設定放在 `js/firebase-config.js`。Web API key 是 Firebase 用戶端公開識別設定；安全性由 Authentication 與 `database.rules.json` 控制，儲存庫中不含服務帳號金鑰。

## 資料結構

```text
meetings/{meetingId}/
  settings/
    title, description, organizer_name
    start_date, end_date, start_time, end_time, slot_minutes
    include_saturday, include_sunday, response_deadline
    status, selected_final_slot
    created_at, expires_at, created_by
  responses/{sha256(normalizedName)}/
    participant_name, name_key, availability, note, updated_at, updated_by

meetingCatalog/{meetingId}/
  meeting_id, created_at, expires_at

adminKeys/{meetingId}: "123456"
adminKeyClaims/{meetingId}/{anonymousUid}: "123456"
```

管理密鑰不放入分享網址，也不允許從資料庫讀取。瀏覽器只有在提交的六位數密鑰與 `adminKeys` 相符時，才能寫入自己的 claim；管理寫入同時驗證 claim 與原始密鑰。

## 三週自動清除

`expires_at` 固定為 `created_at + 1814400000` 毫秒（21 天）。到期後：

1. Realtime Database Rules 立即拒絕一般讀寫。
2. `.github/workflows/cleanup-expired-meetings.yml` 每小時第 17、47 分執行。
3. `scripts/cleanup-expired.mjs` 使用匿名登入，只能依規則刪除已到期會議、密鑰、claims 與 catalog。

## 本機開發

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
firebase deploy --only database --project schedule-a-meeting-tw
```

GitHub Pages 由 `main` 分支根目錄發布。

## 隱私

這是匿名協作工具，姓名只是使用者自行輸入的識別文字，任何知道連結的人都可以讀取會議與回覆。請勿收集敏感個資。

## 授權

MIT License
