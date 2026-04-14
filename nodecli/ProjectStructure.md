# ProjectStructure — nodecli / ocli

Cập nhật file này mỗi khi thêm thư mục, file mới, hoặc đổi vai trò module.

---

## Sơ đồ thư mục

```
nodecli/
│
├── bin/
│   └── ocli.js                 Entry point CLI. Dispatcher: đọc argv[2] gọi service tương ứng.
│                               Đăng ký subcommand mới tại object SUBCOMMANDS trong file này.
│
├── lib/                        Shared utilities — dùng chung cho mọi service
│   ├── config.js               Parse .git-o-config → danh sách sections với token/user/header
│   ├── prompt.js               Helper tương tác: ask, confirm, selectMenu, askFilePath, askMultiSelect
│   ├── shell.js                Helper shell: run, spawn, commandExists
│   ├── azureApi.js             Helper gọi Azure DevOps REST API (https built-in, Basic auth)
│   ├── cloudflaredApi.js       Helper gọi Cloudflare REST API (https built-in, X-Auth-Key hoặc Bearer API token)
│   │                           Bao gồm: loadDotenv, loadCloudflaredEnv, listCloudflareAccounts
│   └── supabaseApi.js          Helper gọi Supabase Management API (https built-in, Bearer token)
│                               Bao gồm: loadSupabaseEnv, slugify, supabaseRequest, loadSupabaseSections
│
├── services/                   Mỗi provider là một thư mục con, độc lập nhau
│   ├── gh/                     Subcommand ocli gh — GitHub (qua gh CLI + .git-o-config)
│   │   ├── index.js            Flow: chọn account → list repo → chọn repo → chọn nghiệp vụ
│   │   └── secrets.js          Nghiệp vụ: list / set / set-from-source / delete repo secrets
│   ├── azure/                  Subcommand ocli azure — Azure DevOps (REST API)
│   │   ├── index.js            Flow: chọn account → chọn project → (loop) chọn flow pipeline → chọn nghiệp vụ
│   │   ├── createPipeline.js   Nghiệp vụ: tạo pipeline mới từ YAML trong repo
│   │   └── variables.js        Nghiệp vụ: list / set / set-from-source / delete pipeline variables
│   ├── clip/                   Subcommand ocli clip — clipboard → file theo header path
│   │   └── index.js            Flow: đọc clipboard → parse path → ghi file → hỏi tiếp tục
│   ├── addfiles/               Subcommand ocli addfiles — file/zip → cwd theo header path
│   │   └── index.js            Flow: nhận file/zip → staging → parse // Path: → ghi/move → báo cáo
│   ├── cloudflared/            Subcommand ocli cloudflared — Cloudflare Tunnels + DNS + API tokens
│   │   ├── index.js            Flow: load .env → chọn account → resolve accountid (config/env/API)
│   │   │                             → hiển thị CLOUDFLARED_* env → chọn nghiệp vụ
│   │   ├── tunnels.js          Nghiệp vụ: list / tạo / xuất credentials+config / DNS records / token / xóa
│   │   │                       Đọc CLOUDFLARED_TUNNEL_* từ env để tự điền thông tin
│   │   ├── tunnelAlerts.js     Nghiệp vụ: Cloudflare Notification Policies cho tunnel health
│   │   └── apiTokens.js        Nghiệp vụ: sinh Account API Token (CF_API_TOKEN) cho cloudflared
│   └── supabase/               Subcommand ocli supabase — Supabase Management API
│       ├── index.js            Flow: load env → chọn account → hỏi inputs → confirm → thực hiện
│       │                             → loop menu: chạy lại / chỉ DB / chỉ S3
│       ├── projectSetup.js     resolveOrg, resolveProject (tạo mới hoặc dùng đã có), polling ACTIVE_HEALTHY
│       ├── storageSetup.js     resolveS3: tạo S3 access key, kiểm tra/tạo bucket
│       ├── databaseInfo.js     fetchAll: direct/pooler connections, API keys, JWT secret, env formats
│       └── outputWriter.js     Tổng hợp JSON, ghi 2 file output, in tóm tắt console
│
├── templates/                  File mẫu để user điền và truyền vào khi thao tác hàng loạt
│   ├── gh-secrets.json         Mẫu JSON: key=value string
│   ├── gh-secrets.env.example  Mẫu .env: KEY=value
│   ├── azure-pipeline-vars.json         Mẫu JSON: string hoặc object có isSecret/allowOverride
│   └── azure-pipeline-vars.env.example  Mẫu .env: KEY=value (isSecret=false)
│
├── .cloudflared-o-config.example  Mẫu config Cloudflare (email, apikey, accountid tùy chọn)
├── .supabase-o-config.example     Mẫu config Supabase (email, accessToken, defaultPassword, defaultOrgId)
├── package.json                name=ocli, version=1.6.0, bin.ocli=./bin/ocli.js, không có dep ngoài
├── README.md                   Hướng dẫn cài đặt, cú pháp, các subcommand
├── DeveloperGuide.vi.md        Quy tắc code, cách mở rộng, quy trình ZIP
├── ProjectStructure.md         File này — sơ đồ module
└── USER_CHANGELOG.md           Lịch sử thay đổi (entry mới nhất ở đầu)
```

---

## Luồng dữ liệu

```
.git-o-config
      │
      ├── services/gh/index.js      filterByProvider('github.com')
      │     │  → gh CLI (GH_TOKEN env)
      │     └── services/gh/secrets.js
      │
      └── services/azure/index.js   filterByProvider('dev.azure.com')
            │  → lib/azureApi.js → https → dev.azure.com REST API
            ├── services/azure/createPipeline.js
            └── services/azure/variables.js

nodecli/.cloudflared-o-config
      │
      └── services/cloudflared/index.js
            │  → lib/cloudflaredApi.js → https → api.cloudflare.com
            │  → loadCloudflaredEnv() → process.env CLOUDFLARED_* (từ .env)
            │  → listCloudflareAccounts() nếu accountid chưa có
            ├── services/cloudflared/tunnels.js
            │     ├── Đọc CLOUDFLARED_TUNNEL_NAME/ID/SECRET/HOSTNAME_N/SERVICE_N từ env
            │     ├── Tạo/list/xóa tunnel
            │     ├── Xuất credentials.json + config.yml
            │     └── Upsert CNAME records qua Cloudflare DNS API
            ├── services/cloudflared/tunnelAlerts.js
            │     ├── List Cloudflare alerting policies (lọc tunnel_health_event)
            │     ├── Tạo Notification Policy gửi email khi tunnel đổi trạng thái
            │     └── Xóa Notification Policy
            └── services/cloudflared/apiTokens.js
                  ├── Lấy account token permission groups qua Bearer bootstrap token
                  ├── Map profile quyền Tunnel / DNS / Notifications
                  ├── Tạo Account API Token mới qua API Cloudflare
                  └── Ghi `CF_API_TOKEN=` vào file .env nếu user xác nhận

nodecli/.supabase-o-config  (hoặc SUPABASE_* env vars)
      │
      └── services/supabase/index.js
            │  → lib/supabaseApi.js → https → api.supabase.com/v1
            │  → loadSupabaseEnv() → process.env SUPABASE_* (từ .env)
            ├── services/supabase/projectSetup.js
            │     ├── GET /v1/organizations → resolve org
            │     ├── GET /v1/projects → tìm project trùng tên
            │     ├── POST /v1/projects → tạo mới nếu chưa có
            │     └── Polling GET /v1/projects/:ref → chờ ACTIVE_HEALTHY
            ├── services/supabase/storageSetup.js
            │     ├── POST /v1/projects/:ref/storage/s3-access-key → lấy S3 keys
            │     ├── GET /v1/projects/:ref/storage/buckets → kiểm tra bucket
            │     └── POST /v1/projects/:ref/storage/buckets → tạo bucket nếu chưa có
            ├── services/supabase/databaseInfo.js
            │     ├── GET /v1/projects/:ref → direct connection info
            │     ├── GET /v1/projects/:ref/config/database → pooler info
            │     ├── GET /v1/projects/:ref/api-keys → anon key, service_role key
            │     └── GET /v1/projects/:ref/secrets → JWT secret
            └── services/supabase/outputWriter.js
                  ├── Tổng hợp JSON với _meta, s3, postgres, api, envFormats
                  ├── Ghi <cwd>/supabase-<email>.json
                  └── Ghi nodecli/.supabase-data/supabase-<email>.json

Clipboard (OS):
      │
      └── services/clip/index.js    pbpaste / xclip / PowerShell Get-Clipboard

File / ZIP input:
      │
      └── services/addfiles/index.js  unzip/tar/PowerShell → staging → cwd
```

---

## Biến môi trường CLOUDFLARED\_\* (cloudflared service)

| Biến                            | Mô tả                             | Dùng ở                                           |
| ------------------------------- | --------------------------------- | ------------------------------------------------ |
| `CLOUDFLARED_ACCOUNT_ID`        | Cloudflare Account ID             | index.js: resolveAccountId                       |
| `CLOUDFLARED_TUNNEL_NAME`       | Tên tunnel                        | tunnels.js: createTunnel, workflowExistingTunnel |
| `CLOUDFLARED_TUNNEL_ID`         | Tunnel UUID                       | tunnels.js: workflowExistingTunnel               |
| `CLOUDFLARED_TUNNEL_SECRET`     | Tunnel secret (base64)            | tunnels.js: createTunnel, workflowExistingTunnel |
| `CLOUDFLARED_TUNNEL_HOSTNAME_N` | Hostname ingress rule N (N=1..20) | tunnels.js: readIngressFromEnv                   |
| `CLOUDFLARED_TUNNEL_SERVICE_N`  | Service URL ingress rule N        | tunnels.js: readIngressFromEnv                   |

---

## Biến môi trường SUPABASE\_\* (supabase service)

| Biến                        | Mô tả                                     | Dùng ở                              |
| --------------------------- | ----------------------------------------- | ----------------------------------- |
| `SUPABASE_EMAIL`            | Email tài khoản Supabase                  | index.js: load account từ env       |
| `SUPABASE_ACCESS_TOKEN`     | Personal Access Token (sbp_xxx)           | index.js, supabaseApi.js            |
| `SUPABASE_ACCESS_TOKEN_EXP` | Experimental token (sbp_v0_xxx)           | supabaseApi.js                      |
| `SUPABASE_PROJECT_NAME`     | Tên project (default input)               | index.js: askInputs                 |
| `SUPABASE_BUCKET_NAME`      | Tên bucket (default input)                | index.js: askInputs                 |
| `SUPABASE_DB_PASSWORD`      | Mật khẩu database                         | index.js: askInputs                 |
| `SUPABASE_ORG_ID`           | Organization ID                           | projectSetup.js: resolveOrg         |
| `SUPABASE_PROJECT_REF`      | Project ref — nếu có thì skip tạo project | index.js: runOnce                   |
| `SUPABASE_REGION`           | Region code (VD: ap-southeast-1)          | index.js: askInputs                 |

---

## Mối quan hệ phụ thuộc

| Module                           | Phụ thuộc vào                                                               | KHÔNG phụ thuộc vào                          |
| -------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| bin/ocli.js                      | services/\*/index.js                                                        | lib/\* trực tiếp                             |
| services/gh/index.js             | lib/config, lib/prompt, lib/shell, services/gh/secrets                      | Các service khác                             |
| services/gh/secrets.js           | lib/shell, lib/prompt                                                       | lib/config, lib/azureApi, lib/cloudflaredApi |
| services/azure/index.js          | lib/config, lib/prompt, lib/azureApi, azure/variables, azure/createPipeline | Các service khác                             |
| services/azure/createPipeline.js | lib/azureApi, lib/prompt                                                    | lib/config, lib/shell                        |
| services/azure/variables.js      | lib/azureApi, lib/prompt                                                    | lib/config, lib/shell                        |
| services/clip/index.js           | lib/shell, lib/prompt                                                       | lib/config, lib/azureApi, lib/cloudflaredApi |
| services/addfiles/index.js       | lib/shell, lib/prompt                                                       | lib/config, lib/azureApi, lib/cloudflaredApi |
| services/cloudflared/index.js    | lib/cloudflaredApi, lib/prompt, cloudflared/tunnels, cloudflared/apiTokens  | Các service khác                             |
| services/cloudflared/tunnels.js  | lib/cloudflaredApi, lib/prompt, cloudflared/tunnelAlerts                    | lib/config, lib/azureApi, lib/shell          |
| services/cloudflared/tunnelAlerts.js | lib/cloudflaredApi, lib/prompt                                          | lib/config, lib/azureApi, lib/shell          |
| services/cloudflared/apiTokens.js | lib/cloudflaredApi, lib/prompt, fs, path                                 | lib/config, lib/azureApi, lib/shell          |
| services/supabase/index.js       | lib/supabaseApi, lib/prompt, supabase/projectSetup, supabase/storageSetup, supabase/databaseInfo, supabase/outputWriter | Các service khác |
| services/supabase/projectSetup.js | lib/supabaseApi, lib/prompt                                            | lib/config, lib/azureApi, lib/shell          |
| services/supabase/storageSetup.js | lib/supabaseApi, lib/prompt                                            | lib/config, lib/azureApi, lib/shell          |
| services/supabase/databaseInfo.js | lib/supabaseApi, lib/prompt                                            | lib/config, lib/azureApi, lib/shell          |
| services/supabase/outputWriter.js | lib/supabaseApi (resolveSupabaseConfigPath), fs, path                  | lib/config, lib/azureApi, lib/shell          |
| lib/config.js                    | fs, path, os (built-in)                                                     | Không có                                     |
| lib/prompt.js                    | readline (built-in)                                                         | Không có                                     |
| lib/shell.js                     | child_process (built-in)                                                    | Không có                                     |
| lib/azureApi.js                  | https (built-in)                                                            | Không có                                     |
| lib/cloudflaredApi.js            | https, fs, path, os (built-in)                                              | Không có                                     |
| lib/supabaseApi.js               | https, fs, path, os (built-in)                                              | Không có                                     |

---

## Danh sách file đầy đủ để kiểm tra ZIP

Khi tạo ZIP, đảm bảo đủ các file sau (đường dẫn tính từ thư mục gốc repo):

```
nodecli/package.json
nodecli/README.md
nodecli/DeveloperGuide.vi.md
nodecli/ProjectStructure.md
nodecli/USER_CHANGELOG.md
nodecli/.cloudflared-o-config.example
nodecli/.supabase-o-config.example
nodecli/bin/ocli.js
nodecli/lib/config.js
nodecli/lib/prompt.js
nodecli/lib/shell.js
nodecli/lib/azureApi.js
nodecli/lib/cloudflaredApi.js
nodecli/lib/supabaseApi.js
nodecli/services/gh/index.js
nodecli/services/gh/secrets.js
nodecli/services/azure/index.js
nodecli/services/azure/createPipeline.js
nodecli/services/azure/variables.js
nodecli/services/clip/index.js
nodecli/services/addfiles/index.js
nodecli/services/cloudflared/index.js
nodecli/services/cloudflared/tunnels.js
nodecli/services/cloudflared/tunnelAlerts.js
nodecli/services/cloudflared/apiTokens.js
nodecli/services/supabase/index.js
nodecli/services/supabase/projectSetup.js
nodecli/services/supabase/storageSetup.js
nodecli/services/supabase/databaseInfo.js
nodecli/services/supabase/outputWriter.js
nodecli/templates/gh-secrets.json
nodecli/templates/gh-secrets.env.example
nodecli/templates/azure-pipeline-vars.json
nodecli/templates/azure-pipeline-vars.env.example
```

Khi thêm service hoặc lib mới, bổ sung vào danh sách này.
