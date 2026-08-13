#!/usr/bin/env bash
# =============================================================================
# modules/oexecute.sh — Menu tương tác: chọn lệnh theo số thứ tự rồi chạy
# Được load tự động bởi alias.sh — KHÔNG source trực tiếp file này
#
# Cú pháp:
#   git oexecute          (hoặc git oe)
#
# Flow:
#   1. Hiển thị toàn bộ lệnh có hỗ trợ, đánh số thứ tự
#   2. User nhập số → chạy lệnh tương ứng (kèm prompt nhập args nếu cần)
# =============================================================================

[[ -n "${_O_MODULE_OEXECUTE_LOADED:-}" ]] && return 0
_O_MODULE_OEXECUTE_LOADED=1

# ---------------------------------------------------------------------------
# HELPER: In menu lệnh + mô tả
# ---------------------------------------------------------------------------
function _oe_print_menu() {
    local cwd
    cwd="$(pwd)"

    echo ""
    echo "  ┌──────────────────────────────────────────────────────────────────"
    echo "  │  git oexecute — Chọn lệnh để thực hiện"
    echo "  │  cwd: ${cwd}"
    echo "  ├──────────────────────────────────────────────────────────────────"
    echo "  │"
    echo "  │   #   Lệnh                    Viết tắt   Mô tả"
    echo "  │  ───────────────────────────────────────────────────────────────"
    echo "  │   1   git oaddcommit          git oac    add -A + auto commit"
    echo "  │   2   git opush               git ops    push lên o.url"
    echo "  │   3   git opull               git opl    pull từ o.url"
    echo "  │   4   git opullbranch         git oplb   fetch remote, lấy nội dung + source summary"
    echo "  │   5   git opushforce          git opf    force push tất cả remote"
    echo "  │   6   git opushforceurl       git opfurl force push chọn 1 remote"
    echo "  │   7   git opullpush           git opp    pull → commit → push"
    echo "  │   8   git ofetch              git oft    fetch từ o.url"
    echo "  │   9   git ostash              git ost    stash drop + clean"
    echo "  │  10   git oinit               git oi     git init + file helper mặc định"
    echo "  │  11   git oreinit             git ori    xóa history, giữ config, init lại"
    echo "  │  12   git oconfig             git oc     mở .git/config bằng VSCode"
    echo "  │  13   git oconfigclean        git occ    xóa alias local .git/config"
    echo "  │  14   git ocreateremote       git ocr    tạo remote repo qua API"
    echo "  │  15   git addfile packagejson git af     tạo / cập nhật package.json"
    echo "  │  16   git addfile omessage    git af     tạo .opushforce.message"
    echo "  │  17   git addfile ogitignore  git af     tạo / cập nhật .gitignore"
    echo "  │  18   git oclone              git ocl    clone repo từ o.url"
    echo "  │  19   git ozip                git oz     download source ZIP từ remote branch"
    echo "  │  20   git odeletebranch       git odb    fetch remote, delete remote branch"
    echo "  │  21   git oaddconfig          git oadc   add config"
    echo "  │  22   git setupgit            git osg    menu cài đặt repo (hook commit message, ...)"
    echo "  │  23   git ocredential         git ocred  lấy credential theo username hoặc Git URL"
    echo "  │  24   git getremoteurls                  lấy danh sách URL theo line hoặc JSON"
    echo "  │"
    echo "  │   0   Thoát"
    echo "  │"
    echo "  └──────────────────────────────────────────────────────────────────"
    echo ""
}

# ---------------------------------------------------------------------------
# HELPER: Prompt nhập args tuỳ chọn cho lệnh có thể nhận message
# ---------------------------------------------------------------------------
function _oe_ask_message() {
    local prompt="${1:-Commit message (Enter để tự sinh):}"
    local msg
    read -r -p "  $prompt " msg
    echo "$msg"
}

# ---------------------------------------------------------------------------
# HELPER: Tên lệnh tương ứng với lựa chọn, dùng cho tùy chọn chạy lại.
# ---------------------------------------------------------------------------
function _oe_command_name() {
    case "$1" in
        1)  echo "git oaddcommit" ;;
        2)  echo "git opush" ;;
        3)  echo "git opull" ;;
        4)  echo "git opullbranch" ;;
        5)  echo "git opushforce" ;;
        6)  echo "git opushforceurl" ;;
        7)  echo "git opullpush" ;;
        8)  echo "git ofetch" ;;
        9)  echo "git ostash" ;;
        10) echo "git oinit" ;;
        11) echo "git oreinit" ;;
        12) echo "git oconfig" ;;
        13) echo "git oconfigclean" ;;
        14) echo "git ocreateremote" ;;
        15) echo "git addfile packagejson" ;;
        16) echo "git addfile omessage" ;;
        17) echo "git addfile ogitignore" ;;
        18) echo "git oclone" ;;
        19) echo "git ozip" ;;
        20) echo "git odeletebranch" ;;
        21) echo "git oaddconfig" ;;
        22) echo "git setupgit" ;;
        23) echo "git ocredential" ;;
        24) echo "git getremoteurls" ;;
        *)  echo "lệnh không xác định" ;;
    esac
}

# ---------------------------------------------------------------------------
# HELPER: Chạy lệnh theo số thứ tự đã chọn
# ---------------------------------------------------------------------------
function _oe_run() {
    local choice="$1"
    echo ""

    case "$choice" in
        1)
            echo "  → git oaddcommit"
            local msg; msg=$(_oe_ask_message "Commit message (Enter để tự sinh):")
            echo ""
            oaddcommit $msg
            ;;
        2)
            echo "  → git opush"
            echo ""
            opush
            ;;
        3)
            echo "  → git opull"
            echo ""
            opull
            ;;
        4)
            echo "  → git opullbranch"
            echo ""
            opullbranch
            ;;
        5)
            echo "  → git opushforce"
            local msg; msg=$(_oe_ask_message "Commit message (Enter để tự sinh):")
            echo ""
            opushforce $msg
            ;;
        6)
            echo "  → git opushforceurl"
            local msg; msg=$(_oe_ask_message "Commit message (Enter để tự sinh):")
            echo ""
            opushforceurl $msg
            ;;
        7)
            echo "  → git opullpush"
            local msg; msg=$(_oe_ask_message "Commit message (Enter để tự sinh):")
            echo ""
            opullpush $msg
            ;;
        8)
            echo "  → git ofetch"
            echo ""
            ofetch
            ;;
        9)
            echo "  → git ostash"
            local confirm
            read -r -p "  ⚠ ostash sẽ stash + drop + clean. Xác nhận? [y/N]: " confirm
            if [[ "${confirm,,}" == "y" ]]; then
                echo ""
                ostash
            else
                echo "  Hủy."
            fi
            ;;
        10)
            echo "  → git oinit"
            local url
            read -r -p "  Remote URL (Enter để dùng placeholder): " url
            echo ""
            oinit $url
            ;;
        11)
            echo "  → git oreinit"
            local msg; msg=$(_oe_ask_message "Commit message (Enter để dùng ReInitGit-YYYYMMDD):")
            echo ""
            oreinit $msg
            ;;
        12)
            echo "  → git oconfig"
            echo ""
            oconfig
            ;;
        13)
            echo "  → git oconfigclean"
            echo ""
            oconfigclean
            ;;
        14)
            echo "  → git ocreateremote"
            echo ""
            ocreateremote
            ;;
        15)
            echo "  → git addfile packagejson"
            echo ""
            addfile packagejson
            ;;
        16)
            echo "  → git addfile omessage"
            echo ""
            addfile omessage
            ;;
        17)
            echo "  → git addfile ogitignore"
            echo ""
            addfile ogitignore
            ;;
        18)
            echo "  → git oclone"
            local dest
            read -r -p "  Thư mục đích (Enter để dùng tên repo): " dest
            echo ""
            oclone $dest
            ;;
        19)
            echo "  → git ozip"
            echo ""
            ozip
            ;;
        20)
            echo "  → git odeletebranch"
            echo ""
            odeletebranch
            ;;
        21)
            echo "  → git oaddconfig"
            echo ""
            oaddconfig
            ;;
        22)
            echo "  → git setupgit"
            echo ""
            osetupgit
            ;;
        23)
            echo "  → git ocredential"
            local credential_input
            read -r -p "  Username hoặc Git URL: " credential_input
            echo ""
            ocredential "$credential_input"
            ;;
        24)
            echo "  → git getremoteurls"
            local output_format
            read -r -p "  Định dạng [lines/json] (Enter = lines): " output_format
            output_format="${output_format:-lines}"
            echo ""
            get_remote_urls --format "$output_format"
            ;;
        0)
            echo "  Thoát."
            return 0
            ;;
        *)
            echo "  ERROR: Lựa chọn không hợp lệ: '$choice'" >&2
            return 1
            ;;
    esac
}

# =============================================================================
# PUBLIC: oexecute — Menu tương tác chọn lệnh
#
# Cú pháp: git oexecute
#          git oe
# =============================================================================
function oexecute() {
    local choice again previous_command

    while true; do
        _oe_print_menu

        read -r -p "  Chọn số thứ tự [0-24]: " choice

        # Validate input
        if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 0 || choice > 24 )); then
            echo ""
            echo "  ⚠ Nhập số từ 0 đến 24."
            sleep 1
            continue
        fi

        [[ "$choice" == "0" ]] && { echo ""; echo "  Thoát."; echo ""; return 0; }

        previous_command="$(_oe_command_name "$choice")"

        while true; do
            _oe_run "$choice"

            while true; do
                echo ""
                echo "  Lệnh trước: $previous_command"
                read -r -p "  Quay lại menu? [Y/n/r] (r = chạy lại '$previous_command'): " again
                again="${again:-Y}"

                case "${again,,}" in
                    y) break 2 ;;
                    n) echo ""; return 0 ;;
                    r)
                        echo ""
                        echo "  ↻ Chạy lại: $previous_command"
                        break
                        ;;
                    *)
                        echo "  ⚠ Chỉ nhập Y, n hoặc r."
                        ;;
                esac
            done
        done
    done

    echo ""
}
