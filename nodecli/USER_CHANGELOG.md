# USER_CHANGELOG — nodecli / ocli

## 2026-04-14 — Thêm subcommand ocli supabase

**Loại:** Feature

### Những gì đã thêm

**`lib/supabaseApi.js`:**
- Helper gọi Supabase Management API qua https built-in (Bearer token)
- `supabaseRequest()` với log đầy đủ `→ method path` / `← status (ms)` / `✗ lỗi`
- `loadSupabaseEnv()` — load file `.env` và trả về biến `SUPABASE_*`
- `loadSupabaseSections()` — parse file `.supabase-o-config` format INI
- `slugify()` — chuyển email username thành slug hợp lệ

**`services/supabase/index.js`:**
- Flow đầy đủ: load env → chọn account → hỏi inputs → confirm → thực hiện
- Hỗ trợ load account từ `.supabase-o-config` hoặc fallback env vars
- Bổ sung lưu account env vào `.supabase-o-config` sau khi chạy thành công (nếu user xác nhận)
- Menu vòng lặp: chạy lại / chỉ lấy DB / chỉ lấy S3
- Flow “chỉ DB/S3” resolve project bằng Supabase API (không fallback `projectName` thành `project.ref`)

**`services/supabase/projectSetup.js`:**
- `resolveOrg()` — lấy danh sách org, tự chọn nếu chỉ có 1, menu nếu nhiều
- `resolveProject()` — tìm project trùng tên hoặc tạo mới, polling đến `ACTIVE_HEALTHY`

**`services/supabase/storageSetup.js`:**
- `resolveS3()` — tạo S3 access key, kiểm tra/tạo bucket
- Build endpoint `https://<ref>.supabase.co/storage/v1/s3`

**`services/supabase/databaseInfo.js`:**
- `fetchAll()` — lấy direct connection, transaction pooler, session pooler info
- Lấy anon key, service_role key, JWT secret, publishable key
- Build ENV format strings: nextjs, prisma, full

**`services/supabase/outputWriter.js`:**
- Tổng hợp JSON output đầy đủ với `_meta`, `s3`, `postgres`, `api`, `envFormats`
- Ghi file tại 2 nơi: `<cwd>/supabase-<email>.json` và `.supabase-data/supabase-<email>.json`
- In tóm tắt rõ ràng ra console sau khi hoàn tất

**`nodecli/.supabase-o-config.example`:**
- Mẫu config với format: `email`, `accessToken`, `accessTokenExp`, `defaultPassword`, `defaultOrgId`

**Biến môi trường SUPABASE_* hỗ trợ:**
- `SUPABASE_EMAIL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ACCESS_TOKEN_EXP`
- `SUPABASE_PROJECT_NAME`, `SUPABASE_BUCKET_NAME`, `SUPABASE_DB_PASSWORD`
- `SUPABASE_ORG_ID`, `SUPABASE_PROJECT_REF` (skip tạo project), `SUPABASE_REGION`

**`bin/ocli.js`:** đăng ký subcommand `supabase` và giữ nguyên help cloudflared, bổ sung help supabase
**`package.json`:** bump version `1.5.0` → `1.6.0`

---

## 2026-04-13 — azure variables: thêm nguồn process.env, multi-select, preview giá trị

**Loại:** Feature

### Những gì đã thêm

**`services/azure/variables.js`:**

- Đổi tên hàm `setFromFile` → `setFromSource`, mở rộng để hỗ trợ 2 nguồn giá trị:
  - **File .env hoặc JSON** — giữ nguyên logic parse cũ (`parseVarsFile`)
  - **process.env hiện tại** — đọc toàn bộ biến môi trường đang chạy, lọc bỏ biến hệ thống (PATH, HOME, npm\_\*, NODE\_\*, VSCODE\_\*, v.v.)
- Thêm `loadFromProcessEnv()` — helper load + sort biến từ `process.env`, lọc biến hệ thống rõ ràng (giống pattern đã có ở `gh/secrets.js`)
- Sau khi load entries từ nguồn đã chọn, gọi `askMultiSelect` để user **chọn subset** variable muốn set (không bắt buộc phải set hết)
- Sau khi chọn xong, **in bảng preview** `KEY = VALUE` (truncate tại 55 ký tự nếu quá dài, ẩn hiển thị nếu isSecret) để xác nhận trước khi gọi API
- Thêm import `askMultiSelect` từ `lib/prompt`
- Thêm constants `SYSTEM_ENV_PREFIXES` và `SYSTEM_ENV_EXACT` để lọc biến hệ thống
- Thêm helper `pickAndPreviewEntries()` — multi-select + preview chung cho cả hai nguồn
- Cập nhật label menu item trong `run()`: mô tả rõ hơn chức năng mới

**Thay đổi menu `Variables`:**

| Trước                                                          | Sau                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Thêm / cập nhật nhiều variables từ file (JSON hoặc .env)       | Thêm / cập nhật variables từ file hoặc process.env (chọn subset)    |

**Lưu ý:** `gh/secrets.js` đã có đầy đủ tính năng này từ trước — không thay đổi.

---

## 2026-04-10 — cloudflared: thêm flow sinh CF_API_TOKEN qua Cloudflare Account Tokens API

**Loại:** Feature

### Những gì đã thêm

**`lib/cloudflaredApi.js`:**

- Mở rộng helper `cloudflaredRequest()` để hỗ trợ cả 2 kiểu auth:
  - legacy `X-Auth-Email` + `X-Auth-Key`
  - `Authorization: Bearer <API_TOKEN>`
- Không làm thay đổi các flow tunnel/DNS hiện có dùng Global API Key

**`services/cloudflared/apiTokens.js`:**

- Thêm module mới để sinh **Account API Token** cho biến `CF_API_TOKEN`
- Hỗ trợ nhập bootstrap token (Bearer) để gọi:
  - `GET /accounts/:account_id/tokens/permission_groups`
  - `POST /accounts/:account_id/tokens`
- Thêm 3 profile quyền dựng sẵn:
  - `Tunnel only`
  - `Tunnel + DNS`
  - `Tunnel + DNS + Notifications` *(khuyên dùng cho project hiện tại)*
- Tự map permission groups theo tên/alias để tương thích giữa các cách đặt tên kiểu `Write/Edit`
- Dùng 2 policy scope riêng:
  - account scope cho quyền account-level như Tunnel / Notifications
  - zone scope cho quyền DNS trên toàn bộ zones trong account
- In ra `CF_API_TOKEN=...` đúng 1 lần sau khi tạo thành công
- Cho phép ghi thẳng `CF_API_TOKEN` vào file `.env`

**`services/cloudflared/index.js`:**

- Thêm menu group mới:
  - `CF_API_TOKEN — sinh Account API Token cho cloudflared workflows`

**`README.md` + `ProjectStructure.md`:**

- Cập nhật tài liệu để phản ánh flow Bearer bootstrap token và module `apiTokens.js`

### Lưu ý vận hành

- Cloudflare endpoint tạo account token yêu cầu **bootstrap API token** có quyền `Account API Tokens Write`
- Bootstrap token này là token mồi để sinh token mới, không dùng cặp `email + apikey` legacy
- Token mới sinh ra phù hợp hơn cho automation thay vì tiếp tục dùng Global API Key

## 2026-04-10 — cloudflared: thêm Tunnel Health Alert Notification Policies qua Cloudflare Alerting API

**Loại:** Feature

### Những gì đã thêm

**`services/cloudflared/tunnelAlerts.js`:**

- Thêm module mới để quản lý Cloudflare Alerting v3 policies cho `tunnel_health_event`
- Hỗ trợ `GET /accounts/:account_id/alerting/v3/policies` và lọc riêng policy của Zero Trust Tunnel
- Hỗ trợ `POST /accounts/:account_id/alerting/v3/policies` với `filters: {}` để nhận email khi tunnel đổi trạng thái `healthy / degraded / down`
- Hỗ trợ `DELETE /accounts/:account_id/alerting/v3/policies/:policy_id`
- In bảng policy gồm tên, policy ID, enabled, email nhận thông báo
- Bổ sung fallback lỗi entitlement: nếu API trả lỗi kiểu `not entitled` / code `7003`, log gợi ý quyền `Account > Notifications > Edit`

**`services/cloudflared/tunnels.js`:**

- Chỉ chèn 3 điểm tích hợp theo đúng task:
  - thêm `require("./tunnelAlerts")`
  - thêm menu item `Quản lý Notification Policies (Tunnel Health Alert → email)`
  - thêm handler `if (idx === 6) await runAlertMenu(account)`
- Giữ nguyên toàn bộ logic hiện có cho tunnel / DNS / token / delete

**`README.md`:**

- Bổ sung mô tả tính năng Notification Policies trong subcommand `cloudflared`

**`ProjectStructure.md`:**

- Cập nhật sơ đồ thư mục, luồng dữ liệu, dependency table, và danh sách file ZIP để bao gồm `services/cloudflared/tunnelAlerts.js`

---

## 2026-04-10 — gh secrets: thêm nguồn process.env, multi-select biến, preview giá trị

**Loại:** Feature

### Những gì đã thêm

**`lib/prompt.js`:**

- Thêm `askMultiSelect(title, items, opts)` — hiển thị danh sách có đánh số, cho phép user chọn nhiều items trong một lần nhập
  - Cú pháp nhập: `all` | `1` | `1,3,5` | `1-5` | `1,3-5,7`
  - Option `allowAll` (default true): cho phép nhập "all" để chọn tất cả
  - Option `minSelect` (default 1): số lượng item tối thiểu phải chọn
  - Nhập `0` để hủy, trả về mảng rỗng
  - Trả về `number[]` — mảng index 0-based các items đã chọn
- Export thêm `askMultiSelect` trong `module.exports`

**`services/gh/secrets.js`:**

- Đổi tên hàm `setFromFile` → `setFromSource`, mở rộng để hỗ trợ 2 nguồn giá trị:
  - **File .env hoặc JSON** — giữ nguyên logic parse cũ (`parseSecretsFile`)
  - **process.env hiện tại** — đọc toàn bộ biến môi trường đang chạy, lọc bỏ biến hệ thống (PATH, HOME, npm*\*, NODE*\_, VSCODE\_\*, v.v.)
- Sau khi load entries từ nguồn đã chọn, gọi `askMultiSelect` để user **chọn subset** biến muốn set
- Sau khi chọn xong, **in bảng preview** `KEY = VALUE` (truncate tại 60 ký tự nếu quá dài) để xác nhận trước khi gọi API
- Cập nhật label menu item trong `run()`: mô tả rõ hơn chức năng mới
- Thêm `loadFromProcessEnv()` — helper load + sort biến từ `process.env`, lọc biến hệ thống rõ ràng

---

## 2026-04-05 — Hoàn thiện ocli cloudflared: accountid API, env vars, DNS records

**Loại:** Feature + Refactor

### Những gì đã làm

**`lib/cloudflaredApi.js`:**

- Thêm `loadDotenv()` — parse file `.env` thuần Node (không cần package ngoài), hỗ trợ expand `${VAR}`, bỏ dấu nháy
- Thêm `loadCloudflaredEnv()` — tìm và load `.env` theo thứ tự cwd → nodecli/ → repo root, trả về tất cả biến `CLOUDFLARED_*`
- Thêm `listCloudflareAccounts()` — gọi `/accounts` API để lấy danh sách accounts có quyền truy cập
- Sửa regex parse config: `(\w+)\s*=\s*(.*)$` (cho phép value rỗng, không bắt lỗi với accountid trống)

**`services/cloudflared/index.js`** (viết lại):

- Thêm `resolveAccountId()` — resolve accountid theo thứ tự: config file → env `CLOUDFLARED_ACCOUNT_ID` → gọi API chọn từ danh sách → nhập tay
- Sau khi chọn qua API, hỏi có muốn lưu vào `.cloudflared-o-config` không (tự patch file)
- Thêm `printEnvSummary()` — hiển thị các biến `CLOUDFLARED_*` phát hiện được, nhóm theo Tunnel / Ingress / Khác, ẩn giá trị SECRET/KEY
- Truyền `envVars` xuống `tunnels.run(account, envVars)`

**`services/cloudflared/tunnels.js`** (viết lại):

- Đổi tên tất cả biến env: `TUNNEL_HOSTNAME_N` → `CLOUDFLARED_TUNNEL_HOSTNAME_N`, `TUNNEL_SERVICE_N` → `CLOUDFLARED_TUNNEL_SERVICE_N`
- Thêm `readIngressFromEnv(envVars)` — đọc ingress rules từ `CLOUDFLARED_TUNNEL_HOSTNAME_N` + `SERVICE_N` trong envVars
- `createTunnel()` — đọc `CLOUDFLARED_TUNNEL_NAME` + `CLOUDFLARED_TUNNEL_SECRET` từ env, show và confirm trước khi dùng
- `workflowExistingTunnel()` — tự detect tunnel qua `CLOUDFLARED_TUNNEL_ID` hoặc `CLOUDFLARED_TUNNEL_NAME`, hỏi confirm
- `workflowOutputFiles()` — ưu tiên dùng ingress rules từ `readIngressFromEnv()`, fallback file .env hoặc nhập tay
- Thêm `parseEnvForIngress()` — parse file .env với prefix mới `CLOUDFLARED_TUNNEL_HOSTNAME_N`
- **Thêm mới DNS management:**
  - `getZoneId()` — trích root domain, gọi `/zones?name=` để lấy zone ID
  - `findDnsRecord()` — tìm CNAME record hiện có cho hostname trong zone
  - `createDnsRecord()` — tạo CNAME proxied trỏ về `<tunnelId>.cfargotunnel.com`
  - `updateDnsRecord()` — PATCH record hiện có nếu sai target hoặc không proxied
  - `upsertDnsRecord()` — logic upsert: tìm → cập nhật nếu sai, tạo mới nếu chưa có, bỏ qua nếu đúng rồi
  - `workflowManageDns()` — wizard chọn tunnel → đọc hostnames từ env hoặc nhập tay → upsert CNAME → in tổng kết + gợi ý xử lý lỗi
- `workflowCreateWithOutput()` — sau khi xuất file, hỏi có muốn tạo DNS records ngay không
- Menu tunnels thêm option: `"Tạo / cập nhật DNS records (CNAME) cho tunnel"`

**`nodecli/.cloudflared-o-config.example`:**

- Thêm ghi chú `accountid` là tùy chọn
- Thêm ví dụ account không có accountid
- Thêm mục "BIẾN MÔI TRƯỜNG HỖ TRỢ" với format .env đầy đủ

**Docs:**

- `bin/ocli.js` — cập nhật help text cloudflared
- `nodecli/package.json` — bump version `1.3.0` → `1.4.0`
- `nodecli/README.md` — thêm mục cloudflared đầy đủ: env vars, DNS, flow, Docker deploy
- `nodecli/ProjectStructure.md` — thêm bảng biến CLOUDFLARED\_\*, cập nhật sơ đồ, danh sách file ZIP

---

## 2026-04-04 — Fix createPipeline + azure/index: UX, API correctness, ProjectStructure

**Loại:** Bugfix + UX improvement

### Những gì đã sửa

**`services/azure/createPipeline.js`:**

- Hardcode `type: 'TfsGit'` thay vì dùng `selectedRepo.type`
- Đổi `recursionLevel=Full` → `recursionLevel=full`
- Guard `defaultBranch`: fallback `refs/heads/main` nếu rỗng
- Thêm auto-prefix `/` khi user nhập path YAML thiếu dấu `/` đầu
- Thêm thông báo rõ ràng khi repo không có file YAML

**`services/azure/index.js`:**

- Bọc bước chọn flow pipeline trong `while (true)`
- Lỗi lấy danh sách pipeline → `continue` quay lại menu

**`ProjectStructure.md`:**

- Thêm `nodecli/services/addfiles/index.js` vào sơ đồ, bảng phụ thuộc, danh sách file ZIP

**`package.json`:**

- Bump version `1.0.0` → `1.3.0`

---

## 2026-04-03 — Thêm tính năng tạo Azure Pipeline từ YAML trong repo

**Yêu cầu:** Trong `ocli azure`, thêm nghiệp vụ tạo pipeline mới, source YAML được chọn trực tiếp từ repository.

**Thay đổi:**

- Tạo mới `nodecli/services/azure/createPipeline.js`
- Cập nhật `nodecli/services/azure/index.js`
- Cập nhật `nodecli/README.md`

---

## 2026-04-03 — Thêm subcommand ocli clip — clipboard → file

**Yêu cầu:** Thêm nghiệp vụ đầu tiên cho `ocli clip`.

**Thay đổi:**

- Tạo mới `nodecli/services/clip/index.js`
- Cập nhật `nodecli/bin/ocli.js`
- Cập nhật `nodecli/README.md`
- Cập nhật `nodecli/ProjectStructure.md`

---

## 2026-04-02 — Thêm subcommand ocli azure — Azure Pipeline Variables

**Thay đổi:**

- Tạo mới `nodecli/lib/azureApi.js`
- Tạo mới `nodecli/services/azure/index.js`
- Tạo mới `nodecli/services/azure/variables.js`
- Tạo mới templates azure-pipeline-vars.\*
- Cập nhật `nodecli/bin/ocli.js`, `README.md`, `ProjectStructure.md`, `DeveloperGuide.vi.md`

---

## 2026-04-02 — Khởi tạo nodecli với subcommand ocli gh

**Thay đổi:**

- Tạo mới toàn bộ cấu trúc nodecli/
- Tạo mới subcommand `gh` với secrets management
