// services/azure/variables.js — Quản lý Azure Pipeline Variables
// Nghiệp vụ: list, set (từng cái hoặc từ nguồn), delete variables của một pipeline.
//
// Azure DevOps API dùng:
//   GET  /{org}/{project}/_apis/build/definitions/{definitionId}?api-version=7.1
//   PUT  /{org}/{project}/_apis/build/definitions/{definitionId}?api-version=7.1
//
// Variable object trong definition.variables:
//   { [name]: { value: string, isSecret: boolean, allowOverride: boolean } }

"use strict";

const fs = require("fs");
const path = require("path");
const { azureRequest } = require("../../lib/azureApi");
const { ask, confirm, selectMenu, askFilePath, askMultiSelect } = require("../../lib/prompt");

const LOG = "[azure:variables]";
const API_VERSION = "7.1";

// ─────────────────────────────────────────────────────────────────
// HELPER: Lấy pipeline definition đầy đủ (cần để PUT lại nguyên vẹn)
// ─────────────────────────────────────────────────────────────────

async function getDefinition(org, project, definitionId, account) {
  const res = await azureRequest({
    method: "GET",
    org,
    path: `${encodeURIComponent(project)}/_apis/build/definitions/${definitionId}?api-version=${API_VERSION}`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được definition [${definitionId}]: ${msg}`);
  }

  return res.data;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: PUT definition lại (cập nhật variables)
// Azure yêu cầu PUT toàn bộ definition object — không có PATCH riêng cho variables
// ─────────────────────────────────────────────────────────────────

async function putDefinition(org, project, definitionId, definition, account) {
  const res = await azureRequest({
    method: "PUT",
    org,
    path: `${encodeURIComponent(project)}/_apis/build/definitions/${definitionId}?api-version=${API_VERSION}`,
    body: definition,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không cập nhật được definition [${definitionId}]: ${msg}`);
  }

  return res.data;
}

// ─────────────────────────────────────────────────────────────────
// LIST variables của pipeline
// ─────────────────────────────────────────────────────────────────

async function listVariables(org, project, pipeline, account) {
  console.log(`\n${LOG} Đang lấy variables: ${pipeline.name} (id=${pipeline.id})`);

  let def;
  try {
    def = await getDefinition(org, project, pipeline.id, account);
  } catch (e) {
    console.error(e.message);
    return [];
  }

  const vars = def.variables || {};
  const entries = Object.entries(vars);

  if (entries.length === 0) {
    console.log(`${LOG} Pipeline chưa có variable nào.`);
    return [];
  }

  console.log(`\n  Variables hiện có (${entries.length}):\n`);
  console.log(`    ${"Tên".padEnd(40)} ${"Secret?".padEnd(9)} ${"Override?".padEnd(10)} Giá trị`);
  console.log(`    ${"─".repeat(40)} ${"─".repeat(9)} ${"─".repeat(10)} ${"─".repeat(20)}`);

  entries.forEach(([name, v], i) => {
    const isSecret = v.isSecret ? "🔒 yes" : "no";
    const allowOverride = v.allowOverride !== false ? "yes" : "no";
    const displayVal = v.isSecret ? "(ẩn)" : v.value || "";
    console.log(`    [${String(i + 1).padStart(2)}]  ${name.padEnd(36)} ${isSecret.padEnd(9)} ${allowOverride.padEnd(10)} ${displayVal}`);
  });

  return entries.map(([name]) => name);
}

// ─────────────────────────────────────────────────────────────────
// SET một variable
// ─────────────────────────────────────────────────────────────────

async function setOneVariable(org, project, pipeline, account) {
  const name = await ask("\n  Tên variable (VD: MY_VAR)");
  if (!name) {
    console.log("  Hủy.");
    return;
  }

  const value = await ask(`  Giá trị của ${name}`);

  const isSecretAns = await confirm(`  Đánh dấu là secret (ẩn giá trị)?`, false);
  const allowOverride = await confirm(`  Cho phép override khi queue build?`, true);

  // Lấy definition hiện tại
  let def;
  try {
    def = await getDefinition(org, project, pipeline.id, account);
  } catch (e) {
    console.error(e.message);
    return;
  }

  // Cập nhật / thêm variable
  if (!def.variables) def.variables = {};
  def.variables[name] = {
    value: isSecretAns ? "" : value,
    isSecret: isSecretAns,
    allowOverride,
  };

  // Nếu là secret, cần truyền value riêng theo cách Azure quy định
  if (isSecretAns) {
    def.variables[name].value = value;
  }

  try {
    await putDefinition(org, project, pipeline.id, def, account);
    console.log(`${LOG} ✓ Đã set variable: ${name}${isSecretAns ? " (secret)" : ""}`);
  } catch (e) {
    console.error(e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Biến môi trường hệ thống cần lọc bỏ
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
    .map(([name, value]) => ({
      name,
      value: value || "",
      isSecret: false,
      allowOverride: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Parse file JSON hoặc .env → mảng entries
//
// JSON format:
//   {
//     "VAR_NAME": "value",
//     "SECRET_VAR": { "value": "secret", "isSecret": true, "allowOverride": false }
//   }
//
// ENV format:
//   VAR_NAME=value   ← mặc định isSecret=false
// ─────────────────────────────────────────────────────────────────

function parseVarsFile(filePath) {
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
      throw new Error(`${LOG} File JSON phải là object`);
    }

    return Object.entries(obj)
      .filter(([k]) => !k.startsWith("_"))
      .map(([name, v]) => {
        if (typeof v === "string") {
          return { name, value: v, isSecret: false, allowOverride: true };
        }
        if (typeof v === "object" && v !== null) {
          return {
            name,
            value: String(v.value ?? ""),
            isSecret: Boolean(v.isSecret),
            allowOverride: v.allowOverride !== undefined ? Boolean(v.allowOverride) : true,
          };
        }
        return { name, value: String(v), isSecret: false, allowOverride: true };
      });
  }

  // .env format
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      if (eq === -1) return null;
      return {
        name: l.slice(0, eq).trim(),
        value: l.slice(eq + 1).trim(),
        isSecret: false,
        allowOverride: true,
      };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Multi-select entries + preview giá trị để xác nhận
// ─────────────────────────────────────────────────────────────────

async function pickAndPreviewEntries(entries, source) {
  if (entries.length === 0) {
    console.log(`${LOG} Nguồn ${source} không có variable nào.`);
    return null;
  }

  console.log(`\n${LOG} Tải được ${entries.length} variable(s) từ ${source}.`);

  const selectedIndices = await askMultiSelect(
    `Chọn variable cần set vào pipeline (nguồn: ${source})`,
    entries.map((e) => ({
      label: `${e.name}${e.isSecret ? "  🔒" : ""}`,
    })),
    { allowAll: true, minSelect: 1 },
  );

  if (selectedIndices.length === 0) {
    console.log("  Hủy.");
    return null;
  }

  const selected = selectedIndices.map((i) => entries[i]);

  // Hiển thị giá trị để xác nhận
  console.log("");
  console.log(`  ┌${"─".repeat(64)}`);
  console.log(`  │  Variable đã chọn (${selected.length}) — xác nhận trước khi set`);
  console.log(`  ├${"─".repeat(64)}`);

  const maxNameLen = Math.max(...selected.map((e) => e.name.length), 10);

  selected.forEach((e, i) => {
    const displayVal = e.value.length > 55 ? `${e.value.slice(0, 52)}...` : e.value;
    console.log(`  │  [${String(i + 1).padStart(2)}]  ${e.name.padEnd(maxNameLen)}  =  ${displayVal}`);
  });

  console.log(`  └${"─".repeat(64)}`);
  console.log("");

  const ok = await confirm(`  Xác nhận set ${selected.length} variable(s) vào pipeline?`);
  if (!ok) {
    console.log("  Hủy.");
    return null;
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Hỏi isSecret + allowOverride cho toàn bộ batch
//
// Trả về { isSecret: boolean, allowOverride: boolean }
// Mặc định:
//   isSecret     = true  (các biến từ CI/env thường là bí mật)
//   allowOverride = true  (Azure gọi là "Let users override this value
//                          when running this pipeline")
// ─────────────────────────────────────────────────────────────────

async function askBatchSecretOptions() {
  console.log("");
  console.log("  ── Tuỳ chọn bảo mật cho tất cả variable vừa chọn ──────────────────");

  const isSecret = await confirm(
    "  Đánh dấu tất cả là secret (ẩn giá trị trong UI)?",
    true, // default Yes
  );

  const allowOverride = await confirm(
    "  Cho phép user override giá trị khi queue build (Let users override this value)?",
    true, // default Yes
  );

  console.log("");
  return { isSecret, allowOverride };
}

// ─────────────────────────────────────────────────────────────────
// SET nhiều variables từ nguồn: file JSON/.env HOẶC process.env
// ─────────────────────────────────────────────────────────────────

async function setFromSource(org, project, pipeline, account) {
  // Bước 1 — Chọn nguồn
  const sourceIdx = await selectMenu("Nguồn giá trị variables", [
    { label: "File .env hoặc JSON  (chọn đường dẫn file)" },
    { label: "process.env hiện tại  (biến môi trường đang chạy)" },
  ]);

  if (sourceIdx === -1) return;

  let entries = [];
  let sourceLabel = "";

  if (sourceIdx === 0) {
    // ── File ──────────────────────────────────────────────────────
    console.log("\n  Template file có thể ở dạng JSON hoặc .env");
    console.log("  Xem template mẫu: nodecli/templates/azure-pipeline-vars.json\n");

    const filePath = await askFilePath("  Đường dẫn file variables (JSON hoặc .env)");
    if (!filePath) {
      console.log("  Hủy.");
      return;
    }

    try {
      entries = parseVarsFile(filePath);
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

  // Bước 2 — Multi-select + preview
  const selected = await pickAndPreviewEntries(entries, sourceLabel);
  if (!selected) return;

  // Bước 3 — Hỏi isSecret + allowOverride cho toàn bộ batch
  const { isSecret, allowOverride } = await askBatchSecretOptions();

  // In tóm tắt lựa chọn
  console.log(`  isSecret     : ${isSecret ? "🔒 Có — giá trị sẽ bị ẩn" : "Không"}`);
  console.log(`  allowOverride: ${allowOverride ? "Có — user có thể override khi queue build" : "Không"}`);
  console.log("");

  // Bước 4 — Lấy definition 1 lần rồi merge tất cả variable
  let def;
  try {
    def = await getDefinition(org, project, pipeline.id, account);
  } catch (e) {
    console.error(e.message);
    return;
  }

  if (!def.variables) def.variables = {};

  for (const entry of selected) {
    def.variables[entry.name] = {
      value: entry.value,
      isSecret: isSecret,
      allowOverride: allowOverride,
    };
  }

  try {
    await putDefinition(org, project, pipeline.id, def, account);
    console.log(`\n${LOG} ✓ Đã set ${selected.length} variable(s) vào: ${pipeline.name}` + ` (secret=${isSecret}, allowOverride=${allowOverride})`);
  } catch (e) {
    console.error(e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE một variable
// ─────────────────────────────────────────────────────────────────

async function deleteVariable(org, project, pipeline, account) {
  const names = await listVariables(org, project, pipeline, account);
  if (names.length === 0) return;

  console.log("");
  const nameInput = await ask("  Tên variable cần xóa (nhập tên trực tiếp)");
  if (!nameInput) {
    console.log("  Hủy.");
    return;
  }

  if (!names.includes(nameInput)) {
    console.log(`${LOG} Không tìm thấy variable: ${nameInput}`);
    return;
  }

  const ok = await confirm(`  Xác nhận xóa variable "${nameInput}" khỏi pipeline "${pipeline.name}"?`, false);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  let def;
  try {
    def = await getDefinition(org, project, pipeline.id, account);
  } catch (e) {
    console.error(e.message);
    return;
  }

  if (def.variables && def.variables[nameInput] !== undefined) {
    delete def.variables[nameInput];
  } else {
    console.log(`${LOG} Variable không tồn tại trong definition.`);
    return;
  }

  try {
    await putDefinition(org, project, pipeline.id, def, account);
    console.log(`${LOG} ✓ Đã xóa variable: ${nameInput}`);
  } catch (e) {
    console.error(e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// MENU chính của variables
// ─────────────────────────────────────────────────────────────────

async function run(org, project, pipeline, account) {
  while (true) {
    const idx = await selectMenu(`Variables — ${pipeline.name}`, [
      { label: "Xem danh sách variables" },
      { label: "Thêm / cập nhật 1 variable (nhập tay)" },
      { label: "Thêm / cập nhật variables từ file hoặc process.env (chọn subset)" },
      { label: "Xóa 1 variable" },
    ]);

    if (idx === -1) break;

    if (idx === 0) await listVariables(org, project, pipeline, account);
    if (idx === 1) await setOneVariable(org, project, pipeline, account);
    if (idx === 2) await setFromSource(org, project, pipeline, account);
    if (idx === 3) await deleteVariable(org, project, pipeline, account);
  }
}

module.exports = { run };
