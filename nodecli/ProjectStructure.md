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
│   ├── prompt.js               Helper tương tác: ask, confirm, selectMenu, askFilePath
│   ├── shell.js                Helper shell: run, spawn, commandExists
│   ├── azureApi.js             Helper gọi Azure DevOps REST API (https built-in, Basic auth)
│   └── cloudflaredApi.js       Helper gọi Cloudflare REST API (https built-in, X-Auth-Key)
│                               Bao gồm: loadDotenv, loadCloudflaredEnv, listCloudflareAccounts
│
├── services/                   Mỗi provider là một thư mục con, độc lập nhau
│   ├── gh/                     Subcommand ocli gh — GitHub (qua gh CLI + .git-o-config)
│   │   ├── index.js            Flow: chọn account → list repo → chọn repo → chọn nghiệp vụ
│   │   └── secrets.js          Nghiệp vụ: list / set / set-from-file / delete repo secrets
│   ├── azure/                  Subcommand ocli azure — Azure DevOps (REST API)
│   │   ├── index.js            Flow: chọn account → chọn project → (loop) chọn flow pipeline → chọn nghiệp vụ
│   │   ├── createPipeline.js   Nghiệp vụ: tạo pipeline mới từ YAML trong repo
│   │   └── variables.js        Nghiệp vụ: list / set / set-from-file / delete pipeline variables
│   ├── clip/                   Subcommand ocli clip — clipboard → file theo header path
│   │   └── index.js            Flow: đọc clipboard → parse path → ghi file → hỏi tiếp tục
│   ├── addfiles/               Subcommand ocli addfiles — file/zip → cwd theo header path
│   │   └── index.js            Flow: nhận file/zip → staging → parse // Path: → ghi/move → báo cáo
│   └── cloudflared/            Subcommand ocli cloudflared — Cloudflare Tunnels + DNS
│       ├── index.js            Flow: load .env → chọn account → resolve accountid (config/env/API)
│       │                             → hiển thị CLOUDFLARED_* env → chọn nghiệp vụ
│       ├── tunnels.js          Nghiệp vụ: list / tạo / xuất credentials+config / DNS records / token / xóa
│       │                       Đọc CLOUDFLARED_TUNNEL_* từ env để tự điền thông tin
│       └── tunnelAlerts.js     Nghiệp vụ: Cloudflare Notification Policies cho tunnel health
│
├── templates/                  File mẫu để user điền và truyền vào khi thao tác hàng loạt
│   ├── gh-secrets.json         Mẫu JSON: key=value string
│   ├── gh-secrets.env.example  Mẫu .env: KEY=value
│   ├── azure-pipeline-vars.json         Mẫu JSON: string hoặc object có isSecret/allowOverride
│   └── azure-pipeline-vars.env.example  Mẫu .env: KEY=value (isSecret=false)
│
├── .cloudflared-o-config.example  Mẫu config Cloudflare (email, apikey, accountid tùy chọn)
├── package.json                name=ocli, bin.ocli=./bin/ocli.js, không có dep ngoài
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
            └── services/cloudflared/tunnelAlerts.js
                  ├── List Cloudflare alerting policies (lọc tunnel_health_alert)
                  ├── Tạo Notification Policy gửi email khi tunnel đổi trạng thái
                  └── Xóa Notification Policy

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
| services/cloudflared/index.js    | lib/cloudflaredApi, lib/prompt, cloudflared/tunnels                         | Các service khác                             |
| services/cloudflared/tunnels.js  | lib/cloudflaredApi, lib/prompt, cloudflared/tunnelAlerts                    | lib/config, lib/azureApi, lib/shell          |
| services/cloudflared/tunnelAlerts.js | lib/cloudflaredApi, lib/prompt                                          | lib/config, lib/azureApi, lib/shell          |
| lib/config.js                    | fs, path, os (built-in)                                                     | Không có                                     |
| lib/prompt.js                    | readline (built-in)                                                         | Không có                                     |
| lib/shell.js                     | child_process (built-in)                                                    | Không có                                     |
| lib/azureApi.js                  | https (built-in)                                                            | Không có                                     |
| lib/cloudflaredApi.js            | https, fs, path, os (built-in)                                              | Không có                                     |

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
nodecli/bin/ocli.js
nodecli/lib/config.js
nodecli/lib/prompt.js
nodecli/lib/shell.js
nodecli/lib/azureApi.js
nodecli/lib/cloudflaredApi.js
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
nodecli/templates/gh-secrets.json
nodecli/templates/gh-secrets.env.example
nodecli/templates/azure-pipeline-vars.json
nodecli/templates/azure-pipeline-vars.env.example
```

Khi thêm service hoặc lib mới, bổ sung vào danh sách này.
