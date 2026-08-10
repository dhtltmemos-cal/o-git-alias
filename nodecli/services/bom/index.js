// services/bom/index.js — Subcommand `ocli bom`
// Flow: quét cwd đệ quy → liệt kê file UTF-16 (có/không BOM) → hỏi phạm vi cập nhật
//       → backup trước khi chỉnh → chuyển UTF-16 → UTF-8 (BOM kèm prolog XML nếu cần).
// Backup nằm trong thư mục backups/ cạnh file này (không theo cwd), mỗi lần chạy
// tạo session mới theo ngày giờ để không trùng; có thể trả lại bằng `ocli bom --restore`.

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { confirm, selectMenu } = require("../../lib/prompt");

const LOG = "[bom]";
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
  ".turbo",
  ".parcel-cache",
  "__pycache__",
  ".venv",
]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);
const UTF16_SAMPLE_BYTES = 8192;
const UTF16_NULL_RATIO = 0.25;
const PROGRESS_EVERY_MS = 1000;
const COMPANION_EXTS = new Set([
  ".cs", ".resx", ".xsd", ".config", ".settings",
  ".xml", ".xaml", ".csproj", ".datasource",
]);
const BACKUP_ROOT = path.join(__dirname, "backups");

/**
 * Nhận diện UTF-16 từ bytes:
 *   - có BOM (FF FE / FE FF) → "le" / "be"
 *   - không BOM → heuristic null byte tập trung 1 parity trên mẫu đầu file
 *     (UTF-16LE: null ở vị trí lẻ; UTF-16BE: vị trí chẵn)
 * Trả về "le" | "be" | null.
 */
function detectUtf16(buf) {
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return "le";
    if (buf[0] === 0xfe && buf[1] === 0xff) return "be";
  }
  if (buf.length < 8) return null;
  const pairs = Math.floor(Math.min(buf.length, UTF16_SAMPLE_BYTES) / 2);
  let odd = 0;
  let even = 0;
  for (let i = 0; i < pairs; i++) {
    if (buf[i * 2 + 1] === 0) odd++;
    if (buf[i * 2] === 0) even++;
  }
  if (odd / pairs >= UTF16_NULL_RATIO) return "le";
  if (even / pairs >= UTF16_NULL_RATIO) return "be";
  return null;
}

function hasUtf16(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(UTF16_SAMPLE_BYTES);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return detectUtf16(buf.subarray(0, n)) !== null;
  } finally {
    fs.closeSync(fd);
  }
}

function hasBom(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(2);
    return fs.readSync(fd, buf, 0, 2, 0) === 2 && buf.equals(UTF16_LE_BOM);
  } finally {
    fs.closeSync(fd);
  }
}

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

function rel(rootDir, filePath) {
  return path.relative(rootDir, filePath) || ".";
}

function createProgress(label) {
  const start = Date.now();
  let last = 0;
  return {
    tick(message, force = false) {
      const now = Date.now();
      if (!force && now - last < PROGRESS_EVERY_MS) return;
      last = now;
      console.log(`${LOG} ${label}: ${message} (${((now - start) / 1000).toFixed(1)}s)`);
    },
    done(message) {
      const now = Date.now();
      console.log(`${LOG} ${label}: ${message} (${((now - start) / 1000).toFixed(1)}s)`);
    },
  };
}

function scanBomFiles(rootDir) {
  const found = [];
  const progress = createProgress("walk");
  let dirs = 0;
  let files = 0;

  function walk(dir) {
    dirs++;
    progress.tick(`${dirs} thư mục, ${files} file, đang ở ${rel(rootDir, dir)}`);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        files++;
        try {
          if (hasUtf16(filePath)) found.push(filePath);
        } catch {
          console.log(`${LOG} Bỏ qua file không đọc được: ${rel(rootDir, filePath)}`);
        }
      }
    }
  }

  walk(rootDir);
  progress.done(`${dirs} thư mục, ${files} file, thấy ${found.length} file UTF-16`);
  return found;
}

function gitCandidateFiles(rootDir) {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: rootDir,
    encoding: "buffer",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((rel) => path.join(rootDir, rel));
}

function findGitRepos(rootDir) {
  const repos = [];
  const progress = createProgress("repo-scan");
  let dirs = 0;

  function walk(dir) {
    dirs++;
    progress.tick(`${dirs} thư mục, thấy ${repos.length} repo, đang ở ${rel(rootDir, dir)}`);

    const isRepo = fs.existsSync(path.join(dir, ".git"));
    if (isRepo) {
      repos.push(dir);
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== ".git" && !shouldSkipDir(entry.name)) walk(path.join(dir, entry.name));
    }
  }

  walk(rootDir);
  progress.done(`${dirs} thư mục, thấy ${repos.length} repo`);
  return repos;
}

function gitReposCandidateFiles(rootDir) {
  const repos = findGitRepos(rootDir);
  if (repos.length === 0) return null;

  const candidates = [];
  const seen = new Set();
  const progress = createProgress("git-list");

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    progress.tick(`[${i + 1}/${repos.length}] ${rel(rootDir, repo)}`, true);
    const files = gitCandidateFiles(repo);
    if (!files) continue;
    for (const file of files) {
      const key = path.resolve(file).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(file);
      }
    }
  }

  progress.done(`${repos.length} repo, ${candidates.length} file candidate`);
  return candidates;
}

function scanBomCandidates(rootDir, files) {
  const found = [];
  const progress = createProgress("utf16-check");
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    progress.tick(`[${i + 1}/${files.length}] ${rel(rootDir, filePath)}, thấy ${found.length} file UTF-16`);
    try {
      if (fs.statSync(filePath).isFile() && hasUtf16(filePath)) found.push(filePath);
    } catch {
      console.log(`${LOG} Bỏ qua file không đọc được: ${rel(rootDir, filePath)}`);
    }
  }
  progress.done(`${files.length} file, thấy ${found.length} file UTF-16`);
  return found;
}

function decodeUtf16be(buf) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i + 1 < buf.length; i += 2) {
    out[i] = buf[i + 1];
    out[i + 1] = buf[i];
  }
  return out.toString("utf16le");
}

/**
 * Chuyển file UTF-16 → UTF-8 có BOM.
 * - Nếu là XML (có `<?xml`) → sửa prolog encoding="utf-16" → "utf-8"
 *   (XML spec: không BOM thì prolog là nguồn quyết định; ghi kèm BOM UTF-8 cho chắc).
 * Trả về { endian, bytes, utf8Bytes } hoặc null nếu không phải UTF-16.
 */
function convertToUtf8(filePath) {
  const data = fs.readFileSync(filePath);
  const endian = detectUtf16(data);
  if (!endian) return null;
  let text = endian === "le" ? data.toString("utf16le") : decodeUtf16be(data);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/^\s*<\?xml/i.test(text)) {
    text = text.replace(/encoding=["']utf-16["']/i, 'encoding="utf-8"');
  }
  const out = "\uFEFF" + text;
  fs.writeFileSync(filePath, out, "utf8");
  return { endian, bytes: data.length, utf8Bytes: Buffer.byteLength(out, "utf8") };
}

/** removeBom (tên cũ) giờ làm an toàn: UTF-16 → UTF-8, không cắt BOM đơn thuần. */
function removeBom(filePath) {
  return convertToUtf8(filePath) !== null;
}

/** Tên file an toàn từ đường dẫn tuyệt đối (đảo : \ / → _) để không trùng khi backup. */
function safeFileName(absPath) {
  return path.resolve(absPath).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

/**
 * Backup danh sách file trước khi chỉnh. Thư mục: <index.js>/backups/<YYYYMMDD-HHmmss>-<rand>/
 * Kèm manifest.json ghi mapping original → backup để restore.
 */
function createBackupSession(cwd, files, mode) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6);
  const dir = path.join(BACKUP_ROOT, `${date}-${time}-${rand}`);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { createdAt: now.toISOString(), mode: mode === 0 ? "cs-only" : "companions", cwd, files: [] };
  for (const file of files) {
    const backup = path.join(dir, safeFileName(file));
    fs.copyFileSync(file, backup);
    manifest.files.push({ original: file, backup });
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

/** Trả lại các file từ một session backup (`ocli bom --restore`). */
async function restore() {
  if (!fs.existsSync(BACKUP_ROOT)) {
    console.log(`${LOG} Không có session backup nào.`);
    return;
  }
  const sessions = fs.readdirSync(BACKUP_ROOT)
    .filter((d) => fs.statSync(path.join(BACKUP_ROOT, d)).isDirectory())
    .sort()
    .reverse();
  if (sessions.length === 0) {
    console.log(`${LOG} Không có session backup nào.`);
    return;
  }

  const idx = await selectMenu("Chọn session backup để trả lại", sessions.map((s) => ({ label: s })));
  if (idx < 0) {
    console.log(`${LOG} Đã hủy.`);
    return;
  }

  const dir = path.join(BACKUP_ROOT, sessions[idx]);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.log(`${LOG} Thiếu manifest.json trong session ${sessions[idx]}.`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!(await confirm(`${LOG} Trả lại ${manifest.files.length} file từ session ${sessions[idx]}?`))) {
    console.log(`${LOG} Đã hủy.`);
    return;
  }

  let restored = 0;
  for (const f of manifest.files) {
    if (!fs.existsSync(f.backup)) {
      console.log(`${LOG} Thiếu backup: ${f.backup}`);
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(f.original), { recursive: true });
      fs.copyFileSync(f.backup, f.original);
      restored++;
    } catch (e) {
      console.log(`${LOG} Lỗi khi trả lại: ${f.original} — ${e.message}`);
    }
  }
  console.log(`${LOG} Đã trả lại: ${restored}/${manifest.files.length} file.`);
}

async function run(args = []) {
  if (args.includes("--restore")) {
    await restore();
    return;
  }

  const cwd = process.cwd();
  console.log(`${LOG} Đang quét: ${cwd}`);

  const candidates = args.includes("--walk") ? null : gitReposCandidateFiles(cwd);
  if (candidates) console.log(`${LOG} Dùng git ls-files theo repo (${candidates.length} file candidate).`);
  const files = (candidates ? scanBomCandidates(cwd, candidates) : scanBomFiles(cwd)).sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    console.log(`${LOG} Không tìm thấy file UTF-16 (có/không BOM).`);
    return;
  }

  console.log(`${LOG} Tìm thấy ${files.length} file UTF-16:`);
  for (const file of files) console.log(`  - ${rel(cwd, file)}`);

  const mode = await selectMenu("Chọn phạm vi cập nhật UTF-16 → UTF-8", [
    { label: "Chỉ file .cs thuần (an toàn nhất)" },
    { label: "Cả file kèm theo (.resx, .xsd, .config, .settings, .xml, .xaml, .csproj, .datasource)" },
  ]);
  if (mode < 0) {
    console.log(`${LOG} Đã hủy, chưa ghi file nào.`);
    return;
  }

  const targets = files.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return mode === 0 ? ext === ".cs" : COMPANION_EXTS.has(ext);
  });
  if (targets.length === 0) {
    console.log(`${LOG} Không có file nào thuộc phạm vi đã chọn.`);
    return;
  }

  console.log(`${LOG} Phạm vi: ${targets.length}/${files.length} file.`);
  for (const file of targets) console.log(`  - ${rel(cwd, file)}`);

  if (!(await confirm(`${LOG} Backup ${targets.length} file rồi cập nhật UTF-16 → UTF-8?`, false))) {
    console.log(`${LOG} Đã hủy, chưa ghi file nào.`);
    return;
  }

  const sessionDir = createBackupSession(cwd, targets, mode);
  let changed = 0;
  const skipped = [];
  for (const file of targets) {
    if (convertToUtf8(file)) changed++;
    else skipped.push(file);
  }

  console.log(`${LOG} Đã cập nhật: ${changed}/${targets.length} file.`);
  if (skipped.length) {
    console.log(`${LOG} Bỏ qua (không còn UTF-16): ${skipped.map((f) => rel(cwd, f)).join(", ")}`);
  }
  console.log(`${LOG} Backup tại: ${sessionDir}`);
  console.log(`${LOG} Muốn trả lại file cũ: chạy lại 'ocli bom --restore'.`);
}

module.exports = { run, scanBomFiles, hasBom, detectUtf16, createBackupSession, convertToUtf8, removeBom };
