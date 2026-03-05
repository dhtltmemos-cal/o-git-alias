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

Script sẽ tự động đăng ký 11 alias vào git global config. Kiểm tra:

```bash
git config --global --list | grep alias.o
git o
```

---

## Lệnh

| Lệnh                   | Mô tả                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| `git o`                | Hiện danh sách lệnh                                                |
| `git oaddcommit [msg]` | `git add -A` + commit (tự sinh message nếu bỏ trống)               |
| `git oclone [dir]`     | Clone repo từ `o.url`                                              |
| `git opull`            | Pull từ `o.url`                                                    |
| `git opush`            | Push lên `o.url` (branch `main`)                                   |
| `git opushforce [msg]` | add → commit → force push lên `o.url` và tất cả `o.url0`..`o.url9` |
| `git opullpush [msg]`  | pull → add → commit → push                                         |
| `git ostash`           | Stash + drop + clean working dir                                   |
| `git ofetch`           | Fetch từ `o.url`                                                   |
| `git oinit [url]`      | `git init` + ghi `.git/config` từ template                         |
| `git oconfig`          | Mở `.git/config` bằng VSCode                                       |

---

## Thiết lập remote URL cho repo

Thay vì dùng `git remote`, bộ alias này đọc `o.url` từ `.git/config` của repo:

```bash
# Remote chính
git config o.url https://github.com/org/repo.git

# Mirror (tùy chọn) — dùng với opushforce
git config o.url0 https://gitlab.com/org/repo.git
git config o.url1 https://gitea.myserver.com/org/repo.git
```

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

Nếu bỏ trống URL, dùng placeholder — cập nhật sau:

```bash
git oinit
git config o.url https://github.com/myorg/myrepo.git
```

---

## Push lên nhiều remote cùng lúc

Dùng `opushforce` với nhiều `o.url*`:

```bash
git config o.url  https://github.com/org/repo.git
git config o.url0 https://gitlab.com/org/repo.git
git config o.url1 https://gitea.myserver.com/org/repo.git

git opushforce "deploy: release v1.0"
```

Force push sẽ lần lượt đẩy lên tất cả URL theo thứ tự `o.url` → `o.url0` → … → `o.url9`.

---

## Ghi chú

- Tất cả lệnh push/pull/fetch/clone đều **không lưu token vào git credential store** — token chỉ tồn tại trong bộ nhớ lúc chạy lệnh.
- File `.git-o-config` đã được thêm vào `.gitignore` — không bao giờ bị commit nhầm.
- `alias.sh` dùng `BASH_SOURCE[0]` để tự tìm đường dẫn, không cần chỉnh tay sau khi đăng ký.
