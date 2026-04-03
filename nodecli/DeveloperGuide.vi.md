# DeveloperGuide — nodecli / ocli

Tài liệu này mô tả quy tắc tổ chức code, cách mở rộng và quy trình đóng gói ZIP.  
Mục tiêu: đọc xong là làm được, không cần hỏi thêm.

---

## 1. Cấu trúc thư mục

```
nodecli/
  bin/
    ocli.js                     ← Entry point duy nhất, dispatcher subcommand
  lib/
    config.js                   ← Parse .git-o-config, shared bởi mọi service
    prompt.js                   ← Helper menu/input tương tác (readline)
    shell.js                    ← Helper chạy lệnh shell (child_process)
  services/
    gh/
      index.js                  ← Subcommand `ocli gh`: chọn account → repo → nghiệp vụ
      secrets.js                ← Nghiệp vụ: quản lý repo secrets
    <provider>/                 ← Thêm provider mới ở đây (xem mục 3)
      index.js
      <nghiep-vu>.js
  templates/
    gh-secrets.json             ← Template JSON để set nhiều secrets
    gh-secrets.env.example      ← Template .env để set nhiều secrets
  package.json
  README.md
  DeveloperGuide.vi.md          ← File này
  ProjectStructure.md           ← Sơ đồ module (cập nhật khi thêm service)
  USER_CHANGELOG.md             ← Lịch sử thay đổi (mới nhất ở đầu)
```

---

## 2. Nguyên tắc tổ chức code

### 2.1 Quy ước chung

- **CommonJS** (`require` / `module.exports`) — không dùng ES Modules (`import`/`export`)
- **Không có dependency ngoài** — chỉ dùng Node built-ins (`readline`, `child_process`, `fs`, `path`, `os`)
- **Mỗi service là một thư mục riêng** trong `services/` — độc lập, không `require` lẫn nhau
- **Shared code** chỉ nằm trong `lib/` — service nào cũng có thể dùng
- **Logging** dùng label dạng `[tên-module]` ở đầu mỗi dòng log, ví dụ: `[gh]`, `[gh:secrets]`, `[config]`
- **Không hardcode** token, URL hay bất kỳ giá trị nhạy cảm nào trong code

### 2.2 Quy ước đặt tên file

| Vị trí | Quy tắc đặt tên | Ví dụ |
|--------|-----------------|-------|
| `services/<provider>/` | Tên nghiệp vụ (danh từ, lowercase) | `secrets.js`, `repos.js`, `actions.js` |
| `lib/` | Tên chức năng (danh từ, lowercase) | `config.js`, `prompt.js`, `shell.js` |
| `templates/` | `<provider>-<mục-đích>.<ext>` | `gh-secrets.json`, `azure-vars.json` |

### 2.3 Cấu trúc một file service

```js
// services/<provider>/<nghiep-vu>.js — Mô tả nghiệp vụ
'use strict';

const { spawn } = require('../../lib/shell');
const { ask, confirm, selectMenu } = require('../../lib/prompt');

const LOG = '[<provider>:<nghiep-vu>]';

// Các hàm private — đặt tên động từ + danh từ, camelCase
async function listItems(repo, account) { ... }
async function createItem(repo, account) { ... }

// Hàm public duy nhất — luôn tên là `run`, export ra ngoài
async function run(repo, account) {
  while (true) {
    const idx = await selectMenu('Tiêu đề menu', [
      { label: 'Chức năng 1' },
      { label: 'Chức năng 2' },
    ]);
    if (idx === -1) break;
    if (idx === 0) await listItems(repo, account);
    if (idx === 1) await createItem(repo, account);
  }
}

module.exports = { run };
```

---

## 3. Thêm subcommand / provider mới

### Bước 1 — Tạo thư mục service

```
nodecli/services/<provider>/
  index.js        ← Bắt buộc: chứa async function run()
  <nghiep-vu>.js  ← Mỗi nghiệp vụ 1 file
```

### Bước 2 — Viết `index.js`

`index.js` phải export hàm `run()` không nhận tham số (tự hỏi user qua prompt):

```js
// services/<provider>/index.js
'use strict';

const { loadSections, filterByProvider } = require('../../lib/config');
const { selectMenu } = require('../../lib/prompt');
const nghiepVu1 = require('./<nghiep-vu-1>');

const LOG = '[<provider>]';

async function run() {
  // 1. Đọc config + chọn account
  // 2. Chọn resource (repo, project, v.v.)
  // 3. Vòng lặp chọn nghiệp vụ
}

module.exports = { run };
```

### Bước 3 — Đăng ký trong `bin/ocli.js`

Mở `bin/ocli.js`, thêm vào object `SUBCOMMANDS`:

```js
const SUBCOMMANDS = {
  gh:       () => require('../services/gh/index').run(),
  azure:    () => require('../services/azure/index').run(),   // thêm dòng này
  // <provider>: () => require('../services/<provider>/index').run(),
};
```

Không cần thay đổi gì thêm — `printHelp()` cần cập nhật mô tả subcommand mới:

```js
console.log('    <provider>  Mô tả ngắn gọn');
```

### Bước 4 — Thêm template (nếu cần)

Nếu nghiệp vụ hỗ trợ nhập từ file, thêm template vào `templates/`:
- `<provider>-<muc-dich>.json`
- `<provider>-<muc-dich>.env.example`

---

## 4. Thêm nghiệp vụ mới vào service đã có

Ví dụ thêm nghiệp vụ "Variables" vào `ocli gh`:

> Lưu ý: khi thêm subcommand mới (ví dụ `ocli clip`), cần cập nhật đồng thời `bin/ocli.js`, `README.md`, `ProjectStructure.md`, `USER_CHANGELOG.md`.


**Bước 1** — Tạo `services/gh/variables.js` theo cấu trúc chuẩn ở mục 2.3.

**Bước 2** — Trong `services/gh/index.js`, thêm require và mục menu:

```js
const variables = require('./variables');  // thêm dòng require

// Trong selectMenu của vòng lặp nghiệp vụ:
{ label: 'Variables — quản lý repo variables' },   // thêm item

// Trong phần xử lý idx:
if (featureIdx === 1) await variables.run(selectedRepo, account);
```

---

## 5. Sử dụng `lib/`

### `lib/config.js`

```js
const { loadSections, filterByProvider, parseSection } = require('../../lib/config');

// Lấy tất cả sections
const { sections } = loadSections();  // throw nếu không tìm thấy .git-o-config

// Lọc theo provider
const ghSections = filterByProvider(sections, 'github.com');
const azureSections = filterByProvider(sections, 'dev.azure.com');

// Parse section string → host, owner, extra
const { host, owner, extra } = parseSection('dev.azure.com/myorg/myproject');
// → { host: 'dev.azure.com', owner: 'myorg', extra: 'myproject' }
```

Mỗi section object có dạng: `{ section, token, user, header }`

### `lib/prompt.js`

```js
const { ask, confirm, selectMenu, askFilePath } = require('../../lib/prompt');

// Hỏi text (có default)
const name = await ask('Tên repo', 'my-repo');

// Confirm y/n
const ok = await confirm('Tiếp tục?');         // default Yes
const ok = await confirm('Xóa?', false);        // default No

// Menu chọn số (trả về index 0-based, -1 nếu chọn Hủy)
const idx = await selectMenu('Tiêu đề', [
  { label: 'Chọn A' },
  { label: 'Chọn B' },
]);
if (idx === -1) return;  // user chọn Hủy

// Hỏi đường dẫn file (validate tồn tại)
const filePath = await askFilePath('Đường dẫn file config');
```

### `lib/azureApi.js`

```js
const { azureRequest } = require('../../lib/azureApi');

// Gọi Azure DevOps REST API
const res = await azureRequest({
  method: 'GET',            // GET | POST | PUT | PATCH | DELETE
  org: 'myorg',             // Azure org name
  path: 'myproject/_apis/build/definitions?api-version=7.1',
  account,                  // { section, token, user, header } từ config
  body: { name: 'val' },   // optional, chỉ dùng với POST/PUT/PATCH
});

// res: { ok: boolean, status: number, data: object|null }
if (res.ok) {
  const items = res.data.value;
}
```

Auth được build tự động:
- `account.header` dạng `"Authorization: Basic xxx"` → dùng thẳng
- `account.token` (PAT) → tự encode `Basic base64(:token)`

### `lib/shell.js`

```js
const { run, spawn, commandExists } = require('../../lib/shell');

// Chạy lệnh đơn giản — throw nếu lỗi
const output = run('git rev-parse HEAD');

// Chạy lệnh với args array + env — không throw
const env = { ...process.env, GH_TOKEN: account.token };
const result = spawn('gh', ['repo', 'list', owner, '--json', 'name'], { env });
if (result.ok) {
  const repos = JSON.parse(result.stdout);
}

// Kiểm tra lệnh tồn tại
if (!commandExists('gh')) { ... }
```

---

## 6. Quy trình đóng gói ZIP

### 6.1 Quy tắc đặt tên ZIP

```
ocli.<version>.<noi-dung-thay-doi>.zip
```

Ví dụ:
- `ocli.1.0.0.feat-gh-secrets.zip`
- `ocli.1.1.0.feat-azure-pipelines.zip`
- `ocli.1.1.1.fix-token-env.zip`

**Quy tắc version:**
- Tăng **patch** (x.x.+1) cho bugfix
- Tăng **minor** (x.+1.0) cho tính năng mới
- Tăng **major** (+1.0.0) khi thay đổi cấu trúc lớn (đổi tên CLI, đổi format config, v.v.)

### 6.2 Cấu trúc bên trong ZIP

ZIP phải chứa **đúng** thư mục `nodecli/` ở gốc, để sau khi giải nén chép đè vào repo là dùng được ngay:

```
ocli.1.0.0.feat-gh-secrets.zip
└── nodecli/
    ├── bin/
    │   └── ocli.js
    ├── lib/
    │   ├── config.js
    │   ├── prompt.js
    │   └── shell.js
    ├── services/
    │   └── gh/
    │       ├── index.js
    │       └── secrets.js
    ├── templates/
    │   ├── gh-secrets.json
    │   └── gh-secrets.env.example
    ├── package.json
    ├── README.md
    ├── DeveloperGuide.vi.md
    ├── ProjectStructure.md
    └── USER_CHANGELOG.md
```

### 6.3 Lệnh tạo ZIP (chạy từ thư mục gốc của repo)

```bash
# Từ thư mục gốc (nơi chứa nodecli/, alias.sh, v.v.)
zip -r ocli.1.0.0.feat-gh-secrets.zip nodecli/ \
  --exclude "nodecli/node_modules/*" \
  --exclude "nodecli/.git/*"
```

**Kiểm tra nội dung trước khi giao:**
```bash
unzip -l ocli.1.0.0.feat-gh-secrets.zip
```

Đảm bảo:
- Tất cả đường dẫn đều bắt đầu bằng `nodecli/`
- Không có `node_modules/`
- Không có file tạm (`*.tmp`, `*.log`)

### 6.4 Checklist trước khi zip

```
- [ ] package.json đã cập nhật version
- [ ] README.md đã cập nhật (nếu thêm tính năng / thay đổi cách dùng)
- [ ] DeveloperGuide.vi.md đã cập nhật (nếu thêm service / lib mới)
- [ ] ProjectStructure.md đã cập nhật (nếu thêm thư mục / file mới)
- [ ] USER_CHANGELOG.md đã có entry mới ở đầu
- [ ] .opushforce.message đã tạo với commit message đúng format
- [ ] Không có node_modules/ trong ZIP
- [ ] Tên ZIP đúng format: ocli.<version>.<noi-dung>.zip
- [ ] Cấu trúc trong ZIP bắt đầu bằng nodecli/
```

---

## 7. Lưu ý khi AI agent làm việc với dự án này

- **Không được** tạo file với tên chứa `{` hoặc `}` — sẽ gây lỗi khi zip
- **Không được** dùng ES Modules — luôn dùng `require` / `module.exports`
- **Không được** thêm dependency ngoài vào `package.json` mà không ghi rõ lý do
- **Mỗi lần thêm service mới** phải cập nhật đồng thời: `bin/ocli.js`, `README.md`, `ProjectStructure.md`, `DeveloperGuide.vi.md`
- **Mỗi lần thêm nghiệp vụ** trong service đã có phải cập nhật: `services/<provider>/index.js` (thêm require + menu item), `README.md`
- **Luôn dùng** `const LOG = '[<module>]'` để log có label rõ ràng
