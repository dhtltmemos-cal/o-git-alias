// services/clip/index.js — Subcommand `ocli clip`
// Flow: đọc clipboard (Windows) → parse định dạng khối code có path → ghi file theo cwd

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, commandExists } = require("../../lib/shell");
const { selectMenu, confirm } = require("../../lib/prompt");

const LOG = "[clip]";

// ─────────────────────────────────────────────────────────────────
// ĐỌC CLIPBOARD
// ─────────────────────────────────────────────────────────────────

function readClipboardText() {
  if (process.platform === "win32") {
    // Dùng base64 để tránh lỗi encoding UTF-16/UTF-8 khi đọc tiếng Việt từ PowerShell.
    const ps = spawn("powershell", [
      "-NoProfile",
      "-Command",
      '$t = Get-Clipboard -Raw; if ($null -eq $t) { $t = "" }; [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t))',
    ]);
    if (!ps.ok) {
      throw new Error(`${LOG} Không đọc được clipboard bằng PowerShell: ${ps.stderr}`);
    }
    if (!ps.stdout) return "";
    try {
      return Buffer.from(ps.stdout, "base64").toString("utf8");
    } catch {
      throw new Error(`${LOG} Clipboard trả về dữ liệu không hợp lệ (base64 decode thất bại).`);
    }
  }

  if (commandExists("pbpaste")) {
    const r = spawn("pbpaste", []);
    if (!r.ok) throw new Error(`${LOG} Không đọc được clipboard bằng pbpaste: ${r.stderr}`);
    return r.stdout;
  }

  if (commandExists("xclip")) {
    const r = spawn("xclip", ["-selection", "clipboard", "-o"]);
    if (!r.ok) throw new Error(`${LOG} Không đọc được clipboard bằng xclip: ${r.stderr}`);
    return r.stdout;
  }

  if (commandExists("xsel")) {
    const r = spawn("xsel", ["--clipboard", "--output"]);
    if (!r.ok) throw new Error(`${LOG} Không đọc được clipboard bằng xsel: ${r.stderr}`);
    return r.stdout;
  }

  throw new Error(`${LOG} Hệ điều hành hiện tại không có công cụ đọc clipboard phù hợp.`);
}

// ─────────────────────────────────────────────────────────────────
// STRIP CODE FENCE
// ─────────────────────────────────────────────────────────────────

function stripCodeFence(raw) {
  const normalizedRaw = !raw.includes("\n") && raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;

  const lines = normalizedRaw.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0) return "";

  if (lines[0].trim().startsWith("```")) lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim() === "```") lines.pop();

  return lines.join("\n").trim();
}

// ─────────────────────────────────────────────────────────────────
// NORMALIZE PATH
//
// BUG FIX: Path bắt đầu bằng '/' (VD: /src/file.ts) sau khi replace
// separator trên Windows thành '\src\file.ts' → path.resolve() bỏ qua
// cwd hoàn toàn vì '\' đầu được hiểu là root của ổ đĩa hiện tại.
// Giải pháp: strip leading slash/backslash trước khi resolve.
// ─────────────────────────────────────────────────────────────────

function normalizePathInput(p) {
  const cleaned = p.trim().replace(/^['"]|['"]$/g, "");
  // Strip leading / hoặc \ để đảm bảo luôn là relative path
  const stripped = cleaned.replace(/^[/\\]+/, "");
  return stripped.replace(/\\/g, path.sep).replace(/\//g, path.sep);
}

// ─────────────────────────────────────────────────────────────────
// VALIDATE PATH — kiểm tra cơ bản trước khi đề xuất inferred path
// ─────────────────────────────────────────────────────────────────

const KNOWN_CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "cs",
  "java",
  "py",
  "go",
  "rs",
  "cpp",
  "c",
  "h",
  "hpp",
  "vue",
  "svelte",
  "astro",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "htm",
  "xml",
  "svg",
  "json",
  "yaml",
  "yml",
  "toml",
  "env",
  "md",
  "mdx",
  "txt",
  "sh",
  "bash",
  "ps1",
  "cmd",
  "sql",
  "prisma",
  "graphql",
  "tf",
  "tfvars",
]);

/**
 * Trả về true nếu chuỗi trông giống một file path hợp lệ:
 *   - Có extension nằm trong danh sách code extensions đã biết
 *   - Không phải URL (không chứa ://)
 *   - Không chứa khoảng trắng hoặc ký tự cấm trong path
 *   - Tên file không quá ngắn (tránh false positive với "a.b")
 */
function looksLikeFilePath(candidate) {
  if (!candidate || candidate.length < 5) return false;
  if (candidate.includes("://")) return false; // URL
  if (/\s/.test(candidate)) return false; // có khoảng trắng
  if (/[<>:"|?*]/.test(candidate)) return false; // ký tự cấm trong Windows path

  const ext = candidate.split(".").pop().toLowerCase();
  if (!KNOWN_CODE_EXTENSIONS.has(ext)) return false;

  const basename = path.basename(candidate);
  if (basename.startsWith(".")) return false; // dotfile thuần không phải path mã nguồn
  if (basename.split(".")[0].length < 2) return false; // tên file quá ngắn (e.g. "a.ts")

  return true;
}

// ─────────────────────────────────────────────────────────────────
// COLLECT PATH CANDIDATES
//
// Tách riêng 2 nhóm:
//
//   explicit — comment dạng "// Path: src/file.ts" hoặc "// file: ..."
//              Tin tưởng hoàn toàn → dùng thẳng, không cần confirm.
//
//   inferred — comment chỉ chứa path thuần, VD: "// src/util/Cache.ts"
//              Chỉ suy đoán → hiển thị resolved path và confirm trước khi ghi.
//              Lý do cần confirm: comment có thể là mô tả, không phải path đích;
//              user cần xác nhận để tránh ghi nhầm file vào thư mục sai.
// ─────────────────────────────────────────────────────────────────

function collectPathCandidates(lines) {
  const explicit = [];
  const inferred = [];

  for (const line of lines) {
    // ── Explicit: // Path: <path> hoặc // file: <path> ──────────
    const mExplicit = line.match(/^\s*\/\/\s*(?:path|file)\s*:\s*(.+?)\s*$/i);
    if (mExplicit && mExplicit[1].trim()) {
      explicit.push(mExplicit[1].trim());
      continue;
    }

    // ── Inferred: // <path-like-string> ─────────────────────────
    // Chỉ khớp khi toàn bộ phần sau "//" là một chuỗi trông như file path.
    // Không khớp nếu comment có thêm text khác (VD: "// TODO: fix this util.ts")
    const mInferred = line.match(/^\s*\/\/\s*([A-Za-z0-9_.][A-Za-z0-9_./\\-]*\.[A-Za-z][A-Za-z0-9_]*)\s*$/);
    if (mInferred && mInferred[1].trim()) {
      const candidate = mInferred[1].trim();
      if (looksLikeFilePath(candidate)) {
        inferred.push(candidate);
      }
    }
  }

  return {
    explicit: [...new Set(explicit)],
    inferred: [...new Set(inferred)],
  };
}

// ─────────────────────────────────────────────────────────────────
// EXTRACT PAYLOAD
// ─────────────────────────────────────────────────────────────────

function extractPayload(clipboardText) {
  if (!clipboardText || !clipboardText.trim()) return null;

  const normalized = stripCodeFence(clipboardText);
  if (!normalized) return null;

  const lines = normalized.split("\n");
  const first3 = lines.slice(0, 3);
  const { explicit, inferred } = collectPathCandidates(first3);

  if (explicit.length === 0 && inferred.length === 0) return null;

  return { lines, explicit, inferred };
}

// ─────────────────────────────────────────────────────────────────
// CHỌN PATH EXPLICIT (menu nếu nhiều hơn 1)
// ─────────────────────────────────────────────────────────────────

async function chooseExplicitPath(candidates) {
  if (candidates.length === 1) return candidates[0];

  const idx = await selectMenu(
    "Phát hiện nhiều path trong 3 dòng đầu, chọn path để ghi file",
    candidates.map((p) => ({ label: p })),
  );

  if (idx === -1) return null;
  return candidates[idx];
}

// ─────────────────────────────────────────────────────────────────
// CONFIRM INFERRED PATH
//
// Hiển thị đường dẫn tuyệt đối sẽ được ghi và giải thích lý do
// cần confirm, để user có thể từ chối nếu suy đoán sai.
// ─────────────────────────────────────────────────────────────────

async function confirmInferredPath(candidates, cwd) {
  // Lọc bỏ các path resolve ra ngoài cwd (bảo vệ path traversal)
  const safe = candidates.filter((p) => {
    const resolved = path.resolve(cwd, normalizePathInput(p));
    const rel = path.relative(cwd, resolved);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  });

  if (safe.length === 0) return null;

  if (safe.length === 1) {
    // ── 1 candidate: confirm trực tiếp ───────────────────────────
    const candidate = safe[0];
    const resolved = path.resolve(cwd, normalizePathInput(candidate));

    console.log(`\n${LOG} Phát hiện path trong comment (inferred — chưa có "// Path:"):`);
    console.log(`  Tìm thấy : // ${candidate}`);
    console.log(`  Sẽ ghi   : ${resolved}`);
    console.log(`  Lý do    : Comment trông như file path hợp lệ nhưng không có nhãn "// Path:".`);
    console.log(`             Nếu đây không phải path đích, hãy thêm "// Path: <đường-dẫn>" vào`);
    console.log(`             dòng đầu file rồi copy lại.`);
    console.log("");

    const ok = await confirm("  Xác nhận ghi file vào đường dẫn trên?", false);
    return ok ? candidate : null;
  }

  // ── Nhiều candidates: cho chọn trước, rồi confirm ────────────
  console.log(`\n${LOG} Phát hiện nhiều path (inferred) trong comment:`);
  safe.forEach((p, i) => {
    const resolved = path.resolve(cwd, normalizePathInput(p));
    console.log(`  [${i + 1}] ${p}`);
    console.log(`      → ${resolved}`);
  });
  console.log(`  Lý do : Các comment trên trông như file path hợp lệ nhưng thiếu "// Path:".`);
  console.log("");

  const idx = await selectMenu(
    "Chọn path để ghi (inferred — cần xác nhận)",
    safe.map((p) => {
      const resolved = path.resolve(cwd, normalizePathInput(p));
      return { label: `${p.padEnd(45)} → ${resolved}` };
    }),
  );

  if (idx === -1) return null;

  const chosen = safe[idx];
  const resolvedChosen = path.resolve(cwd, normalizePathInput(chosen));
  const ok = await confirm(`  Xác nhận ghi file vào: ${resolvedChosen}?`, false);
  return ok ? chosen : null;
}

// ─────────────────────────────────────────────────────────────────
// GHI FILE
// ─────────────────────────────────────────────────────────────────

function writeFileFromClipboard(selectedPath, lines) {
  const relativePath = normalizePathInput(selectedPath);
  const outPath = path.resolve(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const content = `${lines.join("\n").replace(/\s+$/g, "")}\n`;
  fs.writeFileSync(outPath, content, "utf8");
  return outPath;
}

// ─────────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────────

async function run() {
  while (true) {
    let clip;
    try {
      clip = readClipboardText();
    } catch (e) {
      console.error(e.message);
      return;
    }

    const payload = extractPayload(clip);

    if (!payload) {
      console.log(`${LOG} Clipboard chưa đúng định dạng (không tìm thấy path hợp lệ trong 3 dòng đầu).`);
      console.log(`${LOG} Ví dụ explicit : // Path: src/queue/JobQueue.js`);
      console.log(`${LOG} Ví dụ inferred : // src/queue/JobQueue.js      (sẽ hỏi xác nhận)`);
    } else {
      const cwd = process.cwd();
      let selectedPath = null;

      if (payload.explicit.length > 0) {
        // Explicit path: tin tưởng hoàn toàn, chọn thẳng
        selectedPath = await chooseExplicitPath(payload.explicit);
      } else {
        // Inferred path: hiển thị resolved path đầy đủ, confirm trước khi ghi
        selectedPath = await confirmInferredPath(payload.inferred, cwd);
      }

      if (selectedPath) {
        const outPath = writeFileFromClipboard(selectedPath, payload.lines);
        console.log(`${LOG} Đã ghi nội dung clipboard vào: ${outPath}`);
      } else {
        console.log(`${LOG} Hủy thao tác ghi file.`);
      }
    }

    console.log("");

    const shouldContinue = await confirm("Bạn có muốn tiếp tục chạy nghiệp vụ ocli clip không?", true);
    if (!shouldContinue) break;
  }
}

module.exports = { run };
