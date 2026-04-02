// services/gh/index.js — Subcommand `ocli gh`
// Flow: chọn account GitHub từ .git-o-config → chọn repo → chọn nghiệp vụ

'use strict';

const { loadSections, filterByProvider, parseSection } = require('../../lib/config');
const { selectMenu, selectList, ask } = require('../../lib/prompt');
const { spawn, commandExists } = require('../../lib/shell');
const secrets = require('./secrets');

const LOG = '[gh]';

// ─────────────────────────────────────────────────────────────────
// Kiểm tra gh CLI
// ─────────────────────────────────────────────────────────────────

function requireGhCli() {
  if (!commandExists('gh')) {
    console.error(`${LOG} Không tìm thấy lệnh 'gh'. Cài GitHub CLI: https://cli.github.com/`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────
// Lấy danh sách repo qua `gh repo list`
// ─────────────────────────────────────────────────────────────────

function listRepos(owner, account) {
  const env = account.token
    ? { ...process.env, GH_TOKEN: account.token }
    : { ...process.env };

  const result = spawn(
    'gh',
    ['repo', 'list', owner, '--limit', '50', '--json', 'nameWithOwner,isPrivate,description'],
    { env }
  );

  if (!result.ok) {
    throw new Error(`${LOG} Không lấy được danh sách repo: ${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${LOG} Response không phải JSON: ${result.stdout}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────

async function run() {
  requireGhCli();

  // ── Bước 1: Chọn account GitHub từ .git-o-config ─────────────────
  let sections;
  try {
    const cfg = loadSections();
    sections = filterByProvider(cfg.sections, 'github.com');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (sections.length === 0) {
    console.error(`${LOG} Không tìm thấy account github.com nào trong .git-o-config.`);
    console.error(`${LOG}   Thêm section: [github.com/myorg] với token=...`);
    process.exit(1);
  }

  const accountIdx = await selectMenu(
    'Chọn account / org GitHub',
    sections.map((s) => ({ label: s.section }))
  );
  if (accountIdx === -1) return;

  const account = sections[accountIdx];
  const { owner } = parseSection(account.section);

  console.log(`\n${LOG} Account: ${account.section}`);

  // ── Bước 2: Lấy danh sách repo ────────────────────────────────────
  let repos;
  try {
    console.log(`${LOG} Đang lấy danh sách repo của ${owner}...`);
    repos = listRepos(owner, account);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (repos.length === 0) {
    console.log(`${LOG} Không có repo nào.`);
    return;
  }

  // Cho phép chọn repo hoặc nhập tay
  const repoIdx = await selectMenu(
    `Chọn repo (${owner}) — ${repos.length} repo`,
    [
      ...repos.map((r) => ({
        label: `${r.nameWithOwner.padEnd(50)} ${r.isPrivate ? '🔒' : '🌐'}  ${r.description || ''}`.trimEnd(),
      })),
      { label: '✏  Nhập tên repo thủ công' },
    ]
  );

  if (repoIdx === -1) return;

  let selectedRepo;
  if (repoIdx === repos.length) {
    selectedRepo = await ask('  Tên repo (dạng owner/repo)');
    if (!selectedRepo) { console.log('  Hủy.'); return; }
  } else {
    selectedRepo = repos[repoIdx].nameWithOwner;
  }

  console.log(`\n${LOG} Repo: ${selectedRepo}`);

  // ── Bước 3: Chọn nghiệp vụ ────────────────────────────────────────
  while (true) {
    const featureIdx = await selectMenu(
      `Chọn nghiệp vụ — ${selectedRepo}`,
      [
        { label: 'Secrets — thêm/xem/xóa repo secrets' },
        // Thêm nghiệp vụ mới ở đây
      ]
    );

    if (featureIdx === -1) break;

    if (featureIdx === 0) {
      await secrets.run(selectedRepo, account);
    }
  }
}

module.exports = { run };
