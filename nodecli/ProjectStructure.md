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
│   └── azureApi.js             Helper gọi Azure DevOps REST API (https built-in, Basic auth)
│
├── services/                   Mỗi provider là một thư mục con, độc lập nhau
│   ├── gh/                     Subcommand ocli gh — GitHub (qua gh CLI + .git-o-config)
│   │   ├── index.js            Flow: chọn account → list repo → chọn repo → chọn nghiệp vụ
│   │   └── secrets.js          Nghiệp vụ: list / set / set-from-file / delete repo secrets
│   └── azure/                  Subcommand ocli azure — Azure DevOps (REST API)
│       ├── index.js            Flow: chọn account → chọn project → chọn flow pipeline → chọn nghiệp vụ
│       ├── createPipeline.js   Nghiệp vụ: tạo pipeline mới từ YAML trong repo
│       └── variables.js        Nghiệp vụ: list / set / set-from-file / delete pipeline variables
│
├── templates/                  File mẫu để user điền và truyền vào khi thao tác hàng loạt
│   ├── gh-secrets.json         Mẫu JSON: key=value string
│   ├── gh-secrets.env.example  Mẫu .env: KEY=value
│   ├── azure-pipeline-vars.json         Mẫu JSON: string hoặc object có isSecret/allowOverride
│   └── azure-pipeline-vars.env.example  Mẫu .env: KEY=value (isSecret=false)
│
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
      ▼
lib/config.js → sections[]
      │
      ├── services/gh/index.js      filterByProvider('github.com')
      │     │  → gh CLI (GH_TOKEN env)
      │     └── services/gh/secrets.js
      │
      └── services/azure/index.js   filterByProvider('dev.azure.com')
            │  → lib/azureApi.js → https → dev.azure.com REST API
            ├── services/azure/createPipeline.js
            └── services/azure/variables.js
```

---

## Mối quan hệ phụ thuộc

| Module | Phụ thuộc vào | KHÔNG phụ thuộc vào |
|--------|--------------|---------------------|
| bin/ocli.js | services/*/index.js | lib/* trực tiếp |
| services/gh/index.js | lib/config, lib/prompt, lib/shell, services/gh/secrets | Các service khác |
| services/gh/secrets.js | lib/shell, lib/prompt | lib/config, lib/azureApi |
| services/azure/index.js | lib/config, lib/prompt, lib/azureApi, services/azure/variables, services/azure/createPipeline | Các service khác |
| services/azure/createPipeline.js | lib/azureApi, lib/prompt | lib/config, lib/shell |
| services/azure/variables.js | lib/azureApi, lib/prompt | lib/config, lib/shell |
| lib/config.js | fs, path, os (built-in) | Không có |
| lib/prompt.js | readline (built-in) | Không có |
| lib/shell.js | child_process (built-in) | Không có |
| lib/azureApi.js | https (built-in) | Không có |

---

## Danh sách file đầy đủ để kiểm tra ZIP

Khi tạo ZIP, đảm bảo đủ các file sau (đường dẫn tính từ thư mục gốc repo):

```
nodecli/package.json
nodecli/README.md
nodecli/DeveloperGuide.vi.md
nodecli/ProjectStructure.md
nodecli/USER_CHANGELOG.md
nodecli/bin/ocli.js
nodecli/lib/config.js
nodecli/lib/prompt.js
nodecli/lib/shell.js
nodecli/lib/azureApi.js
nodecli/services/gh/index.js
nodecli/services/gh/secrets.js
nodecli/services/azure/index.js
nodecli/services/azure/createPipeline.js
nodecli/services/azure/variables.js
nodecli/services/clip/index.js
nodecli/templates/gh-secrets.json
nodecli/templates/gh-secrets.env.example
nodecli/templates/azure-pipeline-vars.json
nodecli/templates/azure-pipeline-vars.env.example
```

Khi thêm service hoặc lib mới, bổ sung vào danh sách này.
