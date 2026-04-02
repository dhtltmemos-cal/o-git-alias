// lib/shell.js — Chạy lệnh shell, trả về stdout/stderr
// Dùng child_process built-in.

'use strict';

const { execSync, spawnSync } = require('child_process');

const LOG = '[shell]';

/**
 * Chạy lệnh, trả về stdout (string).
 * Throw nếu lệnh lỗi.
 */
function run(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
    return out.trim();
  } catch (err) {
    const msg = (err.stderr || err.message || '').trim();
    throw new Error(`${LOG} Lệnh thất bại: ${cmd}\n  ${msg}`);
  }
}

/**
 * Chạy lệnh theo mảng args (an toàn hơn với args chứa ký tự đặc biệt).
 * Trả về { ok, stdout, stderr, status }.
 */
function spawn(cmd, args = [], opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  return {
    ok:     result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    status: result.status,
  };
}

/**
 * Kiểm tra lệnh có tồn tại không.
 */
function commandExists(cmd) {
  try {
    execSync(
      process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = { run, spawn, commandExists };
