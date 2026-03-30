#!/usr/bin/env bash
# =============================================================================
# modules/oaddfile.sh — Tạo các file helper cho repo
# Được load tự động bởi alias.sh — KHÔNG source trực tiếp file này
#
# Lệnh:
#   git addfile packagejson — Tạo / cập nhật package.json (npm scripts Windows)
#   git addfile omessage    — Tạo .opushforce.message nếu chưa có
#   git addfile ogitignore  — Tạo / append .gitignore (Node.js, .NET hoặc cả hai)
# Ghi chú:
#   - Khi chạy addfile sẽ đồng bộ thêm package.json/scripts để gọi alias qua npm
# =============================================================================

[[ -n "${_O_MODULE_ADDFILE_LOADED:-}" ]] && return 0
_O_MODULE_ADDFILE_LOADED=1

# ---------------------------------------------------------------------------
# TEMPLATE: .gitignore cho Node.js
# ---------------------------------------------------------------------------
_O_GITIGNORE_NODEJS='# ── Node.js ──────────────────────────────────────────
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.pnpm-store/
package-lock.json
yarn.lock
pnpm-lock.yaml

# Build output
dist/
build/
.next/
.nuxt/
out/
.output/
.cache/
.parcel-cache/
.turbo/

# Runtime / temp
*.log
logs/
tmp/
temp/
.tmp/

# Env & secrets
.env
.env.local
.env.*.local
.env.development
.env.production
.env.test

# Editor
.vscode/
.idea/
*.suo
*.user
*.swp
*~
.DS_Store
Thumbs.db

# Coverage
coverage/
.nyc_output/
lcov.info

# Misc
*.tgz
*.zip'

# ---------------------------------------------------------------------------
# TEMPLATE: .gitignore cho .NET / C#
# ---------------------------------------------------------------------------
_O_GITIGNORE_DOTNET='# ── .NET / C# ────────────────────────────────────────
## Build output
bin/
obj/
out/
publish/
*.user
*.suo
*.userosscache
*.sln.docstates

## NuGet
*.nupkg
*.snupkg
.nuget/
packages/
project.lock.json
project.assets.json
*.nuget.props
*.nuget.targets

## Visual Studio
.vs/
.vscode/
*.rsuser
*.vspx
*.sap
*.ncb
*.opensdf
*.sdf
*.cachefile
*.VC.db
*.VC.opendb
_ReSharper*/
*.[Rr]e[Ss]harper
*.DotSettings.user
.idea/

## Test results
TestResults/
[Tt]est[Rr]esult*/
[Bb]uild[Ll]og.*
*.log

## Publish profiles
**/Properties/PublishProfiles/*.pubxml
!**/Properties/PublishProfiles/*.pubxml.user

## Env & secrets
.env
.env.local
appsettings.Development.json
appsettings.Local.json
secrets.json

## OS
.DS_Store
Thumbs.db
*~'

# ---------------------------------------------------------------------------
# TEMPLATE: .gitignore kết hợp cả Node.js + .NET
# ---------------------------------------------------------------------------
_O_GITIGNORE_BOTH='# ── Node.js ──────────────────────────────────────────
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.pnpm-store/
package-lock.json
yarn.lock
pnpm-lock.yaml

# Build output (Node)
dist/
build/
.next/
.nuxt/
out/
.output/
.cache/
.parcel-cache/
.turbo/

# Runtime / temp
*.log
logs/
tmp/
temp/
.tmp/

# ── .NET / C# ────────────────────────────────────────
bin/
obj/
publish/
*.user
*.suo
*.userosscache
*.sln.docstates

# NuGet
*.nupkg
*.snupkg
.nuget/
packages/
project.lock.json
project.assets.json
*.nuget.props
*.nuget.targets

# Visual Studio / Rider
.vs/
_ReSharper*/
*.[Rr]e[Ss]harper
*.DotSettings.user
.idea/

# Test results
TestResults/
[Tt]est[Rr]esult*/
[Bb]uild[Ll]og.*

# Publish profiles
**/Properties/PublishProfiles/*.pubxml
!**/Properties/PublishProfiles/*.pubxml.user

# ── Shared ────────────────────────────────────────────
# Env & secrets
.env
.env.local
.env.*.local
.env.development
.env.production
.env.test
appsettings.Development.json
appsettings.Local.json
secrets.json

# Editor
.vscode/
*.swp
*~

# OS
.DS_Store
Thumbs.db
coverage/
.nyc_output/'

# ---------------------------------------------------------------------------
# TEMPLATE: Helper files của Git O-Alias
# ---------------------------------------------------------------------------
_O_GITIGNORE_O_ALIAS_HELPERS='# ── Git O-Alias helpers ───────────────────────
.git-o-config
.opushforce.message'

# ---------------------------------------------------------------------------
# HELPER: Kiểm tra một pattern đã có trong .gitignore chưa
# ---------------------------------------------------------------------------
function _oaf_already_has() {
    local file="$1" pattern="$2"
    grep -qxF "$pattern" "$file" 2>/dev/null
}

# ---------------------------------------------------------------------------
# HELPER: Append template vào .gitignore, bỏ qua dòng đã tồn tại
# ---------------------------------------------------------------------------
function _oaf_append_gitignore() {
    local file="$1"
    local template="$2"
    local added=0 skipped=0

    # Thêm blank line ngăn cách nếu file đang có nội dung
    if [[ -s "$file" ]]; then
        local last_char
        last_char=$(tail -c1 "$file" | wc -c)
        # Đảm bảo có newline cuối + 1 dòng trống
        echo "" >> "$file"
    fi

    while IFS= read -r line; do
        # Luôn giữ comment và dòng trống nguyên vẹn (không dedup)
        if [[ -z "$line" || "$line" == \#* ]]; then
            echo "$line" >> "$file"
        else
            if _oaf_already_has "$file" "$line"; then
                (( skipped++ )) || true
            else
                echo "$line" >> "$file"
                (( added++ )) || true
            fi
        fi
    done <<< "$template"

    echo "  ✓ Đã thêm $added dòng mới, bỏ qua $skipped dòng trùng."
}

# ---------------------------------------------------------------------------
# HELPER: Đảm bảo .gitignore có ignore cho các file helper của Git O-Alias
# ---------------------------------------------------------------------------
function _oaf_ensure_o_alias_ignores() {
    local file="$1"

    [[ -f "$file" ]] || touch "$file"

    if _oaf_already_has "$file" ".git-o-config" \
       && _oaf_already_has "$file" ".opushforce.message"; then
        echo "  ✓ Git O-Alias helper ignore đã có sẵn."
        return 0
    fi

    _oaf_append_gitignore "$file" "$_O_GITIGNORE_O_ALIAS_HELPERS"
}

# ---------------------------------------------------------------------------
# HELPER: Apply template .gitignore theo profile
#   nodejs | dotnet | both
# ---------------------------------------------------------------------------
function _oaf_apply_gitignore_profile() {
    local file="$1"
    local profile="$2"
    local label=""
    local template=""

    case "$profile" in
        1|node|nodejs)
            label="Node.js"
            template="$_O_GITIGNORE_NODEJS"
            ;;
        2|dotnet|csharp|c#)
            label=".NET / C#"
            template="$_O_GITIGNORE_DOTNET"
            ;;
        3|both|fullstack)
            label="Node.js + .NET / C#"
            template="$_O_GITIGNORE_BOTH"
            ;;
        *)
            echo "[addfile ogitignore] ERROR: Profile không hợp lệ: '$profile'" >&2
            return 1
            ;;
    esac

    [[ -f "$file" ]] || touch "$file"

    echo "  Đang thêm template ${label}..."
    _oaf_append_gitignore "$file" "$template"

    echo "  Đang thêm helper ignore (.git-o-config, .opushforce.message)..."
    _oaf_ensure_o_alias_ignores "$file"
}

# ---------------------------------------------------------------------------
# PACKAGE.JSON: Danh sách npm scripts cần có để chạy alias trong cmd mới
# Chỉ giữ lệnh full, không thêm alias viết tắt
# ---------------------------------------------------------------------------
function _oaf_package_script_specs() {
    cat <<'EOF'
git-o	git o
git-oexecute	git oexecute
git-oaddcommit	git oaddcommit
git-oclone	git oclone
git-opull	git opull
git-opullbranch	git opullbranch
git-opush	git opush
git-opushforce	git opushforce
git-opushforceurl	git opushforceurl
git-opullpush	git opullpush
git-ostash	git ostash
git-ofetch	git ofetch
git-oinit	git oinit
git-oconfig	git oconfig
git-oconfigclean	git oconfigclean
git-ocreateremote	git ocreateremote
git-addfile	git addfile
git-addfile-packagejson	git addfile packagejson
git-addfile-omessage	git addfile omessage
git-addfile-ogitignore	git addfile ogitignore
EOF
}

# ---------------------------------------------------------------------------
# PACKAGE.JSON: Danh sách alias viết tắt cũ để dọn khỏi package.json
# Chỉ xóa khi key đó đang là script auto-gen của Git O-Alias
# ---------------------------------------------------------------------------
function _oaf_package_legacy_short_specs() {
    cat <<'EOF'
git-oe	git oe
git-oac	git oac
git-ocl	git ocl
git-opl	git opl
git-oplb	git oplb
git-ops	git ops
git-opf	git opf
git-opfurl	git opfurl
git-opp	git opp
git-ost	git ost
git-oft	git oft
git-oi	git oi
git-oc	git oc
git-occ	git occ
git-ocr	git ocr
git-af	git af
git-af-omessage	git af omessage
git-af-ogitignore	git af ogitignore
EOF
}

# ---------------------------------------------------------------------------
# HELPER: Chuẩn hóa tên package khi cần tạo package.json mới
# ---------------------------------------------------------------------------
function _oaf_slugify_package_name() {
    local raw="${1:-git-o-alias-project}"

    raw=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')
    raw=$(printf '%s' "$raw" | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')

    if [[ -z "$raw" ]]; then
        raw="git-o-alias-project"
    fi

    printf '%s' "$raw"
}

# ---------------------------------------------------------------------------
# HELPER: Tạo / cập nhật package.json để expose alias qua npm scripts
# - Chỉ thêm scripts còn thiếu
# - Không ghi đè scripts đang có sẵn
# - Mỗi script sẽ mở một cửa sổ cmd mới trên Windows rồi chạy alias tương ứng
# ---------------------------------------------------------------------------
function _oaf_ensure_package_json_scripts() {
    local target="${1:-package.json}"
    local node_bin=""
    local repo_name
    local specs
    local legacy_short_specs
    local specs_b64
    local legacy_short_specs_b64

    if command -v node >/dev/null 2>&1; then
        node_bin="node"
    elif command -v node.exe >/dev/null 2>&1; then
        node_bin="node.exe"
    else
        echo "[addfile packagejson] WARN: Không tìm thấy 'node' hoặc 'node.exe' trong PATH — bỏ qua đồng bộ $PWD/$target." >&2
        return 1
    fi

    repo_name=$(_oaf_slugify_package_name "$(basename "$PWD")")
    specs=$(_oaf_package_script_specs)
    legacy_short_specs=$(_oaf_package_legacy_short_specs)
    specs_b64=$(printf '%s' "$specs" | base64 | tr -d '\r\n')
    legacy_short_specs_b64=$(printf '%s' "$legacy_short_specs" | base64 | tr -d '\r\n')

    "$node_bin" - "$target" "$repo_name" "$specs_b64" "$legacy_short_specs_b64" <<'NODE'
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'package.json';
const repoName = process.argv[3] || 'git-o-alias-project';
const rawSpecs = Buffer.from(process.argv[4] || '', 'base64').toString('utf8');
const rawLegacyShortSpecs = Buffer.from(process.argv[5] || '', 'base64').toString('utf8');
const targetPath = path.resolve(target);
const fileExists = fs.existsSync(targetPath);
const raw = fileExists ? fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, '') : '';
const trimmed = raw.trim();

let data = {};
if (trimmed) {
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    console.error(`[addfile packagejson] ERROR: ${targetPath} không phải JSON hợp lệ: ${error.message}`);
    process.exit(2);
  }
}

if (!data || typeof data !== 'object' || Array.isArray(data)) {
  console.error(`[addfile packagejson] ERROR: ${targetPath} phải là object JSON.`);
  process.exit(3);
}

const created = !fileExists || trimmed === '';
const newline = raw.includes('\r\n') ? '\r\n' : '\n';
const indentMatch = raw.match(/\r?\n([ \t]+)"[^"]+"\s*:/);
const indent = indentMatch ? indentMatch[1] : '  ';

function parseSpecs(rawValue) {
  return rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, command] = line.split('\t');
      return { name, command };
    });
}

const specs = parseSpecs(rawSpecs);
const legacyShortSpecs = parseSpecs(rawLegacyShortSpecs);

function buildScript(command) {
  return `powershell -NoProfile -Command "Start-Process -FilePath cmd.exe -WorkingDirectory '%CD%' -ArgumentList '/k', '${command}'"`;
}

function buildLegacyScript(command) {
  return `cmd /c start "" cmd /k "cd /d \\"%CD%\\" && ${command}"`;
}

let changed = false;

if (created) {
  if (!Object.prototype.hasOwnProperty.call(data, 'name')) {
    data.name = repoName;
    changed = true;
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'private')) {
    data.private = true;
    changed = true;
  }
}

if (!Object.prototype.hasOwnProperty.call(data, 'scripts')) {
  data.scripts = {};
  changed = true;
}

if (!data.scripts || typeof data.scripts !== 'object' || Array.isArray(data.scripts)) {
  console.error(`[addfile packagejson] ERROR: Trường "scripts" trong ${targetPath} phải là object JSON.`);
  process.exit(4);
}

const added = [];
const updated = [];
const alreadyPresent = [];
const keptExisting = [];
const removedLegacyShort = [];
const keptLegacyShort = [];

for (const spec of specs) {
  if (!spec.name || !spec.command) {
    continue;
  }

  const expectedValue = buildScript(spec.command);
  const legacyValue = buildLegacyScript(spec.command);

  if (!Object.prototype.hasOwnProperty.call(data.scripts, spec.name)) {
    data.scripts[spec.name] = expectedValue;
    added.push(spec.name);
    changed = true;
    continue;
  }

  if (data.scripts[spec.name] === expectedValue) {
    alreadyPresent.push(spec.name);
  } else if (data.scripts[spec.name] === legacyValue) {
    data.scripts[spec.name] = expectedValue;
    updated.push(spec.name);
    changed = true;
  } else {
    keptExisting.push(spec.name);
  }
}

for (const spec of legacyShortSpecs) {
  if (!spec.name || !spec.command) {
    continue;
  }

  if (!Object.prototype.hasOwnProperty.call(data.scripts, spec.name)) {
    continue;
  }

  const currentValue = data.scripts[spec.name];
  const generatedValues = new Set([
    buildLegacyScript(spec.command),
    buildScript(spec.command),
  ]);

  if (generatedValues.has(currentValue)) {
    delete data.scripts[spec.name];
    removedLegacyShort.push(spec.name);
    changed = true;
  } else {
    keptLegacyShort.push(spec.name);
  }
}

if (changed) {
  const nextRaw = `${JSON.stringify(data, null, indent)}${newline}`;
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, nextRaw, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

if (changed) {
  console.log(`[addfile packagejson] ✓ ${created ? 'Đã tạo' : 'Đã cập nhật'}: ${targetPath}`);
} else {
  console.log(`[addfile packagejson] ✓ Đã đủ scripts: ${targetPath}`);
}

console.log(`[addfile packagejson]   Thêm mới: ${added.length}, cập nhật cú pháp Windows: ${updated.length}, đã có sẵn đúng chuẩn: ${alreadyPresent.length}, xóa alias viết tắt auto-gen: ${removedLegacyShort.length}, giữ nguyên script đang có: ${keptExisting.length + keptLegacyShort.length}`);

if (keptExisting.length > 0) {
  console.log(`[addfile packagejson]   Không ghi đè: ${keptExisting.join(', ')}`);
}

if (updated.length > 0) {
  console.log(`[addfile packagejson]   Đã đổi sang runner Windows mới: ${updated.join(', ')}`);
}

if (removedLegacyShort.length > 0) {
  console.log(`[addfile packagejson]   Đã xóa alias viết tắt: ${removedLegacyShort.join(', ')}`);
}

if (keptLegacyShort.length > 0) {
  console.log(`[addfile packagejson]   Alias viết tắt custom được giữ nguyên: ${keptLegacyShort.join(', ')}`);
}
NODE
}

# ---------------------------------------------------------------------------
# SUB-COMMAND: packagejson
# Tạo / cập nhật package.json trong CWD để chạy alias qua npm trên Windows
# ---------------------------------------------------------------------------
function _oaf_packagejson() {
    if ! _oaf_ensure_package_json_scripts "package.json"; then
        return 1
    fi

    echo "[addfile packagejson]   Có thể chạy:"
    echo "[addfile packagejson]     npm run git-opushforce"
    echo "[addfile packagejson]     npm run git-oaddcommit"
    echo "[addfile packagejson]     npm run git-addfile-ogitignore"
    echo "[addfile packagejson]   npm scripts chỉ hỗ trợ Windows và dùng tên lệnh đầy đủ."
}

# ---------------------------------------------------------------------------
# HELPER: Tạo .opushforce.message nếu chưa có
# ---------------------------------------------------------------------------
function _oaf_ensure_omessage_file() {
    local target="${1:-.opushforce.message}"

    if [[ -f "$target" ]]; then
        return 1
    fi

    touch "$target"
    return 0
}

# ---------------------------------------------------------------------------
# SUB-COMMAND: omessage
# Tạo .opushforce.message trong CWD nếu chưa có
# ---------------------------------------------------------------------------
function _oaf_omessage() {
    local target=".opushforce.message"

    if ! _oaf_ensure_omessage_file "$target"; then
        echo "[addfile omessage] Đã tồn tại: $PWD/$target — bỏ qua."
        return 0
    fi

    echo "[addfile omessage] ✓ Đã tạo: $PWD/$target"
    echo "[addfile omessage]   Ghi message vào file trước khi chạy git opushforce."

    if [[ -f ".gitignore" ]]; then
        echo "[addfile omessage]   Cập nhật .gitignore để ignore file message."
        _oaf_ensure_o_alias_ignores ".gitignore"
    else
        echo "[addfile omessage]   Chưa có .gitignore — khi chạy git addfile ogitignore sẽ thêm rule ignore sẵn."
    fi
}

# ---------------------------------------------------------------------------
# SUB-COMMAND: ogitignore
# Tạo hoặc append .gitignore với template Node.js / .NET / cả hai
# ---------------------------------------------------------------------------
function _oaf_ogitignore() {
    local target=".gitignore"
    local is_new=0

    echo ""
    echo "  ┌─────────────────────────────────────────────────"
    echo "  │  git addfile ogitignore"
    if [[ -f "$target" ]]; then
        local line_count
        line_count=$(wc -l < "$target")
        echo "  │  File hiện có: $PWD/$target  ($line_count dòng)"
    else
        echo "  │  File chưa tồn tại — sẽ tạo mới: $PWD/$target"
        is_new=1
    fi
    echo "  └─────────────────────────────────────────────────"
    echo ""

    echo "  Chọn template để thêm vào .gitignore:"
    echo ""
    echo "    [1] Node.js / JavaScript / TypeScript"
    echo "        (node_modules, dist, .env, .next, yarn.lock, ...)"
    echo ""
    echo "    [2] .NET / C# (dotnet)"
    echo "        (bin, obj, .vs, packages, *.nupkg, appsettings.Local.json, ...)"
    echo ""
    echo "    [3] Cả hai  (Node.js + .NET — monorepo / fullstack)"
    echo ""
    echo "    [0] Hủy"
    echo ""

    local choice
    while true; do
        read -r -p "  Lựa chọn [0-3]: " choice
        case "$choice" in
            1|2|3|0) break ;;
            *) echo "  Nhập 0, 1, 2 hoặc 3." ;;
        esac
    done

    if [[ "$choice" == "0" ]]; then
        echo "  Hủy."
        return 0
    fi

    echo ""
    case "$choice" in
        1)
            _oaf_apply_gitignore_profile "$target" "nodejs"
            ;;
        2)
            _oaf_apply_gitignore_profile "$target" "dotnet"
            ;;
        3)
            _oaf_apply_gitignore_profile "$target" "both"
            ;;
    esac

    local total
    total=$(wc -l < "$target")
    echo "  ✓ $target hiện có $total dòng."
    echo ""

    if (( is_new )); then
        echo "  Bước tiếp: git add .gitignore && git oaddcommit"
    else
        echo "  Bước tiếp: review lại $target rồi git oaddcommit"
    fi
    echo ""
}

# =============================================================================
# PUBLIC: addfile — dispatcher
#
# Cú pháp: git addfile <sub-command>
#   packagejson — tạo / cập nhật package.json (npm scripts Windows)
#   omessage    — tạo .opushforce.message
#   ogitignore  — tạo / append .gitignore
# =============================================================================
function addfile() {
    local sub="${1:-}"

    case "$sub" in
        packagejson)
            _oaf_packagejson
            ;;
        omessage)
            if ! _oaf_ensure_package_json_scripts "package.json"; then
                echo "[addfile] WARN: Chưa đồng bộ được package.json scripts." >&2
            fi
            _oaf_omessage
            ;;
        ogitignore)
            if ! _oaf_ensure_package_json_scripts "package.json"; then
                echo "[addfile] WARN: Chưa đồng bộ được package.json scripts." >&2
            fi
            _oaf_ogitignore
            ;;
        ""|help|--help|-h)
            echo ""
            echo "  git addfile <sub-command>"
            echo ""
            echo "  Khi chạy sub-command hợp lệ, addfile sẽ:"
            echo "    - Tạo / cập nhật file helper theo yêu cầu"
            echo "    - Đồng bộ package.json/scripts để gọi alias qua npm (mở cmd mới trên Windows)"
            echo "    - Chỉ tạo npm scripts theo tên đầy đủ, không tạo alias viết tắt"
            echo ""
            echo "  Sub-commands:"
            echo "    packagejson Tạo / cập nhật package.json trong CWD"
            echo "                (thêm npm scripts để mở cmd mới trên Windows)"
            echo ""
            echo "    omessage    Tạo .opushforce.message trong CWD"
            echo "                (dùng để đặt commit message trước git opushforce)"
            echo ""
            echo "    ogitignore  Tạo / cập nhật .gitignore"
            echo "                (template Node.js, .NET/C#, hoặc cả hai)"
            echo ""
            echo "  Muốn chỉ tạo package.json:"
            echo "    git addfile packagejson"
            echo ""
            echo "  Ví dụ sau khi đã sync package.json:"
            echo "    npm run git-addfile-packagejson"
            echo "    npm run git-opushforce"
            echo "    npm run git-oaddcommit"
            echo "    npm run git-addfile-omessage"
            echo ""
            ;;
        *)
            echo "[addfile] ERROR: Sub-command không hợp lệ: '$sub'" >&2
            echo "[addfile]   Dùng: git addfile packagejson | omessage | ogitignore" >&2
            return 1
            ;;
    esac
}
