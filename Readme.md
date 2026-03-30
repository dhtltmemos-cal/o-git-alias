# Git O-Alias

Bộ alias git tự động xác thực (token / header) cho nhiều provider: GitHub, GitLab, Azure DevOps, Gitea, Forgejo, Bitbucket, v.v.

Hoạt động trên **Windows Git Bash**.

---

## Cấu trúc file

```
alias.sh                  # Script chính — định nghĩa toàn bộ alias
setup-git-aliases.ps1     # Đăng ký alias vào git global config (chạy 1 lần)
git-config.template       # Template .git/config dùng cho lệnh oinit
.git-o-config             # File auth cá nhân — KHÔNG commit (đã có trong .gitignore)
.git-o-config.example     # Ví dụ mẫu cho .git-o-config
.gitignore                # Loại trừ .git-o-config
package.json              # npm scripts cho Windows cmd (được git addfile tạo / cập nhật)
modules/
  ocreateremote.sh        # Module tạo remote repo qua REST API
  oaddfile.sh             # Module tạo file helper (.gitignore, .opushforce.message)
  opushforceurl.sh        # Module force push lên một remote URL được chọn
  opullbranch.sh          # Module fetch remote, chọn branch rồi lấy nội dung về working tree
  oexecute.sh             # Module menu tương tác chọn & chạy lệnh
```

---

## Cài đặt

### Bước 1 — Tạo file auth

Sao chép file mẫu và điền token/header của bạn:

```bash
cp .git-o-config.example .git-o-config
```

Chỉnh sửa `.git-o-config` theo hướng dẫn trong phần **Cấu hình auth** bên dưới.

### Bước 2 — Đăng ký alias (chạy 1 lần)

Mở PowerShell, chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-git-aliases.ps1
```

Hoặc right-click lên `setup-git-aliases.ps1` → **Run with PowerShell**.

Script sẽ tự động đăng ký alias vào git global config. Kiểm tra:

```bash
git config --global --list | grep alias.o
git oe
```

---

## Lệnh

| Lệnh                      | Mô tả                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `git o`                   | Hiện danh sách lệnh                                                |
| `git oexecute`            | **Menu tương tác: chọn số → chạy lệnh** (dành khi quên lệnh nào)  |
| `git oaddcommit [msg]`    | `git add -A` + commit (tự sinh message nếu bỏ trống)               |
| `git oclone [dir]`        | Clone repo từ `o.url`                                              |
| `git opull`               | Pull từ `o.url` (branch hiện tại)                                  |
| `git opullbranch`         | Fetch tất cả remote, lấy nội dung branch và hiện commit/source summary |
| `git opush`               | Push lên `o.url` (branch `main`)                                   |
| `git opushforce [msg]`    | add → commit → force push lên `o.url` và tất cả `o.url0`..`o.url9` |
| `git opushforceurl [msg]` | Chọn một remote URL → force push lên đúng URL đó                   |
| `git opullpush [msg]`     | pull → add → commit → push                                         |
| `git ostash`              | Stash + drop + clean working dir                                   |
| `git ofetch`              | Fetch từ `o.url`                                                   |
| `git oinit [url]`         | `git init` + ghi `.git/config` + tạo file helper mặc định          |
| `git oconfig`             | Mở `.git/config` bằng VSCode                                       |
| `git ocreateremote`       | Tạo remote repo mới qua REST API của provider                      |
| `git addfile <sub>`       | Tạo file helper cho repo                                           |

### `addfile`

```bash
git addfile packagejson
git addfile omessage
git addfile ogitignore
```

Khi chạy `git addfile packagejson`, script sẽ tạo hoặc cập nhật `package.json` trong thư mục hiện tại để thêm npm scripts cho Windows.

Khi chạy `git addfile omessage` hoặc `git addfile ogitignore`, script cũng sẽ đồng bộ `package.json` trước, rồi mới tạo file helper tương ứng.

`addfile` hiện có 3 sub-command:

| Sub-command   | Mô tả |
| ------------ | ----- |
| `packagejson` | Tạo / cập nhật `package.json` và thêm npm scripts Windows |
| `omessage`    | Tạo `.opushforce.message` |
| `ogitignore`  | Tạo / cập nhật `.gitignore` |

Khi đồng bộ `package.json`, script sẽ:

1. Tạo `package.json` nếu chưa có
2. Bổ sung các npm scripts còn thiếu theo tên lệnh **đầy đủ**
3. Không ghi đè scripts đang có sẵn của bạn
4. Giữ phần `scripts` custom của bạn nếu đang có

### Viết tắt

| Viết tắt     | Tương đương         |
| ------------ | ------------------- |
| `git oe`     | `git oexecute`      |
| `git oac`    | `git oaddcommit`    |
| `git ocl`    | `git oclone`        |
| `git opl`    | `git opull`         |
| `git oplb`   | `git opullbranch`   |
| `git ops`    | `git opush`         |
| `git opf`    | `git opushforce`    |
| `git opfurl` | `git opushforceurl` |
| `git opp`    | `git opullpush`     |
| `git ost`    | `git ostash`        |
| `git oft`    | `git ofetch`        |
| `git oi`     | `git oinit`         |
| `git oc`     | `git oconfig`       |
| `git occ`    | `git oconfigclean`  |
| `git ocr`    | `git ocreateremote` |
| `git af`     | `git addfile`       |

---

## Chạy qua npm scripts trên Windows

Sau khi đã chạy một trong hai lệnh bên dưới trong thư mục dự án:

```bash
git addfile packagejson
# hoặc
git addfile omessage
# hoặc
git addfile ogitignore
```

`package.json` sẽ có các npm scripts để mở **cmd.exe mới của Windows** và chạy alias tương ứng ngay trong thư mục hiện tại.

Ví dụ:

```bash
npm run git-addfile-packagejson
npm run git-opushforce
npm run git-opushforceurl
npm run git-oaddcommit
npm run git-addfile-omessage
```

Lưu ý:

- npm scripts **chỉ tạo theo tên đầy đủ**, không tạo key viết tắt như `git-opf`, `git-oac`, `git-af`
- npm scripts này dành cho **Windows**
- Mỗi lần chạy sẽ mở một cửa sổ `cmd.exe` mới
- Nếu `package.json` đã có `scripts` riêng của bạn, `addfile` chỉ thêm script còn thiếu và giữ nguyên script custom

Danh sách npm script được tạo mặc định:

```text
git-o
git-oexecute
git-oaddcommit
git-oclone
git-opull
git-opullbranch
git-opush
git-opushforce
git-opushforceurl
git-opullpush
git-ostash
git-ofetch
git-oinit
git-oconfig
git-oconfigclean
git-ocreateremote
git-addfile
git-addfile-packagejson
git-addfile-omessage
git-addfile-ogitignore
```

---

## Menu tương tác (`oexecute`)

Dùng khi **quên tên lệnh** — không cần nhớ alias, chỉ cần chọn số:

```bash
git oe
# hoặc
git oexecute
```

**Giao diện:**

```
  ┌──────────────────────────────────────────────────────────────────
  │  git oexecute — Chọn lệnh để thực hiện
  ├──────────────────────────────────────────────────────────────────
  │
  │   #   Lệnh                    Viết tắt   Mô tả
  │  ───────────────────────────────────────────────────────────────
  │   1   git oaddcommit          git oac    add -A + auto commit
  │   2   git opush               git ops    push lên o.url
  │   3   git opull               git opl    pull từ o.url
  │   4   git opullbranch         git oplb   fetch remote, lấy nội dung + source summary
  │   5   git opushforce          git opf    force push tất cả remote
  │   6   git opushforceurl       git opfurl force push chọn 1 remote
  │   7   git opullpush           git opp    pull → commit → push
  │   8   git ofetch              git oft    fetch từ o.url
  │   9   git ostash              git ost    stash drop + clean
  │  10   git oinit               git oi     git init + file helper mặc định
  │  11   git oconfig             git oc     mở .git/config bằng VSCode
  │  12   git oconfigclean        git occ    xóa alias local .git/config
  │  13   git ocreateremote       git ocr    tạo remote repo qua API
  │  14   git addfile packagejson git af     tạo / cập nhật package.json
  │  15   git addfile omessage    git af     tạo .opushforce.message
  │  16   git addfile ogitignore  git af     tạo / cập nhật .gitignore
  │  17   git oclone              git ocl    clone repo từ o.url
  │
  │   0   Thoát
  │
  └──────────────────────────────────────────────────────────────────

  Chọn số thứ tự [0-17]: _
```

- Các lệnh cần commit message (oaddcommit, opushforce, v.v.) sẽ được hỏi thêm message ngay sau khi chọn.
- Sau khi lệnh chạy xong, menu hỏi có muốn quay lại chọn tiếp không.

---

## Thiết lập remote URL cho repo

Thay vì dùng `git remote`, bộ alias này đọc `o.url` từ `.git/config` của repo:

```bash
# Remote chính
git config o.url https://github.com/org/repo.git

# Mirror (tùy chọn) — dùng với opushforce / opushforceurl / opullbranch
git config o.url0 https://gitlab.com/org/repo.git
git config o.url1 https://gitea.myserver.com/org/repo.git
```

---

## Fetch branch từ nhiều remote (`opullbranch`)

Dùng khi muốn **xem tất cả branch mới hoặc có commit mới hơn** so với local trên tất cả remote, rồi chọn một để lấy nội dung file về working tree hiện tại mà **không merge ngay**.

```bash
git opullbranch
# hoặc viết tắt
git oplb
```

**Flow:**

1. Fetch toàn bộ `o.url`, `o.url0`..`o.url9` bằng auth đúng cho từng remote
2. Quét tất cả branch từ các remote đã fetch, so sánh với local:
   - **[NEW]** — Branch chưa tồn tại trên local
   - **[AHEAD +N]** — Remote có N commit mới hơn local
   - Branch mà local đã up-to-date hoặc mới hơn → không hiển thị
3. Hiển thị danh sách, chọn branch muốn lấy nội dung
4. Thực hiện:
   - Áp nội dung từ branch đã chọn vào **working tree hiện tại**
   - **Không switch branch**
   - **Không merge commit**
   - In thêm **latest commit message**, body và vài commit gần nhất của branch nguồn để tham khảo khi commit vào `main`
   - Bạn tự review bằng `git status` / `git diff`, rồi merge hoặc commit sau

**Ví dụ output:**

```
  [fetch] o.url       https://github.com/org/repo.git ... ✓
  [fetch] o.url0      https://gitlab.com/org/repo.git ... ✓

  Branch có thể lấy về:

    #     Branch                          Remote        Trạng thái
    ────  ──────────────────────────────  ────────────  ──────────────
    [1]   main                            o.url         [AHEAD +3]
    [2]   feature/auth                    o.url         [AHEAD +1]
    [3]   hotfix/login-bug                o.url0        [NEW]

    [0]  Hủy

  Chọn branch [0-3]: _
```

Remote tạm được tạo trong quá trình fetch và **tự xóa sau khi hoàn thành** — không làm ô nhiễm cấu hình git của repo.

---

## Push lên một remote cụ thể (`opushforceurl`)

Dùng khi bạn có nhiều remote nhưng chỉ muốn push lên **một URL được chọn**, không phải tất cả.

```bash
git opushforceurl
# hoặc viết tắt
git opfurl
```

**Flow tương tác:**

1. Hiển thị danh sách tất cả `o.url`, `o.url0`..`o.url9` đang có
2. Hỏi chọn URL muốn push
3. Kiểm tra working tree:
   - **Sạch** (không có file thay đổi) → chỉ force push, bỏ qua add/commit
   - **Có thay đổi** → `git add -A` + commit (auto message hoặc từ `.opushforce.message`) + force push

---

## Push lên nhiều remote cùng lúc (`opushforce`)

Dùng khi muốn đẩy lên **tất cả** remote một lúc:

```bash
git config o.url  https://github.com/org/repo.git
git config o.url0 https://gitlab.com/org/repo.git
git config o.url1 https://gitea.myserver.com/org/repo.git

git opushforce "deploy: release v1.0"
```

Force push sẽ lần lượt đẩy lên tất cả URL theo thứ tự `o.url` → `o.url0` → … → `o.url9`.

---

## Cấu hình auth (`.git-o-config`)

File đặt **cùng thư mục với `alias.sh`**, định dạng INI. **Không commit file này.**

### Cơ chế match

Pattern **dài hơn** được ưu tiên (longest prefix wins):

```
[github.com/myorg/myrepo]   ← khớp, ưu tiên cao nhất
[github.com/myorg]          ← khớp, ưu tiên giữa
[github.com]                ← khớp, ưu tiên thấp nhất
```

### Loại auth

| Khóa         | Dùng khi nào                                                        |
| ------------ | ------------------------------------------------------------------- |
| `token=xxx`  | Nhúng vào URL: `https://user:TOKEN@host/path`                       |
| `header=xxx` | Gắn qua `-c http.extraHeader="xxx"` (Azure DevOps, Forgejo Bearer…) |
| `user=xxx`   | Username đi kèm `token` (mặc định lấy owner từ URL nếu bỏ trống)    |

### Ví dụ theo từng provider

**GitHub**

```ini
[github.com/myorg]
token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Tạo PAT tại: https://github.com/settings/tokens — scope cần: `repo`

**Azure DevOps**

```ini
[dev.azure.com/myorg]
header=Authorization: Basic BASE64ENCODEDPAT==
```

Encode PAT (username để trống):

```powershell
[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":YOUR_PAT"))
```

Tạo PAT tại: https://dev.azure.com/{org}/_usersSettings/tokens

**GitLab (cloud)**

```ini
[gitlab.com/mygroup]
token=glpat-xxxxxxxxxxxxxxxxxxxx
```

Tạo PAT tại: https://gitlab.com/-/user_settings/personal_access_tokens — scope: `read_repository`, `write_repository`

**GitLab self-hosted**

```ini
[git.mycompany.com/myteam]
token=glpat-selfhosted-token-here
user=myusername
```

**Gitea**

```ini
[gitea.myserver.com/myuser]
token=GITEA_ACCESS_TOKEN_HERE
user=myuser
```

Tạo token tại: `https://gitea.myserver.com/user/settings/applications`

**Forgejo**

```ini
[forgejo.myhost.com/myorg]
header=Authorization: token FORGEJO_TOKEN_HERE
```

**Bitbucket**

```ini
[bitbucket.org/myworkspace]
token=APP_PASSWORD_HERE
user=mybitbucketusername
```

Dùng App Password (không phải account password). Tạo tại: https://bitbucket.org/account/settings/app-passwords/

---

## Khởi tạo repo mới với `oinit`

```bash
# Trong thư mục dự án
git oinit https://github.com/myorg/myrepo.git
```

Lệnh sẽ:

1. Chạy `git init --initial-branch=main`
2. Ghi `.git/config` từ `git-config.template`, thay `{{REMOTE_URL}}` bằng URL bạn truyền vào
3. Tạo `.opushforce.message` trong thư mục hiện tại
4. Tạo / cập nhật `.gitignore` theo template **Node.js + .NET / C#**
5. Tự thêm ignore cho `.git-o-config` và `.opushforce.message`

Nếu bỏ trống URL, dùng placeholder — cập nhật sau:

```bash
git oinit
git config o.url https://github.com/myorg/myrepo.git
```

---

## Ghi chú

- Tất cả lệnh push/pull/fetch/clone đều **không lưu token vào git credential store** — token chỉ tồn tại trong bộ nhớ lúc chạy lệnh.
- File `.git-o-config` và `.opushforce.message` sẽ được thêm vào `.gitignore` — không bị commit nhầm.
- `alias.sh` dùng `BASH_SOURCE[0]` để tự tìm đường dẫn, không cần chỉnh tay sau khi đăng ký.
- `opullbranch` dùng remote tạm `_o_tmp_N` trong quá trình fetch, tự dọn sạch sau khi xong — không ảnh hưởng cấu hình git của repo.
- `opullbranch` yêu cầu working tree sạch trước khi áp nội dung branch khác để tránh ghi đè nhầm thay đổi đang làm dở. Riêng `.opushforce.message` sẽ được bỏ qua.
