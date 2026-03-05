#!/usr/bin/env bash
# =============================================================================
# alias.sh — Git O-Alias | Windows Git Bash
# Config file: .git-o-config (cùng thư mục với file alias.sh này)
# =============================================================================
#
# ĐĂNG KÝ ALIASES (chạy 1 lần trong Git Bash, thay đường dẫn cho đúng):
#
#   SCRIPT="E:/path/to/alias.sh"
#   git config --global alias.o          "!source \"$SCRIPT\" && o"
#   git config --global alias.oaddcommit "!source \"$SCRIPT\" && oaddcommit"
#   git config --global alias.oclone     "!source \"$SCRIPT\" && oclone"
#   git config --global alias.opull      "!source \"$SCRIPT\" && opull"
#   git config --global alias.opush      "!source \"$SCRIPT\" && opush"
#   git config --global alias.opushforce "!source \"$SCRIPT\" && opushforce"
#   git config --global alias.opullpush  "!source \"$SCRIPT\" && opullpush"
#   git config --global alias.ostash     "!source \"$SCRIPT\" && ostash"
#   git config --global alias.ofetch     "!source \"$SCRIPT\" && ofetch"
#   git config --global alias.oinit      "!source \"$SCRIPT\" && oinit"
#
# =============================================================================
# CẤU HÌNH .git-o-config — INI-style, đặt CÙNG THƯ MỤC với alias.sh
# KHÔNG commit file này lên git (thêm vào .gitignore)
# =============================================================================
#
# LOẠI AUTH:
#   token=xxx   → nhúng vào URL: https://user:TOKEN@host/path
#   header=xxx  → dùng git -c http.extraHeader="xxx"
#   user=xxx    → username đi kèm token (nếu cần, mặc định lấy owner từ URL)
#
# MATCH: pattern dài nhất sẽ được ưu tiên (longest prefix wins)
#
# ── GitHub ────────────────────────────────────────────────────────────────────
# [github.com/myorg]
# token=ghp_xxxxxxxxxxxxxxxxxxxx
#
# [github.com/anotheraccount]
# token=ghp_yyyyyyyyyyyyyyyyyyyy
#
# ── Azure DevOps ──────────────────────────────────────────────────────────────
# PAT cần encode base64: base64(":YOUR_PAT")  (note: để trống phần username)
# PowerShell: [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":YOUR_PAT"))
# [dev.azure.com/myorg]
# header=Authorization: Basic BASE64ENCODEDPAT==
#
# ── GitLab (cloud) ────────────────────────────────────────────────────────────
# [gitlab.com/mygroup]
# token=glpat-xxxxxxxxxxxxxxxxxxxx
#
# ── GitLab (self-hosted) ──────────────────────────────────────────────────────
# [git.mycompany.com]
# header=Authorization: Bearer glpat-xxxx
# (hoặc dùng token= nếu provider chấp nhận embed vào URL)
#
# ── Gitea / Forgejo ───────────────────────────────────────────────────────────
# [gitea.myserver.com/myuser]
# token=GITEA_TOKEN_HERE
# user=myuser
#
# ── Bitbucket ─────────────────────────────────────────────────────────────────
# Dùng App Password: username + app_password nhúng vào URL
# [bitbucket.org/myworkspace]
# token=APP_PASSWORD_HERE
# user=mybitbucketusername
#
# ── Forgejo Bearer ────────────────────────────────────────────────────────────
# [forgejo.myhost.com]
# header=Authorization: token FORGEJO_TOKEN
#
# =============================================================================

# ---------------------------------------------------------------------------
# Đường dẫn config — cùng thư mục với file alias.sh này
# BASH_SOURCE[0] hoạt động đúng khi được `source` trong Git Bash trên Windows
# ---------------------------------------------------------------------------
_O_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
O_CONFIG_FILE="${_O_SCRIPT_DIR}/.git-o-config"

# ---------------------------------------------------------------------------
# HELP
# ---------------------------------------------------------------------------
function o() {
    echo ""
    echo "=== Git O-Alias Commands ==="
    echo "  git o              — Xem danh sách lệnh này"
    echo "  git oaddcommit     — git add -A + auto commit message"
    echo "  git oclone [dir]   — clone repo từ o.url"
    echo "  git opull          — pull từ o.url"
    echo "  git opush          — push lên o.url"
    echo "  git opushforce     — force push lên o.url + o.url0..o.url9"
    echo "  git opullpush      — pull → commit → push"
    echo "  git ostash         — stash drop + clean working dir"
    echo "  git ofetch         — fetch từ o.url"
    echo "  git oinit [url]    — git init + ghi sẵn .git/config chuẩn"
    echo "  git oconfig        — mở .git-o-config bằng VSCode"
    echo ""
    echo "  Config auth: $O_CONFIG_FILE"
    echo ""
    echo "  Set remote URL cho repo:"
    echo "    git config o.url  https://github.com/org/repo.git"
    echo "    git config o.url0 https://gitlab.com/org/repo.git   # mirror"
}


# ---------------------------------------------------------------------------
# OCONFIG: Mo .git-o-config bang VSCode
# ---------------------------------------------------------------------------
function oconfig() {
    local git_config=".git/config"
    if [[ ! -f "$git_config" ]]; then
        echo "[oconfig] ERROR: Khong tim thay $git_config" >&2
        echo "[oconfig]   Hay chay lenh nay trong thu muc chua repo git." >&2
        return 1
    fi
    if command -v code &>/dev/null; then
        code "$git_config"
    else
        echo "[oconfig] ERROR: Khong tim thay lenh 'code' trong PATH." >&2
        echo "[oconfig]   Cai VSCode: https://code.visualstudio.com/" >&2
        echo "[oconfig]   Mo thu cong: $git_config" >&2
        return 1
    fi
}

# ---------------------------------------------------------------------------
# OCONFIGCLEAN: Xóa tất cả alias.* trong .git/config (local repo)
# Buộc git dùng alias global thay vì local override
# ---------------------------------------------------------------------------
function oconfigclean() {
    local git_config=".git/config"
    if [[ ! -f "$git_config" ]]; then
        echo "[oconfigclean] ERROR: Không tìm thấy $git_config" >&2
        echo "[oconfigclean]   Hãy chạy lệnh này trong thư mục chứa repo git." >&2
        return 1
    fi

    # Đếm số alias tìm thấy trước khi xóa
    local count
    count=$(git config --local --list 2>/dev/null | grep -c "^alias\." || true)

    if (( count == 0 )); then
        echo "[oconfigclean] Không có alias nào trong $git_config."
        return 0
    fi

    # Xóa toàn bộ section [alias] trong local .git/config
    git config --local --remove-section alias 2>/dev/null || true

    echo "[oconfigclean] ✓ Đã xóa $count alias khỏi $git_config"
    echo "[oconfigclean]   Git sẽ dùng alias global (~/.gitconfig) từ bây giờ."
}

# ---------------------------------------------------------------------------
# CORE: Parse .git-o-config, tìm auth khớp nhất (longest match) cho URL
#
# Output (biến toàn cục trong cùng shell process):
#   O_AUTH_TYPE   : "token" | "header" | "none"
#   O_AUTH_TOKEN  : token value
#   O_AUTH_USER   : username (optional, dùng với token)
#   O_AUTH_HEADER : header value  (ví dụ: "Authorization: Basic xxx")
#   O_AUTH_MATCH  : pattern đã match
# ---------------------------------------------------------------------------
function _o_resolve_auth() {
    local url="$1"

    O_AUTH_TYPE="none"
    O_AUTH_TOKEN=""
    O_AUTH_USER=""
    O_AUTH_HEADER=""
    O_AUTH_MATCH=""

    if [[ ! -f "$O_CONFIG_FILE" ]]; then
        echo "[o-auth] WARN: Không tìm thấy config: $O_CONFIG_FILE" >&2
        return 0
    fi

    local best_len=0
    local b_type="" b_token="" b_user="" b_header="" b_pattern=""
    local cur_section="" cur_token="" cur_user="" cur_header=""

    # Đánh giá và so sánh section vừa đọc xong
    _flush() {
        if [[ -n "$cur_section" && "$url" == *"$cur_section"* ]]; then
            local slen=${#cur_section}
            if (( slen > best_len )); then
                best_len=$slen
                b_pattern="$cur_section"
                b_token="$cur_token"
                b_user="$cur_user"
                b_header="$cur_header"
                if   [[ -n "$cur_token"  ]]; then b_type="token"
                elif [[ -n "$cur_header" ]]; then b_type="header"
                else                              b_type="none"
                fi
            fi
        fi
    }

    while IFS= read -r raw || [[ -n "$raw" ]]; do
        # Strip Windows CR và trim whitespace
        local line="${raw%%$'\r'}"
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"

        # Bỏ comment và dòng trắng
        [[ -z "$line" || "$line" == \#* ]] && continue

        if   [[ "$line" =~ ^\[(.+)\]$                  ]]; then _flush
             cur_section="${BASH_REMATCH[1]}"; cur_token=""; cur_user=""; cur_header=""
        elif [[ "$line" =~ ^token[[:space:]]*=[[:space:]]*(.+)$  ]]; then cur_token="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^user[[:space:]]*=[[:space:]]*(.+)$   ]]; then cur_user="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^header[[:space:]]*=[[:space:]]*(.+)$ ]]; then cur_header="${BASH_REMATCH[1]}"
        fi
    done < "$O_CONFIG_FILE"

    _flush   # flush section cuối
    unset -f _flush

    O_AUTH_TYPE="$b_type"
    O_AUTH_TOKEN="$b_token"
    O_AUTH_USER="$b_user"
    O_AUTH_HEADER="$b_header"
    O_AUTH_MATCH="$b_pattern"
}

# ---------------------------------------------------------------------------
# CORE: Nhúng token vào URL
# https://host/owner/repo.git  →  https://user:token@host/owner/repo.git
# ---------------------------------------------------------------------------
function _o_embed_token() {
    local url="$1" token="$2" user="$3"

    if [[ "$url" =~ ^(https://)([^/]+)(/.+)$ ]]; then
        local scheme="${BASH_REMATCH[1]}"
        local host="${BASH_REMATCH[2]}"
        local path="${BASH_REMATCH[3]}"

        # Nếu không truyền user, lấy phần đầu tiên của path (owner/org)
        if [[ -z "$user" && "$path" =~ ^/([^/]+)/ ]]; then
            user="${BASH_REMATCH[1]}"
        fi

        if [[ -n "$user" ]]; then
            echo "${scheme}${user}:${token}@${host}${path}"
        else
            echo "${scheme}${token}@${host}${path}"
        fi
    else
        # SSH hoặc format không phải HTTPS — trả nguyên
        echo "$url"
    fi
}

# ---------------------------------------------------------------------------
# CORE: Chạy git command với auth tự động
# Cú pháp: _o_run_git <remote-url> <git-args...>
# Ghi chú: URL phải là arg CUỐI trong git-args khi gọi (push/pull/fetch/clone)
#          Hàm này tự append URL đúng chỗ.
# ---------------------------------------------------------------------------
function _o_run_git() {
    local url="$1"; shift  # tách URL, còn lại là git args (không có URL)
    _o_resolve_auth "$url"

    case "$O_AUTH_TYPE" in
        token)
            local auth_url
            auth_url=$(_o_embed_token "$url" "$O_AUTH_TOKEN" "$O_AUTH_USER")
            echo "[o-auth] token @ [$O_AUTH_MATCH]" >&2
            git "$@" "$auth_url"
            ;;
        header)
            echo "[o-auth] header @ [$O_AUTH_MATCH]" >&2
            git -c "http.extraHeader=${O_AUTH_HEADER}" "$@" "$url"
            ;;
        none|*)
            echo "[o-auth] WARN: Không tìm thấy auth cho URL: $url" >&2
            git "$@" "$url"
            ;;
    esac
}

# ---------------------------------------------------------------------------
# HELPER: Đọc o.url từ git config repo hiện tại
# ---------------------------------------------------------------------------
function _o_get_url() {
    local url
    url=$(git config --get o.url 2>/dev/null)
    if [[ -z "$url" ]]; then
        echo "[o] ERROR: Chưa set o.url cho repo này." >&2
        echo "[o]   Chạy: git config o.url https://github.com/org/repo.git" >&2
        return 1
    fi
    echo "$url"
}

# ---------------------------------------------------------------------------
# COMMIT HELPER: Tự sinh commit message từ git status
# ---------------------------------------------------------------------------
function commitstatus() {
    local tmpfile
    tmpfile=$(mktemp "/tmp/git-o-commit.XXXXXX")

    # Gắn build version nếu có
    if [[ -f .local-webpack-build-version ]]; then
        cat .local-webpack-build-version >> "$tmpfile"
        printf '\n' >> "$tmpfile"
        true > .local-webpack-build-version
    fi

    git status --porcelain \
        | awk '
        {
            # Lấy status code và filepath (bỏ 2 ký tự đầu + space)
            s = substr($0, 1, 2)
            f = substr($0, 4)
            gsub(/^[ \t]+|[ \t]+$/, "", s)

            if (s == "A" || s == "??") {
                added = added (added ? ", " : "") f
            } else if (s == "D") {
                deleted = deleted (deleted ? ", " : "") f
            } else if (s ~ /M/) {
                modified = modified (modified ? ", " : "") f
            }
        }
        END {
            if (added    != "") { n=split(added,    a, ","); print " - Added "    n " file(s): [" added    "]" }
            if (deleted  != "") { n=split(deleted,  a, ","); print " - Deleted "  n " file(s): [" deleted  "]" }
            if (modified != "") { n=split(modified, a, ","); print " - Modified " n " file(s): [" modified "]" }
        }
    ' >> "$tmpfile"

    git commit -F "$tmpfile"
    rm -f "$tmpfile"
}

# ---------------------------------------------------------------------------
# GIT COMMANDS
# ---------------------------------------------------------------------------

# git add -A + commit (với message hoặc auto)
function oaddcommit() {
    git add -A
    if [[ -n "$1" ]]; then
        git commit -m "$1" --allow-empty --allow-empty-message
    else
        commitstatus
    fi
}

# stash + drop + clean
function ostash() {
    git stash
    git stash drop
    git clean -d -f .
}

# fetch
function ofetch() {
    local url; url=$(_o_get_url) || return 1
    _o_run_git "$url" fetch
    echo "[ofetch] Done: $url"
}

# pull
function opull() {
    local url; url=$(_o_get_url) || return 1
    _o_run_git "$url" pull
}

# push (normal)
function opush() {
    local url; url=$(_o_get_url) || return 1
    _o_run_git "$url" push --quiet -u main
    echo "[opush] Done: $url"
}

# clone từ o.url
function oclone() {
    local url; url=$(_o_get_url) || return 1
    local dest="${1:-}"
    _o_resolve_auth "$url"

    case "$O_AUTH_TYPE" in
        token)
            local auth_url
            auth_url=$(_o_embed_token "$url" "$O_AUTH_TOKEN" "$O_AUTH_USER")
            echo "[o-auth] token @ [$O_AUTH_MATCH]" >&2
            git clone "$auth_url" ${dest:+"$dest"}
            ;;
        header)
            echo "[o-auth] header @ [$O_AUTH_MATCH]" >&2
            git -c "http.extraHeader=${O_AUTH_HEADER}" clone "$url" ${dest:+"$dest"}
            ;;
        none|*)
            echo "[o-auth] WARN: Không có auth, clone thẳng..." >&2
            git clone "$url" ${dest:+"$dest"}
            ;;
    esac
}

# force push lên o.url chính + tất cả o.url0 .. o.url9
function opushforce() {
    git add -A
    if [[ -n "$1" ]]; then
        git commit -m "$1" --allow-empty --allow-empty-message
    else
        commitstatus
    fi

    local url; url=$(_o_get_url) || return 1
    _o_force_push_to "$url"

    local i extra_url
    for i in $(seq 0 9); do
        extra_url=$(git config --get "o.url${i}" 2>/dev/null || true)
        [[ -n "$extra_url" ]] && _o_force_push_to "$extra_url"
    done
}

function _o_force_push_to() {
    local url="$1"
    [[ -z "$url" ]] && return 0
    _o_resolve_auth "$url"

    echo "[opushforce] → $url"
    case "$O_AUTH_TYPE" in
        token)
            local auth_url
            auth_url=$(_o_embed_token "$url" "$O_AUTH_TOKEN" "$O_AUTH_USER")
            echo "[o-auth] token @ [$O_AUTH_MATCH]" >&2
            git push --quiet --force -u "$auth_url" main
            ;;
        header)
            echo "[o-auth] header @ [$O_AUTH_MATCH]" >&2
            git -c "http.extraHeader=${O_AUTH_HEADER}" push --quiet --force -u "$url" main
            ;;
        none|*)
            echo "[o-auth] WARN: Không có auth cho $url" >&2
            git push --quiet --force -u "$url" main
            ;;
    esac
    echo "[opushforce] ✓ Done: $url"
}

# pull → add → commit → push
function opullpush() {
    local url; url=$(_o_get_url) || return 1

    echo "[opullpush] Pulling..."
    opull || return 1

    echo "[opullpush] Staging & committing..."
    git add -A
    if [[ -n "$1" ]]; then
        git commit -m "$1" --allow-empty --allow-empty-message
    else
        commitstatus
    fi

    echo "[opullpush] Pushing..."
    _o_resolve_auth "$url"
    case "$O_AUTH_TYPE" in
        token)
            local auth_url
            auth_url=$(_o_embed_token "$url" "$O_AUTH_TOKEN" "$O_AUTH_USER")
            git push --quiet -u "$auth_url" main
            ;;
        header)
            git -c "http.extraHeader=${O_AUTH_HEADER}" push --quiet -u "$url" main
            ;;
        none|*)
            git push --quiet -u "$url" main
            ;;
    esac
    echo "[opullpush] ✓ Done"
}

# ---------------------------------------------------------------------------
# INIT: git init + ghi .git/config từ template
# Template: git-config.template (cùng thư mục với alias.sh)
# Placeholder trong template: {{REMOTE_URL}}
#
# Cú pháp: oinit [remote-url]
#   remote-url : URL remote chính (o.url). Nếu bỏ trống dùng placeholder.
#
# Ví dụ:
#   git oinit
#   git oinit https://github.com/myorg/myrepo.git
# ---------------------------------------------------------------------------
function oinit() {
    local remote_url="${1:-oremoteUrl}"
    local template_file="${_O_SCRIPT_DIR}/git-config.template"
    local git_config=".git/config"

    # --- 1. Kiểm tra template tồn tại ----------------------------------------
    if [[ ! -f "$template_file" ]]; then
        echo "[oinit] ERROR: Không tìm thấy template: $template_file" >&2
        return 1
    fi

    # --- 2. git init ----------------------------------------------------------
    git init --initial-branch=main 2>/dev/null || git init
    git checkout -b main 2>/dev/null || true

    # --- 3. Render template → .git/config (thay {{REMOTE_URL}}) --------------
    sed "s|{{REMOTE_URL}}|${remote_url}|g" "$template_file" > "$git_config"

    echo "[oinit] ✓ git init xong"
    echo "[oinit] ✓ .git/config ghi từ template: $(basename "$template_file")"
    echo "[oinit]   o.url = ${remote_url}"

    if [[ "$remote_url" == "oremoteUrl" ]]; then
        echo "[oinit]   Hãy cập nhật remote URL:"
        echo "[oinit]   git config o.url https://github.com/org/repo.git"
    fi
}