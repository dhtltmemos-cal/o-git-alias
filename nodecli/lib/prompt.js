// lib/prompt.js — Các helper tương tác CLI (menu, input, confirm)
// Dùng readline built-in, không có dependency ngoài.

'use strict';

const readline = require('readline');

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/** Hỏi một câu, trả về Promise<string> */
function ask(question, defaultVal = '') {
  return new Promise((resolve) => {
    const rl = createRl();
    const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim() || defaultVal);
    });
  });
}

/** Confirm y/n, trả về Promise<boolean> */
async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const ans = await ask(`${question} [${hint}]`);
  if (!ans) return defaultYes;
  return ans.toLowerCase().startsWith('y');
}

/**
 * Hiển thị menu + hỏi chọn số.
 * items: [{ label: string }]
 * Trả về index (0-based) đã chọn.
 * Nếu có option 0=Thoát, trả về -1.
 */
async function selectMenu(title, items, { allowCancel = true } = {}) {
  console.log('');
  console.log(`  ┌${'─'.repeat(60)}`);
  console.log(`  │  ${title}`);
  console.log(`  ├${'─'.repeat(60)}`);
  items.forEach((item, i) => {
    console.log(`  │  [${i + 1}]  ${item.label}`);
  });
  if (allowCancel) console.log('  │  [0]  Hủy / Quay lại');
  console.log(`  └${'─'.repeat(60)}`);
  console.log('');

  while (true) {
    const max = items.length;
    const ans = await ask(`  Chọn [${allowCancel ? '0-' : '1-'}${max}]`);
    const n = parseInt(ans, 10);
    if (allowCancel && n === 0) return -1;
    if (n >= 1 && n <= max) return n - 1;
    console.log(`  Nhập số từ ${allowCancel ? 0 : 1} đến ${max}.`);
  }
}

/**
 * Hiển thị danh sách có index để chọn nhiều lần (không loop — chỉ chọn 1 lần).
 * Tiện dụng cho danh sách repo, secret, v.v.
 */
async function selectList(title, items, labelFn) {
  return selectMenu(title, items.map((it) => ({ label: labelFn(it) })));
}

/** Hỏi nhập đường dẫn file (có kiểm tra tồn tại) */
async function askFilePath(question) {
  const path = require('path');
  const fs   = require('fs');

  while (true) {
    const raw = await ask(question);
    if (!raw) return null;
    const resolved = raw.startsWith('~')
      ? path.join(require('os').homedir(), raw.slice(1))
      : path.resolve(raw);
    if (fs.existsSync(resolved)) return resolved;
    console.log(`  ✗ Không tìm thấy file: ${resolved}`);
  }
}

/** Đọc multiline từ stdin cho đến khi gặp dòng rỗng (Enter 2 lần) */
function askMultiline(prompt) {
  return new Promise((resolve) => {
    console.log(`  ${prompt} (nhập xong bấm Enter 2 lần):`);
    const rl = createRl();
    const lines = [];
    rl.on('line', (line) => {
      if (line === '' && lines.length > 0 && lines[lines.length - 1] === '') {
        rl.close();
      } else {
        lines.push(line);
      }
    });
    rl.on('close', () => resolve(lines.join('\n').trimEnd()));
  });
}

module.exports = { ask, confirm, selectMenu, selectList, askFilePath, askMultiline };
