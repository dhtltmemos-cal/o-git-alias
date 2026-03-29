#!/usr/bin/env bash
# =============================================================================
# modules/opullbranch.sh — Fetch tất cả remote, liệt kê branch mới hơn local,
#                          cho chọn rồi áp nội dung branch đó vào working tree
#                          hiện tại để review, không merge commit
# Được load tự động bởi alias.sh — KHÔNG source trực tiếp file này
#
# Phụ thuộc (inject từ alias.sh trước khi source):
#   _O_SCRIPT_DIR   — thư mục gốc của alias.sh
#   O_CONFIG_FILE   — đường dẫn đến .git-o-config
#   _o_resolve_auth — hàm resolve auth từ .git-o-config
#   _o_embed_token  — hàm nhúng token vào URL
#
# Flow:
#   1. Thu thập tất cả o.url + o.url0..o.url9 từ .git/config
#   2. Fetch từng remote với auth tương ứng (dùng remote tạm thời _o_tmp_N)
#   3. Quét remote-tracking refs thật (lọc HEAD symref bằng objecttype + tên)
#      - Branch remote ahead local → [AHEAD +N]
#      - Branch chưa tồn tại local → [NEW +N commit(s)]
#   4. Hiển thị danh sách tên branch rõ ràng (không có _o_tmp_N)
#   5. Áp nội dung ref đã chọn vào working tree của branch HIỆN TẠI
#      - Không switch branch
#      - Không tạo branch mới
#      - Không merge commit
# =============================================================================

[[ -n "${_O_MODULE_OPULLBRANCH_LOADED:-}" ]] && return 0
_O_MODULE_OPULLBRANCH_LOADED=1

# ---------------------------------------------------------------------------
# HELPER: Dọn toàn bộ remote tạm _o_tmp_* còn sót
# ---------------------------------------------------------------------------
function _opb_cleanup_tmp_remotes() {
    local r
    for r in $(git remote 2>/dev/null | grep '^_o_tmp_'); do
        git remote remove "$r" 2>/dev/null || true
    done
}

# ---------------------------------------------------------------------------
# HELPER: Dòng status nào chỉ liên quan .opushforce.message thì có thể bỏ qua
# vì đây chỉ là file ghi chú message khi push
# ---------------------------------------------------------------------------
function _opb_is_ignorable_status_line() {
    local line="$1"
    local path="${line:3}"

    [[ "$path" == *" -> "* ]] && return 1

    case "$path" in
        ".opushforce.message"|*/.opushforce.message) return 0 ;;
        *) return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# HELPER: Chỉ cho phép tiếp tục khi working tree sạch để tránh ghi đè nhầm
# Ngoại lệ: chỉ có .opushforce.message thì vẫn cho chạy tiếp
# ---------------------------------------------------------------------------
function _opb_require_clean_worktree() {
    local repo_root="${1:-.}"
    local line

    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        if ! _opb_is_ignorable_status_line "$line"; then
            echo "[opullbranch] ERROR: Working tree đang có thay đổi." >&2
            echo "[opullbranch]   Hãy commit / stash / discard trước khi lấy nội dung từ branch khác." >&2
            echo "[opullbranch]   File .opushforce.message sẽ được bỏ qua." >&2
            return 1
        fi
    done < <(git -C "$repo_root" status --porcelain 2>/dev/null)

    return 0
}

# ---------------------------------------------------------------------------
# HELPER: Fetch một URL với auth, gắn vào remote tạm "_o_tmp_<idx>"
# Output (stdout): tên remote đã fetch, hoặc "" nếu thất bại
# ---------------------------------------------------------------------------
function _opb_fetch_url() {
    local idx="$1" url="$2"
    local remote_name="_o_tmp_${idx}"

    git remote remove "$remote_name" 2>/dev/null || true

    _o_resolve_auth "$url"

    local fetch_ok=0
    case "$O_AUTH_TYPE" in
        token)
            local auth_url
            auth_url=$(_o_embed_token "$url" "$O_AUTH_TOKEN" "$O_AUTH_USER")
            git remote add "$remote_name" "$auth_url" 2>/dev/null
            git fetch --quiet "$remote_name" 2>/dev/null && fetch_ok=1
            ;;
        header)
            git remote add "$remote_name" "$url" 2>/dev/null
            git -c "http.extraHeader=${O_AUTH_HEADER}" fetch --quiet "$remote_name" 2>/dev/null && fetch_ok=1
            ;;
        none|*)
            git remote add "$remote_name" "$url" 2>/dev/null
            git fetch --quiet "$remote_name" 2>/dev/null && fetch_ok=1
            ;;
    esac

    if (( fetch_ok )); then
        echo "$remote_name"
    else
        git remote remove "$remote_name" 2>/dev/null || true
        echo ""
    fi
}

# ---------------------------------------------------------------------------
# HELPER: So sánh remote ref với branch tương ứng trên local
#
# $1 = full remote ref  (vd: refs/remotes/_o_tmp_0/main)
# $2 = branch name      (vd: main)
#
# Output:
#   "ahead N"   — remote có N commit mới hơn local branch
#   "new N"     — branch chưa tồn tại local, remote có N commit mới hơn HEAD
#   "same"      — cùng commit / không có gì mới
#   "behind"    — local mới hơn remote
# ---------------------------------------------------------------------------
function _opb_compare_ref() {
    local remote_ref="$1"
    local branch_name="$2"

    local remote_sha
    remote_sha=$(git rev-parse "$remote_ref" 2>/dev/null || true)
    [[ -z "$remote_sha" ]] && echo "same" && return 0

    if git show-ref --verify --quiet "refs/heads/${branch_name}" 2>/dev/null; then
        # Branch tồn tại local → so sánh với nó
        local local_sha
        local_sha=$(git rev-parse "refs/heads/${branch_name}")
        [[ "$remote_sha" == "$local_sha" ]] && echo "same" && return 0

        local ahead
        ahead=$(git rev-list --count "${local_sha}..${remote_sha}" 2>/dev/null || echo "0")
        if (( ahead > 0 )); then
            echo "ahead $ahead"
        else
            echo "behind"
        fi
    else
        # Branch chưa có local → so với HEAD để xem có gì mới không
        local head_sha
        head_sha=$(git rev-parse HEAD 2>/dev/null || true)
        local ahead
        ahead=$(git rev-list --count "${head_sha}..${remote_sha}" 2>/dev/null || echo "0")
        if (( ahead > 0 )); then
            echo "new $ahead"
        else
            echo "same"
        fi
    fi
}

# =============================================================================
# PUBLIC: opullbranch
# =============================================================================
function opullbranch() {

    if ! git rev-parse --git-dir &>/dev/null 2>&1; then
        echo "[opullbranch] ERROR: Không phải git repo." >&2
        return 1
    fi

    local current_branch
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

    local repo_root
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

    if ! _opb_require_clean_worktree "$repo_root"; then
        return 1
    fi

    # ── Thu thập URL ──────────────────────────────────────────────────────────
    local -a all_url_keys=()
    local -a all_url_vals=()

    local main_url
    main_url=$(git config --get o.url 2>/dev/null || true)
    [[ -n "$main_url" ]] && all_url_keys+=("o.url") && all_url_vals+=("$main_url")

    local i extra_url
    for i in $(seq 0 9); do
        extra_url=$(git config --get "o.url${i}" 2>/dev/null || true)
        [[ -n "$extra_url" ]] && all_url_keys+=("o.url${i}") && all_url_vals+=("$extra_url")
    done

    if [[ ${#all_url_vals[@]} -eq 0 ]]; then
        echo "[opullbranch] ERROR: Không tìm thấy o.url nào trong .git/config." >&2
        echo "[opullbranch]   Thiết lập: git config o.url https://github.com/org/repo.git" >&2
        return 1
    fi

    _opb_cleanup_tmp_remotes

    # ── Fetch ─────────────────────────────────────────────────────────────────
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────"
    echo "  │  git opullbranch"
    printf "  │  Branch hiện tại : %s\n" "$current_branch"
    printf "  │  Đang fetch %d remote(s)...\n" "${#all_url_vals[@]}"
    echo "  └─────────────────────────────────────────────────────────────"
    echo ""

    local -a fetched_remotes=()
    local -a fetched_url_keys=()

    for i in "${!all_url_vals[@]}"; do
        local key="${all_url_keys[$i]}"
        local url="${all_url_vals[$i]}"
        printf "  [fetch] %-10s  %s ... " "$key" "$url"
        local tmp_remote
        tmp_remote=$(_opb_fetch_url "$i" "$url")
        if [[ -n "$tmp_remote" ]]; then
            echo "✓"
            fetched_remotes+=("$tmp_remote")
            fetched_url_keys+=("$key")
        else
            echo "✗ thất bại"
        fi
    done

    if [[ ${#fetched_remotes[@]} -eq 0 ]]; then
        echo ""
        echo "  [opullbranch] ERROR: Không fetch được remote nào." >&2
        _opb_cleanup_tmp_remotes
        return 1
    fi

    echo ""

    # ── Quét branch ───────────────────────────────────────────────────────────
    local -a item_branch=()
    local -a item_ref=()
    local -a item_url_key=()
    local -a item_status=()

    declare -A seen_branches=()

    for ri in "${!fetched_remotes[@]}"; do
        local remote="${fetched_remotes[$ri]}"
        local ukey="${fetched_url_keys[$ri]}"
        local ref_prefix="refs/remotes/${remote}/"

        # Lấy full refname + objecttype để lọc HEAD symref chắc chắn
        # HEAD symref có thể objecttype=commit nhưng tên kết thúc bằng /HEAD
        while IFS=' ' read -r full_ref obj_type; do
            [[ -z "$full_ref" ]] && continue
            [[ "$obj_type" != "commit" ]] && continue

            # Lấy branch name = bỏ prefix refs/remotes/<remote>/
            local bname="${full_ref#${ref_prefix}}"

            # Bỏ qua HEAD (dù dạng nào)
            [[ "$bname" == "HEAD" ]] && continue

            # Tránh trùng branch từ nhiều remote
            [[ -n "${seen_branches[$bname]+x}" ]] && continue
            seen_branches["$bname"]=1

            local cmp
            cmp=$(_opb_compare_ref "$full_ref" "$bname")

            case "$cmp" in
                "same"|"behind") continue ;;
            esac

            local status_label
            case "$cmp" in
                new*)
                    local n="${cmp#new }"
                    status_label="[NEW  +${n} commit(s)]"
                    ;;
                ahead*)
                    local n="${cmp#ahead }"
                    status_label="[AHEAD +${n}]"
                    ;;
            esac

            item_branch+=("$bname")
            item_ref+=("$full_ref")
            item_url_key+=("$ukey")
            item_status+=("$status_label")

        done < <(git for-each-ref --format='%(refname) %(objecttype)' "${ref_prefix}" 2>/dev/null)
    done

    # ── Không có gì mới ───────────────────────────────────────────────────────
    if [[ ${#item_branch[@]} -eq 0 ]]; then
        echo "  ✓ Không có branch nào mới hơn local."
        echo ""
        _opb_cleanup_tmp_remotes
        return 0
    fi

    # ── Menu chọn branch ──────────────────────────────────────────────────────
    echo "  Branch có thể lấy về:"
    echo ""
    printf "    %-4s  %-32s  %-10s  %s\n" "#" "Branch" "Remote" "Trạng thái"
    echo "    ────  ────────────────────────────────  ──────────  ───────────────────"

    for j in "${!item_branch[@]}"; do
        printf "    [%d]  %-32s  %-10s  %s\n" \
            "$((j+1))" \
            "${item_branch[$j]}" \
            "${item_url_key[$j]}" \
            "${item_status[$j]}"
    done

    echo ""
    echo "    [0]  Hủy"
    echo ""
    printf "  Nội dung sẽ được áp vào working tree hiện tại: [%s]\n" "$current_branch"
    echo ""

    local choice
    local max="${#item_branch[@]}"
    while true; do
        read -r -p "  Chọn branch [0-${max}]: " choice
        [[ "$choice" == "0" ]] && { echo "  Hủy."; _opb_cleanup_tmp_remotes; return 0; }
        [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= max )) && break
        echo "  Nhập số từ 0 đến ${max}."
    done

    local sel_idx=$(( choice - 1 ))
    local sel_branch="${item_branch[$sel_idx]}"
    local sel_ref="${item_ref[$sel_idx]}"
    local sel_status="${item_status[$sel_idx]}"

    echo ""
    printf "  → Lấy nội dung từ branch : %s  %s\n" "$sel_branch" "$sel_status"
    printf "  → Áp vào working tree   : %s\n" "$current_branch"
    echo ""

    # ── Áp nội dung branch đã chọn vào working tree hiện tại ─────────────────
    echo "  [opullbranch] Đang áp nội dung vào working tree..."
    if git -C "$repo_root" restore --source="$sel_ref" --worktree -- .; then
        echo "  ✓ Đã lấy nội dung branch về working tree."
        echo "  ✓ Chưa merge, chưa tạo commit nào."
        echo "  [opullbranch] Xem thay đổi bằng: git status / git diff"
    else
        echo ""
        echo "  ✗ Không thể áp nội dung branch vào working tree." >&2
        echo "  ✗ Kiểm tra lại trạng thái repo rồi thử lại." >&2
        echo ""
        _opb_cleanup_tmp_remotes
        return 1
    fi

    echo ""
    _opb_cleanup_tmp_remotes
    echo "  [opullbranch] Done."
    echo ""
}
