// services/azure/variables.js — Quản lý Azure Pipeline Variables
// Nghiệp vụ: list, set (từng cái hoặc từ file), delete variables của một pipeline.
//
// Azure DevOps API dùng:
//   GET  /{org}/{project}/_apis/build/definitions/{definitionId}?api-version=7.1
//   PUT  /{org}/{project}/_apis/build/definitions/{definitionId}?api-version=7.1
//
// Variable object trong definition.variables:
//   { [name]: { value: string, isSecret: boolean, allowOverride: boolean } }

'use strict';

const fs   = require('fs');
const path = require('path');
const { azureRequest } = require('../../lib/azureApi');
const { ask, confirm, selectMenu, askFilePath } = require('../../lib/prompt');

const LOG = '[azure:variables]';
const API_VERSION = '7.1';

// ─────────────────────────────────────────────────────────────────
// HELPER: Lấy pipeline definition đầy đủ (cần để PUT lại nguyên vẹn)
// ─────────────────────────────────────────────────────────────────

async function getDefinition(org, project, definitionId, account) {
  const res = await azureRequest({
    method: 'GET',
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
    method: 'PUT',
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
  console.log(`    ${'Tên'.padEnd(40)} ${'Secret?'.padEnd(9)} Giá trị`);
  console.log(`    ${'─'.repeat(40)} ${'─'.repeat(9)} ${'─'.repeat(20)}`);

  entries.forEach(([name, v], i) => {
    const isSecret = v.isSecret ? '🔒 yes' : 'no';
    const displayVal = v.isSecret ? '(ẩn)' : (v.value || '');
    console.log(`    [${String(i + 1).padStart(2)}]  ${name.padEnd(36)} ${isSecret.padEnd(9)} ${displayVal}`);
  });

  return entries.map(([name]) => name);
}

// ─────────────────────────────────────────────────────────────────
// SET một variable
// ─────────────────────────────────────────────────────────────────

async function setOneVariable(org, project, pipeline, account) {
  const name = await ask('\n  Tên variable (VD: MY_VAR)');
  if (!name) { console.log('  Hủy.'); return; }

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
    value: isSecretAns ? '' : value,   // Azure xóa value nếu isSecret khi truyền lên
    isSecret: isSecretAns,
    allowOverride,
  };

  // Nếu là secret, cần truyền value riêng theo cách Azure quy định
  if (isSecretAns) {
    def.variables[name].value = value;
  }

  try {
    await putDefinition(org, project, pipeline.id, def, account);
    console.log(`${LOG} ✓ Đã set variable: ${name}${isSecretAns ? ' (secret)' : ''}`);
  } catch (e) {
    console.error(e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// SET nhiều variables từ file JSON hoặc .env
//
// JSON format:
//   {
//     "VAR_NAME": "value",
//     "SECRET_VAR": { "value": "secret", "isSecret": true, "allowOverride": false }
//   }
//
// ENV format:
//   VAR_NAME=value
//   SECRET_VAR=secret          ← mặc định isSecret=false
// ─────────────────────────────────────────────────────────────────

function parseVarsFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    let obj;
    try { obj = JSON.parse(raw); } catch (e) {
      throw new Error(`${LOG} File JSON không hợp lệ: ${e.message}`);
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error(`${LOG} File JSON phải là object`);
    }

    return Object.entries(obj)
      .filter(([k]) => !k.startsWith('_'))   // bỏ qua key comment (_comment)
      .map(([name, v]) => {
        if (typeof v === 'string') {
          return { name, value: v, isSecret: false, allowOverride: true };
        }
        if (typeof v === 'object' && v !== null) {
          return {
            name,
            value:         String(v.value ?? ''),
            isSecret:      Boolean(v.isSecret),
            allowOverride: v.allowOverride !== undefined ? Boolean(v.allowOverride) : true,
          };
        }
        return { name, value: String(v), isSecret: false, allowOverride: true };
      });
  }

  // .env format: KEY=value (isSecret mặc định false)
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const eq = l.indexOf('=');
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

async function setFromFile(org, project, pipeline, account) {
  console.log('\n  Template file có thể ở dạng JSON hoặc .env');
  console.log('  Xem template mẫu: nodecli/templates/azure-pipeline-vars.json\n');

  const filePath = await askFilePath('  Đường dẫn file variables (JSON hoặc .env)');
  if (!filePath) { console.log('  Hủy.'); return; }

  let entries;
  try {
    entries = parseVarsFile(filePath);
  } catch (e) {
    console.error(e.message);
    return;
  }

  if (entries.length === 0) {
    console.log(`${LOG} File không có variable nào.`);
    return;
  }

  console.log(`\n  Sẽ set ${entries.length} variable(s) vào pipeline: ${pipeline.name}\n`);
  entries.forEach((e) => {
    const tag = e.isSecret ? ' 🔒' : '';
    console.log(`    • ${e.name}${tag}`);
  });

  const ok = await confirm('\n  Xác nhận tiến hành?');
  if (!ok) { console.log('  Hủy.'); return; }

  // Lấy definition 1 lần rồi merge tất cả variable
  let def;
  try {
    def = await getDefinition(org, project, pipeline.id, account);
  } catch (e) {
    console.error(e.message);
    return;
  }

  if (!def.variables) def.variables = {};

  for (const entry of entries) {
    def.variables[entry.name] = {
      value: entry.value,
      isSecret: entry.isSecret,
      allowOverride: entry.allowOverride,
    };
  }

  try {
    await putDefinition(org, project, pipeline.id, def, account);
    console.log(`\n${LOG} ✓ Đã set ${entries.length} variable(s) vào: ${pipeline.name}`);
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

  console.log('');
  const nameInput = await ask('  Tên variable cần xóa (nhập tên trực tiếp)');
  if (!nameInput) { console.log('  Hủy.'); return; }

  if (!names.includes(nameInput)) {
    console.log(`${LOG} Không tìm thấy variable: ${nameInput}`);
    return;
  }

  const ok = await confirm(
    `  Xác nhận xóa variable "${nameInput}" khỏi pipeline "${pipeline.name}"?`, false
  );
  if (!ok) { console.log('  Hủy.'); return; }

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
      { label: 'Xem danh sách variables' },
      { label: 'Thêm / cập nhật 1 variable (nhập tay)' },
      { label: 'Thêm / cập nhật nhiều variables từ file (JSON hoặc .env)' },
      { label: 'Xóa 1 variable' },
    ]);

    if (idx === -1) break;

    if (idx === 0) await listVariables(org, project, pipeline, account);
    if (idx === 1) await setOneVariable(org, project, pipeline, account);
    if (idx === 2) await setFromFile(org, project, pipeline, account);
    if (idx === 3) await deleteVariable(org, project, pipeline, account);
  }
}

module.exports = { run };
