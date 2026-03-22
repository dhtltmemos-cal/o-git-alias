#!/usr/bin/env bash
# =============================================================================
# modules/opushforceurl.sh — Force push lên một remote URL được chọn
# Được load tự động bởi alias.sh — KHÔNG source trực tiếp file này
#
# Phụ thuộc (inject từ alias.sh trước khi source):
#   _O_SCRIPT_DIR        — thư mục gốc của alias.sh
#   O_CONFIG_FILE        — đường dẫn đến .git-o-config
#   _o_resolve_auth      — hàm resolve auth từ .git-o-config
#   _o_embed_token       — hàm nhúng token vào URL
#   _o_force_push_to     — hàm force push tới một URL (đã có auth)
#   commitstatus         — hàm tự sinh commit message từ git status
#
# Flow:
#   1. Thu thập tất cả o.url + o.url0..o.url9 từ .git/config
#   2. Hiển thị menu chọn URL (single-select)
#   3. Kiểm tra working tree:
#      - Sạch (không có thay đổi) → chỉ force push lên URL đã chọn
#      - Có thay đổi              → add -A + commit + force push lên URL đã chọn
# =============================================================================

[[ -n "${_O_MODULE_OPUSHFORCEURL_LOADED:-}" ]] && return 0
_O_MODULE_OPUSHFORCEURL_LOADED=1

# =============================================================================
# PUBLIC: opushforceurl — chọn remote URL rồi force push
#
# Cú pháp: git opushforceurl [commit_message]
#          git opfurl        [commit_message]
# =============================================================================
function opushforceurl() {

    # ── Kiểm tra môi trường ───────────────────────────────────────────────────
    if ! git rev-parse --git-dir &>/dev/null 2>&1; then
        echo "[opushforceurl] ERROR: Không phải git repo." >&2
        return 1
    fi

    # ── Thu thập danh sách URL ────────────────────────────────────────────────
    local -a url_keys=()
    local -a url_vals=()

    local main_url
    main_url=$(git config --get o.url 2>/dev/null || true)
    if [[ -n "$main_url" ]]; then
        url_keys+=("o.url")
        url_vals+=("$main_url")
    fi

    local i extra_url
    for i in $(seq 0 9); do
        extra_url=$(git config --get "o.url${i}" 2>/dev/null || true)
        if [[ -n "$extra_url" ]]; then
            url_keys+=("o.url${i}")
            url_vals+=("$extra_url")
        fi
    done

    if [[ ${#url_vals[@]} -eq 0 ]]; then
        echo "[opushforceurl] ERROR: Không tìm thấy o.url nào trong .git/config." >&2
        echo "[opushforceurl]   Thiết lập remote:" >&2
        echo "[opushforceurl]   git config o.url  https://github.com/org/repo.git" >&2
        echo "[opushforceurl]   git config o.url0 https://gitlab.com/org/repo.git" >&2
        return 1
    fi

    # ── Kiểm tra working tree ─────────────────────────────────────────────────
    local dirty_files
    dirty_files=$(git status --porcelain 2>/dev/null)
    local has_changes=0
    [[ -n "$dirty_files" ]] && has_changes=1

    # ── Hiển thị trạng thái + menu ────────────────────────────────────────────
    echo ""
    echo "  ┌─────────────────────────────────────────────────"
    echo "  │  git opushforceurl"
    echo "  ├─────────────────────────────────────────────────"
    if (( has_changes )); then
        local change_count
        change_count=$(echo "$dirty_files" | wc -l)
        echo "  │  Working tree : ⚠  có ${change_count} file thay đổi → sẽ add + commit + push"
    else
        echo "  │  Working tree : ✓  sạch → chỉ force push (bỏ qua add/commit)"
    fi
    echo "  └─────────────────────────────────────────────────"
    echo ""
    echo "  Chọn remote URL để force push:"
    echo ""

    local j
    for j in "${!url_vals[@]}"; do
        printf "    [%d] %-12s  %s\n" "$((j+1))" "${url_keys[$j]}" "${url_vals[$j]}"
    done
    echo ""

    local choice
    while true; do
        read -r -p "  Số thứ tự [1-${#url_vals[@]}]: " choice
        [[ "$choice" =~ ^[0-9]+$ ]] \
            && (( choice >= 1 && choice <= ${#url_vals[@]} )) \
            && break
        echo "  Nhập số từ 1 đến ${#url_vals[@]}."
    done

    local selected_key="${url_keys[$((choice-1))]}"
    local selected_url="${url_vals[$((choice-1))]}"

    echo ""
    echo "  → Remote : $selected_key  →  $selected_url"

    # ── Nếu có thay đổi: add + commit ────────────────────────────────────────
    if (( has_changes )); then
        echo ""
        git add -A

        if [[ -n "$*" ]]; then
            git commit -m "$*" --allow-empty --allow-empty-message
        else
            # Kiểm tra .opushforce.message
            local msg_file=".opushforce.message"
            local file_msg=""
            if [[ -f "$msg_file" ]]; then
                file_msg=$(cat "$msg_file")
                file_msg="${file_msg#"${file_msg%%[![:space:]]*}"}"
                file_msg="${file_msg%"${file_msg##*[![:space:]]}"}"
            fi

            if [[ -n "$file_msg" ]]; then
                echo "  [opushforceurl] Dùng message từ $msg_file"
                git commit -m "$file_msg" --allow-empty --allow-empty-message
                true > "$msg_file"
                echo "  [opushforceurl] Đã clear nội dung $msg_file"
            else
                commitstatus
            fi
        fi
    else
        echo "  [opushforceurl] Bỏ qua add/commit — working tree sạch."
    fi

    # ── Force push lên URL đã chọn ────────────────────────────────────────────
    echo ""
    echo "  [opushforceurl] Đang force push → $selected_url"
    _o_force_push_to "$selected_url"
    echo ""
}