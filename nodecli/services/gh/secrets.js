// services/gh/secrets.js — Quản lý GitHub repo secrets qua `gh` CLI
// Nghiệp vụ: list, set (từng cái hoặc từ file), delete secrets của một repo.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('../../lib/shell');
const { ask, confirm, selectMenu, askFilePath } = require('../../lib/prompt');

const LOG = '[gh:secrets]';

// ─────────────────────────────────────────────────────────────────
// HELPER: Gọi gh với đúng account (--hostname nếu GHES, auth switch)
// ─────────────────────────────────────────────────────────────────

function ghArgs(baseArgs, account) {
  // account: { section, token, user } từ config
  // Với github.com, gh sử dụng profile được set sẵn qua `gh auth switch`
  // Ở đây ta truyền thêm env GH_TOKEN để override nếu có token
  const env = account.token
    ? { ...process.env, GH_TOKEN: account.token }
    : { ...process.env };
  return { args: baseArgs, env };
}

// ─────────────────────────────────────────────────────────────────
// LIST secrets của một repo
// ─────────────────────────────────────────────────────────────────

async function listSecrets(repo, account) {
  console.log(`\n${LOG} Đang lấy danh sách secrets: ${repo}`);
  const { args, env } = ghArgs(['secret', 'list', '--repo', repo], account);
  const result = spawn('gh', args, { env });

  if (!result.ok) {
    console.error(`${LOG} Lỗi: ${result.stderr}`);
    return [];
  }

  const lines = result.stdout.split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log(`${LOG} Repo chưa có secret nào.`);
    return [];
  }

  console.log(`\n  Secrets hiện có (${lines.length}):\n`);
  lines.forEach((line, i) => {
    const parts = line.split(/\s+/);
    const name = parts[0];
    const updatedAt = parts[1] || '';
    console.log(`    [${i + 1}]  ${name.padEnd(40)} ${updatedAt}`);
  });

  return lines.map((line) => line.split(/\s+/)[0]);
}

// ─────────────────────────────────────────────────────────────────
// SET một secret
// ─────────────────────────────────────────────────────────────────

async function setOneSecret(repo, account) {
  const name = await ask('\n  Tên secret (VD: API_KEY)');
  if (!name) { console.log('  Hủy.'); return; }

  const value = await ask(`  Giá trị của ${name}`);
  if (value === '') {
    const ok = await confirm('  Giá trị rỗng — tiếp tục?', false);
    if (!ok) { console.log('  Hủy.'); return; }
  }

  const { args, env } = ghArgs(
    ['secret', 'set', name, '--repo', repo, '--body', value],
    account
  );
  const result = spawn('gh', args, { env });
  if (result.ok) {
    console.log(`${LOG} ✓ Đã set secret: ${name}`);
  } else {
    console.error(`${LOG} ✗ Thất bại: ${result.stderr}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// SET nhiều secrets từ file JSON/env
//
// Hỗ trợ 2 format:
//   JSON: { "KEY": "value", ... }
//   ENV : KEY=value (mỗi dòng)
// ─────────────────────────────────────────────────────────────────

function parseSecretsFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    let obj;
    try { obj = JSON.parse(raw); } catch (e) {
      throw new Error(`${LOG} File JSON không hợp lệ: ${e.message}`);
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error(`${LOG} File JSON phải là object { KEY: value }`);
    }
    return Object.entries(obj).map(([k, v]) => ({ name: k, value: String(v) }));
  }

  // .env hoặc bất kỳ text format
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const eq = l.indexOf('=');
      if (eq === -1) return null;
      return { name: l.slice(0, eq).trim(), value: l.slice(eq + 1).trim() };
    })
    .filter(Boolean);
}

async function setFromFile(repo, account) {
  console.log('\n  Template file có thể ở dạng JSON hoặc .env');
  console.log('  Xem template mẫu: nodecli/templates/gh-secrets.json\n');

  const filePath = await askFilePath('  Đường dẫn file secrets (JSON hoặc .env)');
  if (!filePath) { console.log('  Hủy.'); return; }

  let entries;
  try {
    entries = parseSecretsFile(filePath);
  } catch (e) {
    console.error(e.message);
    return;
  }

  if (entries.length === 0) {
    console.log(`${LOG} File không có secret nào.`);
    return;
  }

  console.log(`\n  Sẽ set ${entries.length} secret(s) vào repo: ${repo}\n`);
  entries.forEach((e) => console.log(`    • ${e.name}`));

  const ok = await confirm('\n  Xác nhận tiến hành?');
  if (!ok) { console.log('  Hủy.'); return; }

  let successCount = 0;
  for (const { name, value } of entries) {
    const { args, env } = ghArgs(
      ['secret', 'set', name, '--repo', repo, '--body', value],
      account
    );
    const result = spawn('gh', args, { env });
    if (result.ok) {
      console.log(`${LOG} ✓ ${name}`);
      successCount++;
    } else {
      console.error(`${LOG} ✗ ${name}: ${result.stderr}`);
    }
  }

  console.log(`\n${LOG} Hoàn tất: ${successCount}/${entries.length} secret đã set.`);
}

// ─────────────────────────────────────────────────────────────────
// DELETE một hoặc nhiều secrets
// ─────────────────────────────────────────────────────────────────

async function deleteSecret(repo, account) {
  const names = await listSecrets(repo, account);
  if (names.length === 0) return;

  console.log('');
  const nameInput = await ask('  Tên secret cần xóa (nhập tên trực tiếp)');
  if (!nameInput) { console.log('  Hủy.'); return; }

  const ok = await confirm(`  Xác nhận xóa secret "${nameInput}" khỏi ${repo}?`, false);
  if (!ok) { console.log('  Hủy.'); return; }

  const { args, env } = ghArgs(
    ['secret', 'delete', nameInput, '--repo', repo],
    account
  );
  const result = spawn('gh', args, { env });
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
      { label: 'Xem danh sách secrets' },
      { label: 'Thêm / cập nhật 1 secret (nhập tay)' },
      { label: 'Thêm / cập nhật nhiều secrets từ file (JSON hoặc .env)' },
      { label: 'Xóa 1 secret' },
    ]);

    if (idx === -1) break;

    if (idx === 0) await listSecrets(repo, account);
    if (idx === 1) await setOneSecret(repo, account);
    if (idx === 2) await setFromFile(repo, account);
    if (idx === 3) await deleteSecret(repo, account);
  }
}

module.exports = { run };
