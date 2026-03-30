#!/usr/bin/env bash
# =============================================================================
# alias.sh — Git O-Alias | Windows Git Bash
# Config file: .git-o-config (cùng thư mục với file alias.sh này)
# =============================================================================
#
# ĐĂNG KÝ ALIASES (chạy 1 lần trong Git Bash, thay đường dẫn cho đúng):
#
#   SCRIPT="E:/path/to/alias.sh"
#   git config --global alias.o              "!source \"$SCRIPT\" && o"
#   git config --global alias.oaddcommit     "!source \"$SCRIPT\" && oaddcommit"
#   git config --global alias.oac            "!source \"$SCRIPT\" && oaddcommit"
#   git config --global alias.oclone         "!source \"$SCRIPT\" && oclone"
#   git config --global alias.ocl            "!source \"$SCRIPT\" && oclone"
#   git config --global alias.opull          "!source \"$SCRIPT\" && opull"
#   git config --global alias.opl            "!source \"$SCRIPT\" && opull"
#   git config --global alias.opush          "!source \"$SCRIPT\" && opush"
#   git config --global alias.ops            "!source \"$SCRIPT\" && opush"
#   git config --global alias.opushforce     "!source \"$SCRIPT\" && opushforce"
#   git config --global alias.opf            "!source \"$SCRIPT\" && opushforce"
#   git config --global alias.opushforceurl  "!source \"$SCRIPT\" && opushforceurl"
#   git config --global alias.opfurl         "!source \"$SCRIPT\" && opushforceurl"
#   git config --global alias.opullpush      "!source \"$SCRIPT\" && opullpush"
#   git config --global alias.opp            "!source \"$SCRIPT\" && opullpush"
#   git config --global alias.ostash         "!source \"$SCRIPT\" && ostash"
#   git config --global alias.ost            "!source \"$SCRIPT\" && ostash"
#   git config --global alias.ofetch         "!source \"$SCRIPT\" && ofetch"
#   git config --global alias.oft            "!source \"$SCRIPT\" && ofetch"
#   git config --global alias.oinit          "!source \"$SCRIPT\" && oinit"
#   git config --global alias.oi             "!source \"$SCRIPT\" && oinit"
#   git config --global alias.oconfig        "!source \"$SCRIPT\" && oconfig"
#   git config --global alias.oc             "!source \"$SCRIPT\" && oconfig"
#   git config --global alias.oconfigclean   "!source \"$SCRIPT\" && oconfigclean"
#   git config --global alias.occ            "!source \"$SCRIPT\" && oconfigclean"
#   git config --global alias.ocreateremote  "!source \"$SCRIPT\" && ocreateremote"
#   git config --global alias.ocr            "!source \"$SCRIPT\" && ocreateremote"
#   git config --global alias.addfile        "!source \"$SCRIPT\" && addfile"
#   git config --global alias.af             "!source \"$SCRIPT\" && addfile"
#   git config --global alias.oexecute       "!source \"$SCRIPT\" && oexecute"
#   git config --global alias.oe             "!source \"$SCRIPT\" && oexecute"
#   git config --global alias.opullbranch    "!source \"$SCRIPT\" && opullbranch"
#   git config --global alias.oplb           "!source \"$SCRIPT\" && opullbranch"
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
    echo ""
    echo "  Lệnh đầy đủ           Viết tắt   Mô tả"
    echo "  ──────────────────────────────────────────────────────────────"
    echo "  git o                            Xem danh sách lệnh này"
    echo "  git oexecute          git oe     Menu chọn & chạy lệnh (interactive)"
    echo "  git oaddcommit        git oac    git add -A + auto commit message"
    echo "  git oclone [dir]      git ocl    clone repo từ o.url"
    echo "  git opull             git opl    pull từ o.url (branch hiện tại)"
    echo "  git opullbranch       git oplb   fetch remote, lấy nội dung + source summary"
    echo "  git opush             git ops    push lên o.url"
    echo "  git opushforce        git opf    force push lên o.url + o.url0..o.url9"
    echo "  git opushforceurl     git opfurl force push lên một remote URL được chọn"
    echo "  git opullpush         git opp    pull → commit → push"
    echo "  git ostash            git ost    stash drop + clean working dir"
    echo "  git ofetch            git oft    fetch từ o.url"
    echo "  git oinit [url]       git oi     git init + ghi .git/config + file helper"
    echo "  git oconfig           git oc     mở .git/config bằng VSCode"
    echo "  git oconfigclean      git occ    xóa alias local trong .git/config"
    echo "  git ocreateremote     git ocr    tạo remote repo mới qua API provider"
    echo "  git addfile <sub>     git af     tạo file helper cho repo"
    echo "    addfile packagejson            tạo / cập nhật package.json"
    echo "    addfile omessage               tạo .opushforce.message"
    echo "    addfile ogitignore             tạo / cập nhật .gitignore"
    echo ""
    echo "  Windows npm scripts:"
    echo "    Muốn tạo package.json: git addfile packagejson"
    echo "    Sau đó dùng: npm run git-addfile-packagejson | npm run git-opushforce | npm run git-oaddcommit"
    echo "    npm scripts chỉ dùng tên đầy đủ, không dùng alias viết tắt"
    echo ""
    echo "  Config auth: $O_CONFIG_FILE"
    echo ""
    echo "  Set remote URL cho repo:"
    echo "    git config o.url  https://github.com/org/repo.git"
    echo "    git config o.url0 https://gitlab.com/org/repo.git   # mirror"
}


# ---------------------------------------------------------------------------
# OCONFIG: Mo .git/config bang VSCode
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
# ---------------------------------------------------------------------------
function oconfigclean() {
    local git_config=".git/config"
    if [[ ! -f "$git_config" ]]; then
        echo "[oconfigclean] ERROR: Không tìm thấy $git_config" >&2
        echo "[oconfigclean]   Hãy chạy lệnh này trong thư mục chứa repo git." >&2
        return 1
    fi

    local count
    count=$(git config --local --list 2>/dev/null | grep -c "^alias\." || true)

    if (( count == 0 )); then
        echo "[oconfigclean] Không có alias nào trong $git_config."
        return 0
    fi

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
        local line="${raw%%$'\r'}"
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"

        [[ -z "$line" || "$line" == \#* ]] && continue

        if   [[ "$line" =~ ^\[(.+)\]$                  ]]; then _flush
             cur_section="${BASH_REMATCH[1]}"; cur_token=""; cur_user=""; cur_header=""
        elif [[ "$line" =~ ^token[[:space:]]*=[[:space:]]*(.+)$  ]]; then cur_token="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^user[[:space:]]*=[[:space:]]*(.+)$   ]]; then cur_user="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^header[[:space:]]*=[[:space:]]*(.+)$ ]]; then cur_header="${BASH_REMATCH[1]}"
        fi
    done < "$O_CONFIG_FILE"

    _flush
    unset -f _flush

    O_AUTH_TYPE="$b_type"
    O_AUTH_TOKEN="$b_token"
    O_AUTH_USER="$b_user"
    O_AUTH_HEADER="$b_header"
    O_AUTH_MATCH="$b_pattern"
}

# ---------------------------------------------------------------------------
# CORE: Nhúng token vào URL
# ---------------------------------------------------------------------------
function _o_embed_token() {
    local url="$1" token="$2" user="$3"

    if [[ "$url" =~ ^(https://)([^/]+)(/.+)$ ]]; then
        local scheme="${BASH_REMATCH[1]}"
        local host="${BASH_REMATCH[2]}"
        local path="${BASH_REMATCH[3]}"

        if [[ -z "$user" && "$path" =~ ^/([^/]+)/ ]]; then
            user="${BASH_REMATCH[1]}"
        fi

        if [[ -n "$user" ]]; then
            echo "${scheme}${user}:${token}@${host}${path}"
        else
            echo "${scheme}${token}@${host}${path}"
        fi
    else
        echo "$url"
    fi
}

# ---------------------------------------------------------------------------
# CORE: Chạy git command với auth tự động
# ---------------------------------------------------------------------------
function _o_run_git() {
    local url="$1"; shift
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

    if [[ -f .local-webpack-build-version ]]; then
        cat .local-webpack-build-version >> "$tmpfile"
        printf '\n' >> "$tmpfile"
        true > .local-webpack-build-version
    fi

    git status --porcelain \
        | awk '
        {
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

function oaddcommit() {
    git add -A
    if [[ -n "$*" ]]; then
        git commit -m "$*" --allow-empty --allow-empty-message
    else
        commitstatus
    fi
}

function ostash() {
    git stash
    git stash drop
    git clean -d -f .
}

function ofetch() {
    local url; url=$(_o_get_url) || return 1
    _o_run_git "$url" fetch
    echo "[ofetch] Done: $url"
}

function opull() {
    local url; url=$(_o_get_url) || return 1
    _o_run_git "$url" pull
}

function opush() {
    local url; url=$(_o_get_url) || return 1
    _o_run_git "$url" push --quiet main
    echo "[opush] Done: $url"
}

function oclone() {
    local first_arg="${1:-}"
    local url dest

    # Nếu arg đầu tiên trông như URL → dùng luôn, không cần o.url
    if [[ "$first_arg" =~ ^https?:// || "$first_arg" =~ ^git@ ]]; then
        url="$first_arg"
        dest="${2:-}"
    else
        # Không có URL truyền vào → đọc từ o.url như cũ
        url=$(_o_get_url) || return 1
        dest="$first_arg"
    fi

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

function opushforce() {
    git add -A

    if [[ -n "$*" ]]; then
        git commit -m "$*" --allow-empty --allow-empty-message
    else
        local msg_file=".opushforce.message"
        local file_msg=""
        if [[ -f "$msg_file" ]]; then
            file_msg=$(cat "$msg_file")
            file_msg="${file_msg#"${file_msg%%[![:space:]]*}"}"
            file_msg="${file_msg%"${file_msg##*[![:space:]]}"}"
        fi

        if [[ -n "$file_msg" ]]; then
            echo "[opushforce] Dùng message từ $msg_file"
            git commit -m "$file_msg" --allow-empty --allow-empty-message
            true > "$msg_file"
            echo "[opushforce] Đã clear nội dung $msg_file"
        else
            commitstatus
        fi
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
            git push --quiet --force "$auth_url" main
            ;;
        header)
            echo "[o-auth] header @ [$O_AUTH_MATCH]" >&2
            git -c "http.extraHeader=${O_AUTH_HEADER}" push --quiet --force "$url" main
            ;;
        none|*)
            echo "[o-auth] WARN: Không có auth cho $url" >&2
            git push --quiet --force "$url" main
            ;;
    esac
    echo "[opushforce] ✓ Done: $url"
}

function opullpush() {
    local url; url=$(_o_get_url) || return 1

    echo "[opullpush] Pulling..."
    opull || return 1

    echo "[opullpush] Staging & committing..."
    git add -A
    if [[ -n "$*" ]]; then
        git commit -m "$*" --allow-empty --allow-empty-message
    else
        commitstatus
    fi

    echo "[opullpush] Pushing..."
    _o_resolve_auth "$url"
    case "$O_AUTH_TYPE" in
        token)
            local auth_url
            auth_url=$(_o_embed_token "$url" "$O_AUTH_TOKEN" "$O_AUTH_USER")
            git push --quiet "$auth_url" main
            ;;
        header)
            git -c "http.extraHeader=${O_AUTH_HEADER}" push --quiet "$url" main
            ;;
        none|*)
            git push --quiet "$url" main
            ;;
    esac
    echo "[opullpush] ✓ Done"
}

function oinit() {
    local remote_url="${1:-oremoteUrl}"
    local template_file="${_O_SCRIPT_DIR}/git-config.template"
    local git_config=".git/config"
    local omessage_file=".opushforce.message"
    local gitignore_file=".gitignore"

    if [[ ! -f "$template_file" ]]; then
        echo "[oinit] ERROR: Không tìm thấy template: $template_file" >&2
        return 1
    fi

    git init --initial-branch=main 2>/dev/null || git init
    git checkout -b main 2>/dev/null || true

    sed "s|{{REMOTE_URL}}|${remote_url}|g" "$template_file" > "$git_config"

    echo "[oinit] ✓ git init xong"
    echo "[oinit] ✓ .git/config ghi từ template: $(basename "$template_file")"
    echo "[oinit]   o.url = ${remote_url}"

    if declare -F _oaf_ensure_omessage_file >/dev/null 2>&1; then
        if _oaf_ensure_omessage_file "$omessage_file"; then
            echo "[oinit] ✓ Đã tạo $omessage_file"
        else
            echo "[oinit] • Đã có sẵn $omessage_file"
        fi
    else
        if [[ ! -f "$omessage_file" ]]; then
            touch "$omessage_file"
            echo "[oinit] ✓ Đã tạo $omessage_file"
        else
            echo "[oinit] • Đã có sẵn $omessage_file"
        fi
    fi

    echo "[oinit] → Tạo / cập nhật $gitignore_file (Node.js + .NET / C#)..."
    if declare -F _oaf_apply_gitignore_profile >/dev/null 2>&1; then
        _oaf_apply_gitignore_profile "$gitignore_file" "both"
    else
        [[ -f "$gitignore_file" ]] || touch "$gitignore_file"
        if ! grep -qxF ".git-o-config" "$gitignore_file" 2>/dev/null; then
            echo ".git-o-config" >> "$gitignore_file"
        fi
        if ! grep -qxF ".opushforce.message" "$gitignore_file" 2>/dev/null; then
            echo ".opushforce.message" >> "$gitignore_file"
        fi
    fi

    if [[ "$remote_url" == "oremoteUrl" ]]; then
        echo "[oinit]   Hãy cập nhật remote URL:"
        echo "[oinit]   git config o.url https://github.com/myorg/myrepo.git"
    fi
}

# =============================================================================
# MODULES — Load các module mở rộng từ thư mục modules/
# Mỗi module tự có guard chống load lại (idempotent).
# Thêm module mới: tạo file modules/<tên>.sh, source ở đây.
# =============================================================================
_O_MODULES_DIR="${_O_SCRIPT_DIR}/modules"

[[ -f "${_O_MODULES_DIR}/ocreateremote.sh" ]] \
    && source "${_O_MODULES_DIR}/ocreateremote.sh"

[[ -f "${_O_MODULES_DIR}/oaddfile.sh" ]] \
    && source "${_O_MODULES_DIR}/oaddfile.sh"

[[ -f "${_O_MODULES_DIR}/opushforceurl.sh" ]] \
    && source "${_O_MODULES_DIR}/opushforceurl.sh"

[[ -f "${_O_MODULES_DIR}/opullbranch.sh" ]] \
    && source "${_O_MODULES_DIR}/opullbranch.sh"

[[ -f "${_O_MODULES_DIR}/oexecute.sh" ]] \
    && source "${_O_MODULES_DIR}/oexecute.sh"

# =============================================================================
# (Thêm module mới phía dưới theo cùng pattern)
# [[ -f "${_O_MODULES_DIR}/otemplate.sh" ]] && source "${_O_MODULES_DIR}/otemplate.sh"
# =============================================================================
