#!/usr/bin/env node
// bin/ocli.js — Entry point cho CLI `ocli`
// Cú pháp: ocli <subcommand> [args...]
// Subcommands: gh, azure, clip, addfiles, cloudflared, supabase

"use strict";

const SUBCOMMANDS = {
  gh: () => require("../services/gh/index").run(),
  azure: () => require("../services/azure/index").run(),
  clip: () => require("../services/clip/index").run(),
  addfiles: (args) => require("../services/addfiles/index").run(args),
  cloudflared: () => require("../services/cloudflared/index").run(),
  supabase: () => require("../services/supabase/index").run(),
};

function printHelp() {
  console.log("");
  console.log("  ocli <subcommand>");
  console.log("");
  console.log("  Subcommands:");
  console.log("    gh           GitHub — quản lý secrets (qua gh CLI + .git-o-config)");
  console.log("    azure        Azure DevOps — quản lý pipeline variables (REST API)");
  console.log("    clip         Đọc clipboard và ghi code vào file theo path metadata");
  console.log("    addfiles     Đọc file/zip và ghi tuần tự vào cwd theo metadata // Path");
  console.log("    cloudflared  Cloudflare Tunnels — tạo tunnel, DNS records, credentials Docker");
  console.log("    supabase     Supabase — tạo project, lấy S3 & PostgreSQL connection info");
  console.log("");
  console.log("  Auth:");
  console.log("    GitHub / Azure  : .git-o-config (thư mục gốc o-alias repo)");
  console.log("    Cloudflare      : nodecli/.cloudflared-o-config");
  console.log("    Supabase        : nodecli/.supabase-o-config");
  console.log("");
  console.log("  Cloudflare env vars (CLOUDFLARED_*):");
  console.log("    Đặt trong .env cùng thư mục để tự động điền thông tin khi tạo tunnel.");
  console.log("    VD: CLOUDFLARED_TUNNEL_NAME, CLOUDFLARED_TUNNEL_HOSTNAME_1, ...");
  console.log("");
  console.log("  Supabase env vars (SUPABASE_*):");
  console.log("    Đặt trong .env cùng thư mục để tự động điền thông tin.");
  console.log("    VD: SUPABASE_PROJECT_NAME, SUPABASE_BUCKET_NAME, SUPABASE_REGION, ...");
  console.log("");
}

async function main() {
  const [, , sub, ...rest] = process.argv;

  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
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
