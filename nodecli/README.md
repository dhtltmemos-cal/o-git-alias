# nodecli — O-Alias Node CLI

CLI bổ sung cho [Git O-Alias](../Readme.md), thực hiện các thao tác API tới GitHub, Azure DevOps, Cloudflare, Supabase, v.v.  
Sử dụng lại cấu hình auth từ `.git-o-config`, `.cloudflared-o-config`, `.supabase-o-config`. Không có dependency ngoài — chỉ dùng Node built-ins.

---

## Cấu trúc

```
nodecli/
  bin/
    ocli.js                         ← Entry point CLI
  lib/
    config.js                       ← Parse .git-o-config
    prompt.js                       ← Helper menu/input tương tác
    shell.js                        ← Helper chạy lệnh shell
    azureApi.js                     ← Helper gọi Azure DevOps REST API
    cloudflaredApi.js               ← Helper gọi Cloudflare REST API + load .env
    supabaseApi.js                  ← Helper gọi Supabase Management API + load .env
  services/
    gh/
      index.js                      ← Subcommand ocli gh
      secrets.js                    ← Quản lý GitHub repo secrets
    azure/
      index.js                      ← Subcommand ocli azure
      createPipeline.js             ← Tạo pipeline mới từ YAML trong repo
      variables.js                  ← Quản lý Azure Pipeline variables
    clip/
      index.js                      ← Subcommand ocli clip (clipboard → file)
    addfiles/
      index.js                      ← Subcommand ocli addfiles (file/zip → cwd)
    cloudflared/
      index.js                      ← Subcommand ocli cloudflared
      tunnels.js                    ← Quản lý tunnels, DNS records, xuất credentials
      apiTokens.js                  ← Sinh Account API Token (CF_API_TOKEN) cho cloudflared workflows
    supabase/
      index.js                      ← Subcommand ocli supabase
      projectSetup.js               ← Resolve org, tạo/chọn project, polling ACTIVE_HEALTHY
      storageSetup.js               ← Tạo S3 access key, kiểm tra/tạo bucket
      databaseInfo.js               ← Lấy direct/pooler connections, API keys, JWT secret
      outputWriter.js               ← Tổng hợp JSON, ghi 2 file output, in tóm tắt
  templates/
    gh-secrets.json
    gh-secrets.env.example
    azure-pipeline-vars.json
    azure-pipeline-vars.env.example
  .cloudflared-o-config.example     ← Mẫu config Cloudflare
  .supabase-o-config.example        ← Mẫu config Supabase
  package.json
  README.md
  DeveloperGuide.vi.md
  ProjectStructure.md
  USER_CHANGELOG.md
```

---

## Cài đặt

```bash
cd nodecli
npm link
```

Sau đó dùng lệnh `ocli` từ bất kỳ thư mục nào.

Lưu ý trên Git Bash (Windows):
```bash
chmod +x nodecli/bin/ocli.js
```

---

## Cú pháp

```
ocli <subcommand>
```

| Subcommand | Mô tả |
|-----------|-------|
| `gh`          | GitHub — quản lý repo secrets (cần cài gh CLI) |
| `azure`       | Azure DevOps — quản lý pipeline variables (REST API) |
| `clip`        | Clipboard workflow — parse path trong header và ghi file theo cwd |
| `addfiles`    | Nhập file/zip, parse `// Path:` trong 3 dòng đầu, ghi/move tuần tự vào cwd |
| `cloudflared` | Cloudflare Tunnels — tạo tunnel, DNS records, Notification Policies, xuất credentials Docker |
| `supabase`    | Supabase — tạo project, lấy S3 & PostgreSQL connection info, xuất file JSON |

---

## Subcommand: supabase

```bash
ocli supabase
```

Không cần cài thêm CLI — gọi Supabase Management API trực tiếp qua https built-in.

### Cấu hình auth

Tạo file `nodecli/.supabase-o-config` từ mẫu:

```bash
cp nodecli/.supabase-o-config.example nodecli/.supabase-o-config
```

Format:
```ini
[myaccount]
email=you@example.com
accessToken=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
accessTokenExp=sbp_v0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # tùy chọn
defaultPassword=YourDefaultDbPassword123!                 # tùy chọn
defaultOrgId=                                             # tùy chọn
```

Lấy Personal Access Token tại: https://supabase.com/dashboard/account/tokens

### Biến môi trường SUPABASE_*

```env
SUPABASE_EMAIL=you@example.com
SUPABASE_ACCESS_TOKEN=sbp_xxxx
SUPABASE_PROJECT_NAME=myapp-project
SUPABASE_BUCKET_NAME=myapp-bucket
SUPABASE_DB_PASSWORD=YourDbPassword123!
SUPABASE_ORG_ID=your-org-id
SUPABASE_REGION=ap-southeast-1
SUPABASE_PROJECT_REF=abcxyzabcxyz
```

### Tính năng

- Lấy organizations, tạo/chọn project, polling tới `ACTIVE_HEALTHY`
- Lấy S3 access key + kiểm tra/tạo bucket
- Lấy PostgreSQL direct + pooler, API keys, JWT secret (nếu có quyền)
- Ghi output JSON ở 2 nơi:
  - `<cwd>/supabase-<email>.json`
  - `nodecli/.supabase-data/supabase-<email>.json`

### Regions hỗ trợ

| Code | Vị trí |
|---|---|
| `ap-southeast-1` | Singapore |
| `ap-southeast-2` | Sydney |
| `ap-northeast-1` | Tokyo |
| `us-east-1` | North Virginia |
| `us-west-1` | North California |
| `eu-west-1` | Ireland |
| `eu-central-1` | Frankfurt |

---

## Subcommand: cloudflared

```bash
ocli cloudflared
```

Không cần cài thêm CLI — gọi Cloudflare REST API trực tiếp qua https built-in.

### Cấu hình auth

Tạo file `nodecli/.cloudflared-o-config` từ mẫu:

```bash
cp nodecli/.cloudflared-o-config.example nodecli/.cloudflared-o-config
```

Format:
```ini
[mycompany]
email=admin@mycompany.com
apikey=YOUR_GLOBAL_API_KEY
accountid=YOUR_ACCOUNT_ID    # tùy chọn — bỏ trống để chọn qua API
```

Lấy Global API Key tại: https://dash.cloudflare.com/profile/api-tokens → tab "Global API Key"

### Resolve Account ID

Nếu `accountid` chưa có trong config, ocli sẽ:
1. Kiểm tra biến `CLOUDFLARED_ACCOUNT_ID` trong môi trường
2. Nếu không có → gọi API lấy danh sách accounts để chọn
3. Hỏi có muốn lưu vào config để lần sau không hỏi lại không

### Biến môi trường CLOUDFLARED_*

Đặt các biến sau trong file `.env` (cùng thư mục làm việc hoặc thư mục `nodecli/`).
ocli tự load file `.env` mà không cần cài thêm package ngoài.

```env
# Account
CLOUDFLARED_ACCOUNT_ID=your-account-id

# Tunnel info
CLOUDFLARED_TUNNEL_NAME=my-app-tunnel
CLOUDFLARED_TUNNEL_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLOUDFLARED_TUNNEL_SECRET=base64-secret-here

# Ingress rules (index tăng dần 1..20)
CLOUDFLARED_TUNNEL_HOSTNAME_1=app.example.com
CLOUDFLARED_TUNNEL_SERVICE_1=http://app-service:3000
CLOUDFLARED_TUNNEL_HOSTNAME_2=api.example.com
CLOUDFLARED_TUNNEL_SERVICE_2=http://api-service:8080
```

Khi khởi động, ocli hiển thị các biến `CLOUDFLARED_*` phát hiện được để bạn xác nhận dùng hay không.

### Tính năng

**Tunnels:**
- Xem danh sách tunnels
- Tạo tunnel mới (đọc tên + secret từ env nếu có)
- Xuất `credentials.json` + `config.yml` để deploy Docker
- Lấy tunnel run token (`cloudflared tunnel run --token`)
- Xóa tunnel

**Notification Policies (Tunnel Health Alert):**
- Tạo Notification Policy qua Cloudflare Alerting API (`/alerting/v3/policies`)
- Dùng `alert_type=tunnel_health_event` cho Cloudflare Zero Trust Tunnels
- Không filter tunnel ID — policy áp dụng cho toàn bộ tunnels trong account
- Khi tunnel đổi trạng thái healthy / degraded / down, Cloudflare sẽ gửi email theo policy
- Hỗ trợ xem danh sách policy, tạo mới, xóa policy ngay trong menu `cloudflared`

**DNS Records:**
- Tạo / cập nhật CNAME records trỏ về `<tunnel-id>.cfargotunnel.com` cho từng hostname
- Tự động detect zone từ hostname, tìm record hiện có
- Nếu record đã tồn tại nhưng sai target → cập nhật lại
- Hỗ trợ đọc danh sách hostname từ biến `CLOUDFLARED_TUNNEL_HOSTNAME_N` trong env
- Gợi ý xử lý khi gặp lỗi (zone chưa thêm vào CF, thiếu quyền DNS, conflict)

**Flow tạo tunnel hoàn chỉnh:**
1. `ocli cloudflared`
2. Chọn account → chọn/confirm accountid
3. Tạo tunnel mới → tự điền tên từ `CLOUDFLARED_TUNNEL_NAME` nếu có
4. Xuất `credentials.json` + `config.yml` với ingress từ `CLOUDFLARED_TUNNEL_HOSTNAME_N`
5. Tạo DNS CNAME records ngay sau khi xuất file (tùy chọn)

### Ví dụ deploy Docker

Sau khi xuất file:

```bash
docker run -d \
  -v /path/to/credentials.json:/etc/cloudflared/credentials.json \
  -v /path/to/config.yml:/etc/cloudflared/config.yml \
  cloudflare/cloudflared:latest \
  tunnel --config /etc/cloudflared/config.yml run
```

Hoặc dùng token:
```bash
docker run -d cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token YOUR_TOKEN
```

---

## Subcommand: gh

```bash
ocli gh
```

Yêu cầu: đã cài GitHub CLI (https://cli.github.com/).

Flow:
1. Chọn account github.com/* từ .git-o-config
2. Lấy danh sách repo → chọn repo
3. Chọn nghiệp vụ: Secrets

Secrets — các thao tác hỗ trợ:
- Xem danh sách secrets
- Set 1 secret (nhập tay)
- Set nhiều secrets từ file JSON hoặc .env
- Xóa secret

---

## Subcommand: azure

```bash
ocli azure
```

Flow:
1. Chọn account dev.azure.com/* từ .git-o-config
2. Lấy danh sách project → chọn project
3. Vòng lặp chọn flow: pipeline hiện có / tạo mới
4. Nếu tạo mới: chọn repo → chọn YAML → tạo pipeline
5. Chọn nghiệp vụ: Variables

Template JSON azure: `templates/azure-pipeline-vars.json`

```json
{
  "BUILD_ENV": "production",
  "API_KEY": {
    "value": "secret-value",
    "isSecret": true,
    "allowOverride": false
  }
}
```

---

## Cấu hình auth

### GitHub (.git-o-config)
```ini
[github.com/myorg]
token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Azure DevOps (.git-o-config)
```ini
[dev.azure.com/myorg/myproject]
header=Authorization: Basic BASE64ENCODEDPAT==
```

### Cloudflare (nodecli/.cloudflared-o-config)
```ini
[mycompany]
email=admin@mycompany.com
apikey=YOUR_GLOBAL_API_KEY
accountid=YOUR_ACCOUNT_ID
```

### Supabase (nodecli/.supabase-o-config)
```ini
[myaccount]
email=you@example.com
accessToken=sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
defaultPassword=YourDefaultDbPassword123!
defaultOrgId=
```

---

## Thêm subcommand mới

1. Tạo `services/<provider>/index.js` với `async function run()`
2. Thêm vào `bin/ocli.js` trong object `SUBCOMMANDS`
3. Cập nhật `README.md`, `ProjectStructure.md`, `DeveloperGuide.vi.md`

## Cloudflared: sinh CF_API_TOKEN

Menu `ocli cloudflared` có thêm flow để sinh **Account API Token** mới cho automation thay vì tiếp tục dùng Global API Key.

Flow mới sẽ:
1. nhận **bootstrap API token** dạng Bearer có quyền `Account API Tokens Write`
2. lấy danh sách permission groups từ account hiện tại
3. map theo profile dựng sẵn: `Tunnel only`, `Tunnel + DNS`, hoặc `Tunnel + DNS + Notifications`
4. tạo token mới qua `POST /accounts/:account_id/tokens`
5. in ra `CF_API_TOKEN=...` đúng 1 lần và có thể ghi vào `.env`
