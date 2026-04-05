// services/cloudflared/index.js — Subcommand `ocli cloudflared`
// Flow: chọn account từ .cloudflared-o-config → chọn nhóm chức năng → chọn nghiệp vụ

'use strict';

const { loadCloudflaredSections } = require('../../lib/cloudflaredApi');
const { selectMenu } = require('../../lib/prompt');
const tunnels = require('./tunnels');

const LOG = '[cloudflared]';

async function run() {

  // ── Bước 1: Load + chọn account ────────────────────────────────────
  let sections;
  try {
    const cfg = loadCloudflaredSections();
    sections  = cfg.sections;
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (sections.length === 0) {
    console.error(`${LOG} Không tìm thấy account nào trong .cloudflared-o-config.`);
    console.error(`${LOG}   Tạo file:`);
    console.error(`${LOG}   cp nodecli/.cloudflared-o-config.example nodecli/.cloudflared-o-config`);
    console.error(`${LOG}   Điền email, apikey, accountid của bạn.`);
    process.exit(1);
  }

  // Validate các account có đủ thông tin
  const valid = sections.filter((s) => s.email && s.apikey && s.accountid);
  if (valid.length === 0) {
    console.error(`${LOG} Các account trong .cloudflared-o-config đều thiếu email/apikey/accountid.`);
    process.exit(1);
  }

  if (valid.length < sections.length) {
    console.warn(`${LOG} Bỏ qua ${sections.length - valid.length} account(s) thiếu thông tin.`);
  }

  const accountIdx = await selectMenu(
    'Chọn Cloudflare account',
    valid.map((s) => ({
      label: `${s.label.padEnd(20)}  ${s.email.padEnd(35)}  accountid: ${s.accountid}`,
    }))
  );
  if (accountIdx === -1) return;

  const account = valid[accountIdx];
  console.log(`\n${LOG} Account: ${account.label} (${account.email})`);

  // ── Bước 2: Vòng lặp chọn nhóm chức năng ──────────────────────────
  while (true) {
    const groupIdx = await selectMenu(
      `Cloudflare — ${account.label}`,
      [
        { label: 'Tunnels — tạo/quản lý tunnel, xuất credentials + config Docker' },
        // Thêm nhóm chức năng mới ở đây (DNS, Workers, v.v.)
      ]
    );
    if (groupIdx === -1) break;

    if (groupIdx === 0) {
      await tunnels.run(account);
    }
  }
}

module.exports = { run };
