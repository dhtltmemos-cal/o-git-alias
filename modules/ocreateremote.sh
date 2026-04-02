#!/usr/bin/env bash
# =============================================================================
# modules/ocreateremote.sh — Tạo remote repo qua REST API của provider
# Được load tự động bởi alias.sh — KHÔNG source trực tiếp file này
#
# Phụ thuộc (inject từ alias.sh trước khi source):
#   _O_SCRIPT_DIR   — thư mục gốc của alias.sh
#   O_CONFIG_FILE   — đường dẫn đến .git-o-config
#   _o_resolve_auth — hàm resolve auth từ .git-o-config
#
# Flow (interactive wizard):
#   1. Đọc .git-o-config → list tất cả [section] → menu chọn provider/account
#   2. Hỏi repo name     (default: tên thư mục hiện tại)
#   3. Hỏi visibility    (default: private)
#   4. Hỏi description   (default: rỗng, tùy chọn)
#   5. Confirm summary   → gọi API
#   6. Lưu URL vào .git/config: o.url nếu chưa có, không thì o.url0..o.url9
# =============================================================================

[[ -n "${_O_MODULE_CREATEREMOTE_LOADED:-}" ]] && return 0
_O_MODULE_CREATEREMOTE_LOADED=1

# ---------------------------------------------------------------------------
# HELPER: Đọc .git-o-config → in danh sách section name (mỗi dòng 1 cái)
# ---------------------------------------------------------------------------
function _o_list_config_sections() {
    [[ ! -f "$O_CONFIG_FILE" ]] && return 0
    local line
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%%$'\r'}"                           # strip CR
        line="${line#"${line%%[![:space:]]*}"}"         # trim leading
        line="${line%"${line##*[![:space:]]}"}"         # trim trailing
        [[ "$line" =~ ^\[(.+)\]$ ]] && echo "${BASH_REMATCH[1]}"
    done < "$O_CONFIG_FILE"
}

# ---------------------------------------------------------------------------
# HELPER: Detect provider từ hostname
# ---------------------------------------------------------------------------
function _o_detect_provider() {
    local h="${1,,}"
    if   [[ "$h" == *"github.com"* ]];    then echo "github"
    elif [[ "$h" == *"dev.azure.com"* ]]; then echo "azure"
    elif [[ "$h" == *"bitbucket.org"* ]]; then echo "bitbucket"
    elif [[ "$h" == *"forgejo"* ]];       then echo "forgejo"
    elif [[ "$h" == *"gitea"* ]];         then echo "gitea"
    elif [[ "$h" == *"gitlab"* ]];        then echo "gitlab"
    else                                       echo "unknown"
    fi
}

# ---------------------------------------------------------------------------
# HELPER: Tên đẹp của provider để hiển thị
# ---------------------------------------------------------------------------
function _o_provider_label() {
    case "$(_o_detect_provider "$1")" in
        github)    echo "GitHub" ;;
        gitlab)    echo "GitLab" ;;
        azure)     echo "Azure DevOps" ;;
        gitea)     echo "Gitea" ;;
        forgejo)   echo "Forgejo" ;;
        bitbucket) echo "Bitbucket" ;;
        *)         echo "Unknown" ;;
    esac
}

# ---------------------------------------------------------------------------
# HELPER: Parse "host/owner[/project]" từ section name
# → set _O_HOST, _O_OWNER, _O_AZURE_PROJECT_FROM_CONFIG
#
# Ví dụ:
#   [dev.azure.com/myorg]          → _O_HOST=dev.azure.com  _O_OWNER=myorg  _O_AZURE_PROJECT_FROM_CONFIG=""
#   [dev.azure.com/myorg/myproj]   → _O_HOST=dev.azure.com  _O_OWNER=myorg  _O_AZURE_PROJECT_FROM_CONFIG=myproj
# ---------------------------------------------------------------------------
function _o_parse_section() {
    local section="$1"
    _O_AZURE_PROJECT_FROM_CONFIG=""

    if [[ "$section" =~ ^([^/]+)/([^/]+)/(.+)$ ]]; then
        # Ba phần: host / owner / project
        _O_HOST="${BASH_REMATCH[1]}"
        _O_OWNER="${BASH_REMATCH[2]}"
        _O_AZURE_PROJECT_FROM_CONFIG="${BASH_REMATCH[3]}"
    elif [[ "$section" =~ ^([^/]+)/(.+)$ ]]; then
        # Hai phần: host / owner
        _O_HOST="${BASH_REMATCH[1]}"
        _O_OWNER="${BASH_REMATCH[2]}"
    else
        _O_HOST="$section"
        _O_OWNER=""
    fi
}

# ---------------------------------------------------------------------------
# HELPER: Parse URL → set _O_HOST, _O_OWNER, _O_REPO_PATH_RAW
# ---------------------------------------------------------------------------
function _o_parse_url() {
    local url="$1"
    _O_HOST="" _O_OWNER="" _O_REPO_PATH_RAW=""
    if [[ "$url" =~ ^https?://([^/@]+@)?([^/]+)(/.*)$ ]]; then
        _O_HOST="${BASH_REMATCH[2]}"
        _O_REPO_PATH_RAW="${BASH_REMATCH[3]}"
        [[ "$_O_REPO_PATH_RAW" =~ ^/([^/]+)/ ]] && _O_OWNER="${BASH_REMATCH[1]}"
    fi
}

# ---------------------------------------------------------------------------
# HELPER: Tìm slot o.url trống tiếp theo
# Thứ tự: o.url → o.url0 → o.url1 → ... → o.url9
# Output: key (VD: "o.url", "o.url3") hoặc "" nếu hết slot
# ---------------------------------------------------------------------------
function _o_next_url_slot() {
    local existing
    existing=$(git config --get o.url 2>/dev/null || true)
    [[ -z "$existing" ]] && echo "o.url" && return 0

    local i
    for i in $(seq 0 9); do
        existing=$(git config --get "o.url${i}" 2>/dev/null || true)
        [[ -z "$existing" ]] && echo "o.url${i}" && return 0
    done
    echo ""
}

# ---------------------------------------------------------------------------
# HELPER: Gọi curl API với auth header đúng theo provider
# Requires: O_AUTH_TYPE, O_AUTH_TOKEN, O_AUTH_USER, O_AUTH_HEADER, _O_HOST
# ---------------------------------------------------------------------------
function _o_curl_api() {
    local method="$1" api_url="$2" body="$3" dry_run="${4:-0}"

    local provider
    provider=$(_o_detect_provider "$_O_HOST")

    local auth_header=""
    case "$O_AUTH_TYPE" in
        token)
            case "$provider" in
                github)    auth_header="Authorization: Bearer ${O_AUTH_TOKEN}" ;;
                gitlab)    auth_header="PRIVATE-TOKEN: ${O_AUTH_TOKEN}" ;;
                gitea)     auth_header="Authorization: token ${O_AUTH_TOKEN}" ;;
                forgejo)   auth_header="Authorization: token ${O_AUTH_TOKEN}" ;;
                bitbucket) auth_header="Authorization: Basic $(printf '%s' "${O_AUTH_USER}:${O_AUTH_TOKEN}" | base64 -w0)" ;;
                azure)     auth_header="Authorization: Basic $(printf '%s' ":${O_AUTH_TOKEN}" | base64 -w0)" ;;
                *)         auth_header="Authorization: Bearer ${O_AUTH_TOKEN}" ;;
            esac ;;
        header)
            auth_header="$O_AUTH_HEADER" ;;
        none|*)
            echo "  WARN: Không có auth — gọi API không xác thực" >&2 ;;
    esac

    if [[ "$dry_run" == "1" ]]; then
        echo "  [dry-run] curl -s -X $method \\"
        echo "    -H 'Content-Type: application/json' \\"
        [[ -n "$auth_header" ]] && echo "    -H '${auth_header//${O_AUTH_TOKEN:-__NO__}/***}' \\"
        echo "    -d '${body}' \\"
        echo "    '${api_url}'"
        return 0
    fi

    if [[ -n "$auth_header" ]]; then
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -H "$auth_header" \
            -d "$body" \
            "$api_url"
    else
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -d "$body" \
            "$api_url"
    fi
}

# ---------------------------------------------------------------------------
# HELPER: Kiểm tra response → lưu URL vào slot o.url tiếp theo
# ---------------------------------------------------------------------------
function _o_save_result() {
    local resp="$1" detected_url="$2" fallback_url="$3"

    if [[ -n "$detected_url" ]]; then
        local slot
        slot=$(_o_next_url_slot)
        echo ""
        echo "  ✓ Tạo repo thành công!"
        echo "  ✓ Clone URL : $detected_url"
        if [[ -n "$slot" ]]; then
            git config "$slot" "$detected_url"
            echo "  ✓ Đã lưu   : $slot  →  $detected_url"
            echo ""
            if [[ "$slot" == "o.url" ]]; then
                echo "  Bước tiếp: git opush"
            else
                echo "  Bước tiếp: git opushforce   (push tất cả remote)"
            fi
        else
            echo "  ⚠ Hết slot (o.url~o.url9). Set thủ công nếu cần." >&2
        fi
        return 0
    else
        # Trích thông báo lỗi từ JSON response
        local err_msg=""
        if echo "$resp" | grep -q '"message"'; then
            err_msg=$(echo "$resp" | grep -o '"message":"[^"]*"' | head -1 | cut -d'"' -f4)
        fi
        if [[ -z "$err_msg" ]] && echo "$resp" | grep -q '"error"'; then
            err_msg=$(echo "$resp" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4)
        fi

        echo ""
        echo "  ✗ Tạo repo thất bại." >&2
        [[ -n "$err_msg" ]]      && echo "  ✗ Lỗi API  : $err_msg" >&2
        [[ -n "$fallback_url" ]] && echo "  ✗ URL dự kiến (chưa verify): $fallback_url" >&2
        echo "" >&2
        echo "  Response:" >&2
        echo "$resp" | head -20 >&2
        return 1
    fi
}

# ---------------------------------------------------------------------------
# PROVIDER: GitHub
# ---------------------------------------------------------------------------
function _o_create_github() {
    local host="$1" owner="$2" repo_name="$3" desc="$4" is_private="$5" dry_run="$6"
    local body
    body=$(printf '{"name":"%s","description":"%s","private":%s,"auto_init":false}' \
        "$repo_name" "$desc" "$is_private")

    # Thử org endpoint trước
    local resp
    resp=$(_o_curl_api POST "https://api.github.com/orgs/${owner}/repos" "$body" "$dry_run")
    [[ "$dry_run" == "1" ]] && return 0

    # GitHub trả "clone_url" trực tiếp — dùng field này thay vì html_url
    # để tránh bị nhiễu bởi "owner.html_url" nested trong JSON
    local clone_url
    clone_url=$(echo "$resp" | grep -o '"clone_url":"[^"]*"' | head -1 | cut -d'"' -f4)

    # Nếu org endpoint trả lỗi (owner là personal account) → fallback /user/repos
    if [[ -z "$clone_url" ]]; then
        resp=$(_o_curl_api POST "https://api.github.com/user/repos" "$body" "$dry_run")
        clone_url=$(echo "$resp" | grep -o '"clone_url":"[^"]*"' | head -1 | cut -d'"' -f4)
    fi

    _o_save_result "$resp" "$clone_url" "https://github.com/${owner}/${repo_name}.git"
}

# ---------------------------------------------------------------------------
# PROVIDER: GitLab
# ---------------------------------------------------------------------------
function _o_create_gitlab() {
    local host="$1" owner="$2" repo_name="$3" desc="$4" is_private="$5" dry_run="$6"
    local visibility
    [[ "$is_private" == "true" ]] && visibility="private" || visibility="public"

    local body
    body=$(printf '{"name":"%s","description":"%s","visibility":"%s","namespace_path":"%s","initialize_with_readme":false}' \
        "$repo_name" "$desc" "$visibility" "$owner")

    local resp
    resp=$(_o_curl_api POST "https://${host}/api/v4/projects" "$body" "$dry_run")
    [[ "$dry_run" == "1" ]] && return 0

    local clone_url
    clone_url=$(echo "$resp" | grep -o '"http_url_to_repo":"[^"]*"' | head -1 | cut -d'"' -f4)
    _o_save_result "$resp" "$clone_url" "https://${host}/${owner}/${repo_name}.git"
}

# ---------------------------------------------------------------------------
# PROVIDER: Gitea / Forgejo
# ---------------------------------------------------------------------------
function _o_create_gitea() {
    local host="$1" owner="$2" repo_name="$3" desc="$4" is_private="$5" dry_run="$6"
    local body
    body=$(printf '{"name":"%s","description":"%s","private":%s,"auto_init":false}' \
        "$repo_name" "$desc" "$is_private")

    local resp
    resp=$(_o_curl_api POST "https://${host}/api/v1/orgs/${owner}/repos" "$body" "$dry_run")
    [[ "$dry_run" == "1" ]] && return 0

    local clone_url
    clone_url=$(echo "$resp" | grep -o '"clone_url":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [[ -z "$clone_url" ]]; then
        resp=$(_o_curl_api POST "https://${host}/api/v1/user/repos" "$body" "$dry_run")
        clone_url=$(echo "$resp" | grep -o '"clone_url":"[^"]*"' | head -1 | cut -d'"' -f4)
    fi
    _o_save_result "$resp" "$clone_url" "https://${host}/${owner}/${repo_name}.git"
}

# ---------------------------------------------------------------------------
# PROVIDER: Bitbucket
# ---------------------------------------------------------------------------
function _o_create_bitbucket() {
    local host="$1" owner="$2" repo_name="$3" desc="$4" is_private="$5" dry_run="$6"
    local slug="${repo_name,,}"
    local body
    body=$(printf '{"scm":"git","name":"%s","description":"%s","is_private":%s}' \
        "$repo_name" "$desc" "$is_private")

    local resp
    resp=$(_o_curl_api POST "https://api.bitbucket.org/2.0/repositories/${owner}/${slug}" "$body" "$dry_run")
    [[ "$dry_run" == "1" ]] && return 0

    local clone_url
    clone_url=$(echo "$resp" | grep -o '"href":"https://[^"]*\.git"' | head -1 | cut -d'"' -f4)
    _o_save_result "$resp" "$clone_url" "https://bitbucket.org/${owner}/${slug}.git"
}

# ---------------------------------------------------------------------------
# PROVIDER: Azure DevOps — List projects qua API
# Output: in danh sách tên project, mỗi dòng 1 cái. "" nếu lỗi.
# ---------------------------------------------------------------------------
function _o_azure_list_projects() {
    local owner="$1"

    # Build auth header cho Azure (Basic base64(":token"))
    local auth_header=""
    case "$O_AUTH_TYPE" in
        token)
            auth_header="Authorization: Basic $(printf '%s' ":${O_AUTH_TOKEN}" | base64 -w0)"
            ;;
        header)
            auth_header="$O_AUTH_HEADER"
            ;;
        none|*)
            return 1
            ;;
    esac

    local resp
    resp=$(curl -s -X GET \
        -H "Content-Type: application/json" \
        -H "$auth_header" \
        "https://dev.azure.com/${owner}/_apis/projects?api-version=7.1" 2>/dev/null)

    # Trích tên project từ JSON: "name":"<value>"
    # Azure trả về mảng value[].name
    echo "$resp" | grep -o '"name":"[^"]*"' | cut -d'"' -f4
}

# ---------------------------------------------------------------------------
# PROVIDER: Azure DevOps — Chọn project (từ config, từ API, hoặc nhập tay)
#
# Input:  $1 = owner (org name)
#         $2 = project đã có trong config (có thể rỗng)
# Output: in tên project ra stdout. Return 1 nếu không xác định được.
# ---------------------------------------------------------------------------
function _o_azure_resolve_project() {
    local owner="$1"
    local config_project="$2"

    # ── Ưu tiên 1: project đã có trong section config ─────────────────────
    if [[ -n "$config_project" ]]; then
        echo "$config_project"
        return 0
    fi

    # ── Ưu tiên 2: list project qua API, cho chọn hoặc nhập mới ──────────
    echo "" >&2
    echo "  [Azure] Đang lấy danh sách project từ dev.azure.com/${owner}..." >&2

    local -a projects=()
    while IFS= read -r pname; do
        [[ -n "$pname" ]] && projects+=("$pname")
    done < <(_o_azure_list_projects "$owner")

    if [[ ${#projects[@]} -gt 0 ]]; then
        echo "" >&2
        echo "  Project có sẵn trên Azure DevOps (org: ${owner}):" >&2
        echo "" >&2
        local i
        for i in "${!projects[@]}"; do
            printf "    [%d] %s\n" "$((i+1))" "${projects[$i]}" >&2
        done
        printf "    [%d] Nhập tên project mới\n" "$((${#projects[@]}+1))" >&2
        echo "" >&2

        local choice
        local max_choice=$(( ${#projects[@]} + 1 ))
        while true; do
            read -r -p "  Chọn project [1-${max_choice}]: " choice >&2 || true
            [[ "$choice" =~ ^[0-9]+$ ]] \
                && (( choice >= 1 && choice <= max_choice )) \
                && break
            echo "  Nhập số từ 1 đến ${max_choice}." >&2
        done

        if (( choice <= ${#projects[@]} )); then
            # Chọn project có sẵn
            local selected="${projects[$((choice-1))]}"
            echo "  → Azure Project: $selected" >&2
            echo "$selected"
            return 0
        fi
        # Rơi xuống: chọn "Nhập mới"
    else
        echo "  [Azure] Không lấy được danh sách project (auth lỗi hoặc không có project)." >&2
        echo "  [Azure] Bạn có thể nhập tên project thủ công." >&2
    fi

    # ── Fallback: nhập tay ────────────────────────────────────────────────
    echo "" >&2
    local new_project=""
    while true; do
        read -r -p "  Azure Project name (nhập tên mới hoặc có sẵn): " new_project >&2 || true
        [[ -n "$new_project" ]] && break
        echo "  Azure DevOps cần project name." >&2
    done
    echo "  → Azure Project: $new_project" >&2
    echo "$new_project"
    return 0
}

# ---------------------------------------------------------------------------
# PROVIDER: Azure DevOps
# ---------------------------------------------------------------------------
function _o_create_azure() {
    local host="$1" owner="$2" repo_name="$3" desc="$4" is_private="$5" dry_run="$6" azure_project="$7"
    local body
    body=$(printf '{"name":"%s"}' "$repo_name")

    local resp
    resp=$(_o_curl_api POST \
        "https://dev.azure.com/${owner}/${azure_project}/_apis/git/repositories?api-version=7.1" \
        "$body" "$dry_run")
    [[ "$dry_run" == "1" ]] && return 0

    local remote_url
    remote_url=$(echo "$resp" | grep -o '"remoteUrl":"[^"]*"' | head -1 | cut -d'"' -f4)
    _o_save_result "$resp" "$remote_url" \
        "https://dev.azure.com/${owner}/${azure_project}/_git/${repo_name}"
}

# =============================================================================
# PUBLIC: ocreateremote — Interactive wizard
#
# Cú pháp: git ocreateremote [--dry-run]
#
# Wizard hỏi lần lượt:
#   1. Chọn provider/account (từ .git-o-config)
#   2. Tên repo              (default: tên thư mục hiện tại)
#   3. Visibility            (default: private)
#   4. Mô tả                 (optional)
#   5. [Azure] Chọn project  (từ config / API / nhập tay)
#   6. Confirm → tạo → tự lưu URL vào o.url / o.url0..9
# =============================================================================
function ocreateremote() {
    local dry_run="0"
    [[ "${1:-}" == "--dry-run" ]] && dry_run="1"

    # ── Kiểm tra môi trường ───────────────────────────────────────────────────
    if ! git rev-parse --git-dir &>/dev/null 2>&1; then
        echo "[ocreateremote] ERROR: Không phải git repo. Chạy 'git oinit' trước." >&2
        return 1
    fi

    if [[ ! -f "$O_CONFIG_FILE" ]]; then
        echo "[ocreateremote] ERROR: Không tìm thấy: $O_CONFIG_FILE" >&2
        echo "[ocreateremote]   Tạo từ mẫu: cp .git-o-config.example .git-o-config" >&2
        return 1
    fi

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 1 — Chọn provider / account
    # ─────────────────────────────────────────────────────────────────────────
    echo ""
    echo "  ┌─────────────────────────────────────────────────"
    echo "  │  git ocreateremote${dry_run:+ (dry-run)}"
    echo "  └─────────────────────────────────────────────────"
    echo ""

    local -a sections=()
    while IFS= read -r sec; do
        [[ -n "$sec" ]] && sections+=("$sec")
    done < <(_o_list_config_sections)

    if [[ ${#sections[@]} -eq 0 ]]; then
        echo "  ERROR: Không có provider nào trong: $O_CONFIG_FILE" >&2
        echo "  Thêm section ví dụ:" >&2
        echo "    [github.com/myorg]" >&2
        echo "    token=ghp_xxxx" >&2
        return 1
    fi

    echo "  Chọn provider / account:"
    echo ""
    local i
    for i in "${!sections[@]}"; do
        local sec="${sections[$i]}"
        local lbl
        lbl=$(_o_provider_label "${sec%%/*}")
        printf "    [%d] %-35s (%s)\n" "$((i+1))" "$sec" "$lbl"
    done
    echo ""

    local choice
    while true; do
        read -r -p "  Số thứ tự [1-${#sections[@]}]: " choice
        [[ "$choice" =~ ^[0-9]+$ ]] \
            && (( choice >= 1 && choice <= ${#sections[@]} )) \
            && break
        echo "  Nhập số từ 1 đến ${#sections[@]}."
    done

    local selected="${sections[$((choice-1))]}"
    _o_parse_section "$selected"
    # _O_HOST, _O_OWNER, _O_AZURE_PROJECT_FROM_CONFIG đã được set

    # Resolve auth ngay để dùng cho API list projects (Azure)
    _o_resolve_auth "https://${_O_HOST}/${_O_OWNER}"

    local provider
    provider=$(_o_detect_provider "$_O_HOST")
    # Heuristic self-hosted không rõ tên từ hostname
    if [[ "$provider" == "unknown" ]]; then
        if   [[ "$O_AUTH_HEADER" == *"glpat"* || "$O_AUTH_HEADER" == *"PRIVATE-TOKEN"* ]]; then
            provider="gitlab"
        elif [[ "$O_AUTH_HEADER" == "Authorization: token "* ]]; then
            provider="gitea"
        fi
    fi

    local plabel
    plabel=$(_o_provider_label "$_O_HOST")
    echo ""
    echo "  → Provider : $selected  ($plabel)"

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 2 — Tên repo
    # ─────────────────────────────────────────────────────────────────────────
    echo ""
    local default_name
    default_name="$(basename "$PWD")"
    default_name="${default_name,,}"
    default_name="${default_name// /-}"

    local repo_name
    read -r -p "  Tên repo [${default_name}]: " repo_name
    repo_name="${repo_name:-$default_name}"
    repo_name="${repo_name,,}"
    repo_name="${repo_name// /-}"
    echo "  → Tên repo : $repo_name"

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 3 — Visibility
    # ─────────────────────────────────────────────────────────────────────────
    echo ""
    local vis_input is_private
    while true; do
        read -r -p "  Visibility [private/public] (Enter = private): " vis_input
        case "${vis_input:-private}" in
            private|pri) is_private="true";  break ;;
            public|pub)  is_private="false"; break ;;
            *) echo "  Nhập 'private' hoặc 'public'." ;;
        esac
    done
    local vlabel
    [[ "$is_private" == "true" ]] && vlabel="private 🔒" || vlabel="public 🌐"
    echo "  → Visibility: $vlabel"

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 4 — Mô tả (optional)
    # ─────────────────────────────────────────────────────────────────────────
    echo ""
    local description
    read -r -p "  Mô tả (Enter để bỏ qua): " description
    [[ -n "$description" ]] && echo "  → Mô tả    : $description"

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 4b — Azure: resolve project (config → API list → nhập tay)
    # ─────────────────────────────────────────────────────────────────────────
    local azure_project=""
    if [[ "$provider" == "azure" ]]; then
        if [[ -n "$_O_AZURE_PROJECT_FROM_CONFIG" ]]; then
            # Project đã có trong section config → dùng luôn
            azure_project="$_O_AZURE_PROJECT_FROM_CONFIG"
            echo ""
            echo "  → AZ Project: $azure_project  (từ cấu hình)"
        else
            # Chưa có → list API hoặc nhập tay
            azure_project=$(_o_azure_resolve_project "$_O_OWNER" "")
            if [[ -z "$azure_project" ]]; then
                echo "  ERROR: Cần Azure project name để tiếp tục." >&2
                return 1
            fi
        fi
    fi

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 5 — Confirm summary
    # ─────────────────────────────────────────────────────────────────────────
    local next_slot
    next_slot=$(_o_next_url_slot)

    echo ""
    echo "  ┌─────────────────────────────────────────────────"
    echo "  │  Tóm tắt"
    echo "  ├─────────────────────────────────────────────────"
    printf "  │  Provider   : %s  (%s)\n"  "$selected" "$plabel"
    printf "  │  Owner/Org  : %s\n"        "$_O_OWNER"
    printf "  │  Repo name  : %s\n"        "$repo_name"
    printf "  │  Visibility : %s\n"        "$vlabel"
    [[ -n "$description" ]]   && printf "  │  Mô tả      : %s\n" "$description"
    [[ -n "$azure_project" ]] && printf "  │  AZ Project : %s\n" "$azure_project"
    printf "  │  Auth       : %s @ [%s]\n" "$O_AUTH_TYPE" "$O_AUTH_MATCH"
    if [[ -n "$next_slot" ]]; then
        printf "  │  Lưu vào    : %s  (trong .git/config)\n" "$next_slot"
    else
        printf "  │  Lưu vào    : ⚠ Hết slot (o.url ~ o.url9)\n"
    fi
    [[ "$dry_run" == "1" ]] && printf "  │  Mode       : DRY RUN — không gọi API thật\n"
    echo "  └─────────────────────────────────────────────────"
    echo ""

    local confirm
    read -r -p "  Xác nhận tạo repo? [Y/n]: " confirm
    confirm="${confirm:-Y}"
    if [[ "${confirm,,}" != "y" ]]; then
        echo "  Hủy."
        return 0
    fi

    # ─────────────────────────────────────────────────────────────────────────
    # BƯỚC 6 — Gọi API provider
    # ─────────────────────────────────────────────────────────────────────────
    echo ""
    echo "  Đang tạo repo..."

    case "$provider" in
        github)
            _o_create_github    "$_O_HOST" "$_O_OWNER" "$repo_name" "$description" "$is_private" "$dry_run"
            ;;
        gitlab)
            _o_create_gitlab    "$_O_HOST" "$_O_OWNER" "$repo_name" "$description" "$is_private" "$dry_run"
            ;;
        gitea|forgejo)
            _o_create_gitea     "$_O_HOST" "$_O_OWNER" "$repo_name" "$description" "$is_private" "$dry_run"
            ;;
        bitbucket)
            _o_create_bitbucket "$_O_HOST" "$_O_OWNER" "$repo_name" "$description" "$is_private" "$dry_run"
            ;;
        azure)
            _o_create_azure     "$_O_HOST" "$_O_OWNER" "$repo_name" "$description" "$is_private" "$dry_run" "$azure_project"
            ;;
        unknown)
            echo "  ERROR: Không xác định được provider từ host '$_O_HOST'." >&2
            echo "  Gợi ý: hostname chứa 'gitlab' → tự nhận GitLab self-hosted" >&2
            echo "         header 'glpat' hoặc 'PRIVATE-TOKEN' → tự nhận GitLab" >&2
            return 1
            ;;
    esac
}
