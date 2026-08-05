// services/bom/index.js — Subcommand `ocli bom`
// Flow: quét cwd đệ quy → liệt kê file có UTF-8 BOM → hỏi xác nhận → ghi lại không BOM

"use strict";

const fs = require("fs");
const path = require("path");
const { confirm } = require("../../lib/prompt");

const LOG = "[bom]";
const SKIP_DIRS = new Set([".git", "node_modules"]);
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function hasBom(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(3);
    return fs.readSync(fd, buf, 0, 3, 0) === 3 && buf.equals(UTF8_BOM);
  } finally {
    fs.closeSync(fd);
  }
}

function scanBomFiles(rootDir) {
  const found = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        try {
          if (hasBom(filePath)) found.push(filePath);
        } catch {
          console.log(`${LOG} Bỏ qua file không đọc được: ${path.relative(rootDir, filePath)}`);
        }
      }
    }
  }

  walk(rootDir);
  return found;
}

function removeBom(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length >= 3 && data.subarray(0, 3).equals(UTF8_BOM)) {
    fs.writeFileSync(filePath, data.subarray(3));
    return true;
  }
  return false;
}

async function run() {
  const cwd = process.cwd();
  console.log(`${LOG} Đang quét: ${cwd}`);

  const files = scanBomFiles(cwd).sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    console.log(`${LOG} Không tìm thấy file có UTF-8 BOM.`);
    return;
  }

  console.log(`${LOG} Tìm thấy ${files.length} file có UTF-8 BOM:`);
  for (const file of files) console.log(`  - ${path.relative(cwd, file)}`);

  if (!(await confirm(`${LOG} Lưu lại các file trên sau khi remove BOM?`, false))) {
    console.log(`${LOG} Đã hủy, chưa ghi file nào.`);
    return;
  }

  let changed = 0;
  for (const file of files) {
    if (removeBom(file)) changed++;
  }
  console.log(`${LOG} Đã remove BOM: ${changed}/${files.length} file.`);
}

module.exports = { run, scanBomFiles, removeBom };
