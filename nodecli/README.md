# nodecli — O-Alias Node CLI

CLI bổ sung cho [Git O-Alias](../Readme.md), thực hiện các thao tác API tới GitHub, Azure DevOps, v.v.  
Sử dụng lại cấu hình auth từ `.git-o-config`. Không có dependency ngoài — chỉ dùng Node built-ins.

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
    azureApi.js                     ← Helper gọi Azure DevOps REST API (https built-in)
  services/
    gh/
      index.js                      ← Subcommand ocli gh
      secrets.js                    ← Quản lý GitHub repo secrets
    azure/
      index.js                      ← Subcommand ocli azure
      variables.js                  ← Quản lý Azure Pipeline variables
  templates/
    gh-secrets.json                 ← Template JSON GitHub secrets
    gh-secrets.env.example          ← Template .env GitHub secrets
    azure-pipeline-vars.json        ← Template JSON Azure pipeline variables
    azure-pipeline-vars.env.example ← Template .env Azure pipeline variables
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

Lưu ý trên Git Bash (Windows) — set executable bit:
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
| `gh`      | GitHub — quản lý repo secrets (cần cài gh CLI) |
| `azure`   | Azure DevOps — quản lý pipeline variables (REST API) |

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

Template: templates/gh-secrets.json hoặc templates/gh-secrets.env.example

Auth: token từ .git-o-config truyền qua env GH_TOKEN.

---

## Subcommand: azure

```bash
ocli azure
```

Không cần cài thêm CLI — gọi Azure DevOps REST API trực tiếp qua https built-in.

Flow:
1. Chọn account dev.azure.com/* từ .git-o-config
2. Lấy danh sách project → chọn project
   (Nếu section config dạng [dev.azure.com/org/project] → tự động dùng project đó)
3. Lấy danh sách pipeline → chọn pipeline
4. Chọn nghiệp vụ: Variables

Variables — các thao tác hỗ trợ:
- Xem danh sách variables (hiển thị tên, isSecret, giá trị)
- Set 1 variable (nhập tay, có hỏi isSecret và allowOverride)
- Set nhiều variables từ file JSON hoặc .env
- Xóa variable

Template JSON: templates/azure-pipeline-vars.json

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

- Giá trị dạng string → isSecret=false, allowOverride=true
- Giá trị dạng object → tuỳ chỉnh đầy đủ
- Key bắt đầu bằng _ bị bỏ qua (dùng làm comment)

Template .env: templates/azure-pipeline-vars.env.example

File .env luôn set isSecret=false. Muốn set secret → dùng file JSON.

---

## Cấu hình auth trong .git-o-config

GitHub:
```
[github.com/myorg]
token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Azure DevOps (chỉ org):
```
[dev.azure.com/myorg]
header=Authorization: Basic BASE64ENCODEDPAT==
```

Azure DevOps (kèm project — bỏ qua bước chọn project):
```
[dev.azure.com/myorg/myproject]
header=Authorization: Basic BASE64ENCODEDPAT==
```

Encode PAT (PowerShell):
```
[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":YOUR_PAT"))
```

Encode PAT (Git Bash):
```
echo -n ":YOUR_PAT" | base64
```

---

## Thêm subcommand mới

1. Tạo services/<provider>/index.js với async function run()
2. Thêm vào bin/ocli.js trong object SUBCOMMANDS
3. Cập nhật README.md, ProjectStructure.md, DeveloperGuide.vi.md
