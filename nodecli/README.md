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
    clip/
      index.js                      ← Subcommand ocli clip (clipboard → file)
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


## Diagram tổng thể (chi tiết)

### 1) Kiến trúc thư mục + luồng gọi module

```mermaid
flowchart TB
    U[Người dùng\nchạy lệnh ocli] --> O[bin/ocli.js\nEntry point + SUBCOMMANDS]

    O -->|subcommand gh| GH[services/gh/index.js]
    O -->|subcommand azure| AZ[services/azure/index.js]
    O -->|subcommand clip| CLIP[services/clip/index.js]

    O --> CFG[lib/config.js\nĐọc + parse .git-o-config]
    O --> PR[lib/prompt.js\nMenu/input tương tác]
    O --> SH[lib/shell.js\nChạy shell command]
    O --> API[lib/azureApi.js\nHTTPS wrapper Azure DevOps]

    GH --> GHSEC[services/gh/secrets.js\nList/Set/Delete secrets]
    GH --> SH
    GH --> PR
    GH --> CFG

    AZ --> AZVAR[services/azure/variables.js\nList/Set/Delete variables]
    AZ --> PR
    AZ --> CFG
    AZ --> API

    GHSEC --> TGH1[templates/gh-secrets.json]
    GHSEC --> TGH2[templates/gh-secrets.env.example]
    AZVAR --> TAZ1[templates/azure-pipeline-vars.json]
    AZVAR --> TAZ2[templates/azure-pipeline-vars.env.example]

    CFG --> GC[(~/.git-o-config\nhoặc ./.git-o-config)]
```

### 2) Sequence cho `ocli gh` (GitHub Secrets)

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant OCLI as bin/ocli.js
    participant Cfg as lib/config.js
    participant Prompt as lib/prompt.js
    participant GH as services/gh/index.js
    participant Sec as services/gh/secrets.js
    participant Shell as lib/shell.js
    participant GHCli as gh CLI
    participant GHApi as GitHub API

    User->>OCLI: ocli gh
    OCLI->>Cfg: loadConfig()
    Cfg-->>OCLI: Danh sách account github.com/*
    OCLI->>GH: run(ctx)

    GH->>Prompt: Chọn account/repo/action
    Prompt-->>GH: User selection

    alt List secrets
        GH->>Sec: listSecrets(repo, token)
        Sec->>Shell: exec(gh secret list ... )
        Shell->>GHCli: run command
        GHCli->>GHApi: GET repo secrets
        GHApi-->>GHCli: result
        GHCli-->>Shell: output
        Shell-->>Sec: output
        Sec-->>GH: parsed result
    else Set single/multi
        GH->>Sec: setSecret(s)
        Sec->>Shell: exec(gh secret set ... )
    else Delete secret
        GH->>Sec: deleteSecret()
        Sec->>Shell: exec(gh secret delete ... )
    end

    GH-->>User: Render kết quả
```

### 3) Sequence cho `ocli azure` (Pipeline Variables)

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant OCLI as bin/ocli.js
    participant Cfg as lib/config.js
    participant Prompt as lib/prompt.js
    participant AZ as services/azure/index.js
    participant Var as services/azure/variables.js
    participant Api as lib/azureApi.js
    participant ADO as Azure DevOps REST API

    User->>OCLI: ocli azure
    OCLI->>Cfg: loadConfig()
    Cfg-->>OCLI: Account dev.azure.com/* + headers
    OCLI->>AZ: run(ctx)

    AZ->>Prompt: Chọn org/project/pipeline/action
    Prompt-->>AZ: User selection

    alt List variables
        AZ->>Var: listVariables(pipelineId)
        Var->>Api: request(GET definition)
        Api->>ADO: GET build/definitions/{id}
        ADO-->>Api: definition.variables
        Api-->>Var: data
        Var-->>AZ: rendered variables
    else Set 1 variable
        AZ->>Var: upsertVariable(name, value, isSecret, allowOverride)
        Var->>Api: GET definition
        Var->>Api: PUT definition (variables updated)
        Api->>ADO: PUT build/definitions/{id}
    else Set batch (JSON/.env)
        AZ->>Var: applyFileVariables(filePath)
        Var->>Api: GET + PUT definition
    else Delete variable
        AZ->>Var: removeVariable(name)
        Var->>Api: GET + PUT definition
    end

    AZ-->>User: Render kết quả
```

### 4) Bảng trách nhiệm module

| Module | Trách nhiệm chính | I/O chính |
|---|---|---|
| `bin/ocli.js` | Router subcommand, khởi tạo context dùng chung | Input: argv, Output: gọi service tương ứng |
| `lib/config.js` | Parse `.git-o-config`, normalize account/provider | Input: file config, Output: account objects |
| `lib/prompt.js` | Giao diện nhập/chọn tương tác CLI | Input: options/schema, Output: selection/value |
| `lib/shell.js` | Chạy command shell (đặc biệt cho `gh`) | Input: command/env, Output: stdout/stderr/exitCode |
| `lib/azureApi.js` | HTTP client tối giản cho Azure DevOps | Input: method/url/body/headers, Output: JSON response |
| `services/gh/*` | Nghiệp vụ GitHub secrets | Input: token/repo/file, Output: danh sách/trạng thái secrets |
| `services/azure/*` | Nghiệp vụ Azure pipeline variables | Input: org/project/pipeline/vars, Output: definition đã cập nhật |

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
| `clip`    | Clipboard workflow — parse path trong header và ghi file theo cwd |

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
