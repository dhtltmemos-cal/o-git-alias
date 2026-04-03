#!/usr/bin/env node
// bin/ocli.js — Entry point cho CLI `ocli`
// Cú pháp: ocli <subcommand> [args...]
// Subcommands: gh, azure, clip (thêm sau)

'use strict';

const SUBCOMMANDS = {
  gh:    () => require('../services/gh/index').run(),
  azure: () => require('../services/azure/index').run(),
  clip:  () => require('../services/clip/index').run(),
};

function printHelp() {
  console.log('');
  console.log('  ocli <subcommand>');
  console.log('');
  console.log('  Subcommands:');
  console.log('    gh       GitHub — quản lý secrets (qua gh CLI + .git-o-config)');
  console.log('    azure    Azure DevOps — quản lý pipeline variables (REST API)');
  console.log('    clip     Đọc clipboard và ghi code vào file theo path metadata');
  console.log('');
  console.log('  Auth: đọc từ .git-o-config đặt cùng thư mục gốc của o-alias repo.');
  console.log('');
}

async function main() {
  const [,, sub, ...rest] = process.argv;

  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    printHelp();
    return;
  }

  const handler = SUBCOMMANDS[sub];
  if (!handler) {
    console.error(`[ocli] Subcommand không tồn tại: '${sub}'`);
    printHelp();
    process.exit(1);
  }

  try {
    await handler(rest);
  } catch (err) {
    console.error(`[ocli] Lỗi không xử lý được: ${err.message}`);
    process.exit(1);
  }
}

main();
