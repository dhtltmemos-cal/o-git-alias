// services/gh/secrets.js — Quản lý GitHub repo secrets qua `gh` CLI
// Nghiệp vụ: list, set (từng cái hoặc từ file/env), delete secrets của một repo.

"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("../../lib/shell");
const { ask, confirm, selectMenu, askFilePath, askMultiSelect } = require("../../lib/prompt");

const LOG = "[gh:secrets]";

// ─────────────────────────────────────────────────────────────────
// HELPER: Gọi gh với đúng account (env GH_TOKEN override)
// ─────────────────────────────────────────────────────────────────

function ghArgs(baseArgs, account) {
  const env = account.token ? { ...process.env, GH_TOKEN: account.token } : { ...process.env };
  return { args: baseArgs, env };
}

// ─────────────────────────────────────────────────────────────────
// LIST secrets của một repo
// ─────────────────────────────────────────────────────────────────

async function listSecrets(repo, account) {
  console.log(`\n${LOG} Đang lấy danh sách secrets: ${repo}`);
  const { args, env } = ghArgs(["secret", "list", "--repo", repo], account);
  const result = spawn("gh", args, { env });

  if (!result.ok) {
    console.error(`${LOG} Lỗi: ${result.stderr}`);
    return [];
  }

  const lines = result.stdout.split("\n").filter(Boolean);
  if (lines.length === 0) {
    console.log(`${LOG} Repo chưa có secret nào.`);
    return [];
  }

  console.log(`\n  Secrets hiện có (${lines.length}):\n`);
  lines.forEach((line, i) => {
    const parts = line.split(/\s+/);
    const name = parts[0];
    const updatedAt = parts[1] || "";
    console.log(`    [${i + 1}]  ${name.padEnd(40)} ${updatedAt}`);
  });

  return lines.map((line) => line.split(/\s+/)[0]);
}

// ─────────────────────────────────────────────────────────────────
// SET một secret
// ─────────────────────────────────────────────────────────────────

async function setOneSecret(repo, account) {
  const name = await ask("\n  Tên secret (VD: API_KEY)");
  if (!name) {
    console.log("  Hủy.");
    return;
  }

  const value = await ask(`  Giá trị của ${name}`);
  if (value === "") {
    const ok = await confirm("  Giá trị rỗng — tiếp tục?", false);
    if (!ok) {
      console.log("  Hủy.");
      return;
    }
  }

  const { args, env } = ghArgs(["secret", "set", name, "--repo", repo, "--body", value], account);
  const result = spawn("gh", args, { env });
  if (result.ok) {
    console.log(`${LOG} ✓ Đã set secret: ${name}`);
  } else {
    console.error(`${LOG} ✗ Thất bại: ${result.stderr}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Parse file JSON hoặc .env → mảng { name, value }
// ─────────────────────────────────────────────────────────────────

function parseSecretsFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".json") {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      throw new Error(`${LOG} File JSON không hợp lệ: ${e.message}`);
    }
    if (typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`${LOG} File JSON phải là object { KEY: value }`);
    }
    return Object.entries(obj).map(([k, v]) => ({ name: k, value: String(v) }));
  }

  // .env hoặc text format
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      if (eq === -1) return null;
      return { name: l.slice(0, eq).trim(), value: l.slice(eq + 1).trim() };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Đọc entries từ process.env hiện tại
// Lọc bỏ các biến hệ thống rõ ràng (PATH, HOME, v.v.) để danh sách
// gọn hơn. User vẫn có thể chọn bất kỳ biến nào qua multi-select.
// ─────────────────────────────────────────────────────────────────

const SYSTEM_ENV_PREFIXES = [
  "npm_",
  "NODE_",
  "npm_config_",
  "APPDATA",
  "CommonProgramFiles",
  "COMPUTERNAME",
  "ComSpec",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "LOGONSERVER",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATHEXT",
  "PROCESSOR_",
  "ProgramData",
  "ProgramFiles",
  "ProgramW6432",
  "PSModulePath",
  "PUBLIC",
  "SESSIONNAME",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "windir",
  "ALLUSERSPROFILE",
  "INIT_CWD",
  "NVM_",
  "VSCODE_",
  "TERM_",
  "COLORTERM",
  "LANG",
];

const SYSTEM_ENV_EXACT = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "PWD",
  "OLDPWD",
  "SHLVL",
  "LOGNAME",
  "USER",
  "MAIL",
  "LS_COLORS",
  "TERM",
  "DISPLAY",
  "_",
  "GH_TOKEN",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
]);

function loadFromProcessEnv() {
  return Object.entries(process.env)
    .filter(([k]) => {
      if (SYSTEM_ENV_EXACT.has(k)) return false;
      if (SYSTEM_ENV_PREFIXES.some((p) => k.startsWith(p))) return false;
      return true;
    })
    .map(([name, value]) => ({ name, value: value || "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Multi-select entries + hiển thị giá trị để xác nhận
//
// @param {Array} entries  — mảng { name, value }
// @param {string} source  — nhãn nguồn ('file' | 'process.env')
// @returns {Array|null}   — subset entries đã chọn, hoặc null nếu hủy
// ─────────────────────────────────────────────────────────────────

async function pickAndPreviewEntries(entries, source) {
  if (entries.length === 0) {
    console.log(`${LOG} Nguồn ${source} không có biến nào.`);
    return null;
  }

  console.log(`\n${LOG} Tải được ${entries.length} biến từ ${source}.`);

  // Multi-select
  const selectedIndices = await askMultiSelect(
    `Chọn biến cần set làm secret (nguồn: ${source})`,
    entries.map((e) => ({ label: e.name })),
    { allowAll: true, minSelect: 1 },
  );

  if (selectedIndices.length === 0) {
    console.log("  Hủy.");
    return null;
  }

  const selected = selectedIndices.map((i) => entries[i]);

  // Hiển thị giá trị để xác nhận
  console.log("");
  console.log(`  ┌${"─".repeat(62)}`);
  console.log(`  │  Biến đã chọn (${selected.length}) — xác nhận giá trị trước khi set`);
  console.log(`  ├${"─".repeat(62)}`);

  const maxNameLen = Math.max(...selected.map((e) => e.name.length), 10);

  selected.forEach((e, i) => {
    const displayVal = e.value.length > 60 ? `${e.value.slice(0, 57)}...` : e.value;
    console.log(`  │  [${String(i + 1).padStart(2)}]  ${e.name.padEnd(maxNameLen)}  =  ${displayVal}`);
  });

  console.log(`  └${"─".repeat(62)}`);
  console.log("");

  const ok = await confirm(`  Xác nhận set ${selected.length} secret(s) lên repo?`);
  if (!ok) {
    console.log("  Hủy.");
    return null;
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────
// SET nhiều secrets từ file JSON/env HOẶC process.env
// ─────────────────────────────────────────────────────────────────

async function setFromSource(repo, account) {
  // Bước 1 — Chọn nguồn
  const sourceIdx = await selectMenu("Nguồn giá trị secrets", [
    { label: "File .env hoặc JSON  (chọn đường dẫn file)" },
    { label: "process.env hiện tại  (biến môi trường đang chạy)" },
  ]);

  if (sourceIdx === -1) return;

  let entries = [];
  let sourceLabel = "";

  // Bước 2 — Load entries theo nguồn
  if (sourceIdx === 0) {
    // ── File ──────────────────────────────────────────────────────
    console.log("\n  Template file có thể ở dạng JSON hoặc .env");
    console.log("  Xem template mẫu: nodecli/templates/gh-secrets.json\n");

    const filePath = await askFilePath("  Đường dẫn file secrets (JSON hoặc .env)");
    if (!filePath) {
      console.log("  Hủy.");
      return;
    }

    try {
      entries = parseSecretsFile(filePath);
    } catch (e) {
      console.error(e.message);
      return;
    }

    sourceLabel = path.basename(filePath);
  } else {
    // ── process.env ───────────────────────────────────────────────
    entries = loadFromProcessEnv();
    sourceLabel = "process.env";

    if (entries.length === 0) {
      console.log(`${LOG} Không tìm thấy biến môi trường nào phù hợp trong process.env.`);
      return;
    }
  }

  // Bước 3 — Multi-select + preview giá trị
  const selected = await pickAndPreviewEntries(entries, sourceLabel);
  if (!selected) return;

  // Bước 4 — Set từng secret lên repo
  let successCount = 0;
  for (const { name, value } of selected) {
    const { args, env } = ghArgs(["secret", "set", name, "--repo", repo, "--body", value], account);
    const result = spawn("gh", args, { env });
    if (result.ok) {
      console.log(`${LOG} ✓ ${name}`);
      successCount++;
    } else {
      console.error(`${LOG} ✗ ${name}: ${result.stderr}`);
    }
  }

  console.log(`\n${LOG} Hoàn tất: ${successCount}/${selected.length} secret đã set.`);
}

// ─────────────────────────────────────────────────────────────────
// DELETE một secret
// ─────────────────────────────────────────────────────────────────

async function deleteSecret(repo, account) {
  const names = await listSecrets(repo, account);
  if (names.length === 0) return;

  console.log("");
  const nameInput = await ask("  Tên secret cần xóa (nhập tên trực tiếp)");
  if (!nameInput) {
    console.log("  Hủy.");
    return;
  }

  const ok = await confirm(`  Xác nhận xóa secret "${nameInput}" khỏi ${repo}?`, false);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  const { args, env } = ghArgs(["secret", "delete", nameInput, "--repo", repo], account);
  const result = spawn("gh", args, { env });
  if (result.ok) {
    console.log(`${LOG} ✓ Đã xóa secret: ${nameInput}`);
  } else {
    console.error(`${LOG} ✗ Thất bại: ${result.stderr}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// MENU chính của secrets
// ─────────────────────────────────────────────────────────────────

async function run(repo, account) {
  while (true) {
    const idx = await selectMenu(`Secrets — ${repo}`, [
      { label: "Xem danh sách secrets" },
      { label: "Thêm / cập nhật 1 secret (nhập tay)" },
      { label: "Thêm / cập nhật secrets từ file hoặc process.env (chọn subset)" },
      { label: "Xóa 1 secret" },
    ]);

    if (idx === -1) break;

    if (idx === 0) await listSecrets(repo, account);
    if (idx === 1) await setOneSecret(repo, account);
    if (idx === 2) await setFromSource(repo, account);
    if (idx === 3) await deleteSecret(repo, account);
  }
}

module.exports = { run };
