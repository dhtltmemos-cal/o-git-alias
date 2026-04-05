// lib/cloudflaredApi.js — Gọi Cloudflare REST API qua https built-in
// Auth: X-Auth-Email + X-Auth-Key từ .cloudflared-o-config
// Không dùng axios hay node-fetch — chỉ dùng https của Node.

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const LOG = '[cloudflaredApi]';

// ─────────────────────────────────────────────────────────────────
// Parse .cloudflared-o-config (INI-style)
// Format:
//   [label]
//   email=...
//   apikey=...
//   accountid=...
// ─────────────────────────────────────────────────────────────────

function resolveCloudflaredConfigPath() {
  // Tìm trong thư mục nodecli/ trước
  const nodeCliDir = path.resolve(__dirname, '..');
  const candidate  = path.join(nodeCliDir, '.cloudflared-o-config');
  if (fs.existsSync(candidate)) return candidate;

  // Fallback: thư mục home
  const homeCand = path.join(os.homedir(), '.cloudflared-o-config');
  if (fs.existsSync(homeCand)) return homeCand;

  return null;
}

function parseCloudflaredConfig(filePath) {
  const raw   = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const sections = [];
  let cur = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const secMatch = line.match(/^\[(.+)\]$/);
    if (secMatch) {
      cur = { label: secMatch[1], email: '', apikey: '', accountid: '' };
      sections.push(cur);
      continue;
    }

    if (!cur) continue;

    const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!kv) continue;

    const [, key, val] = kv;
    if (key === 'email')     cur.email     = val.trim();
    if (key === 'apikey')    cur.apikey    = val.trim();
    if (key === 'accountid') cur.accountid = val.trim();
  }

  return sections;
}

/**
 * Load tất cả sections từ .cloudflared-o-config
 * Throw nếu không tìm thấy file.
 */
function loadCloudflaredSections() {
  const cfgPath = resolveCloudflaredConfigPath();
  if (!cfgPath) {
    throw new Error(
      `${LOG} Không tìm thấy .cloudflared-o-config.\n` +
      '  Tạo từ mẫu: cp nodecli/.cloudflared-o-config.example nodecli/.cloudflared-o-config\n' +
      '  Điền email, apikey, accountid của bạn.'
    );
  }
  return { sections: parseCloudflaredConfig(cfgPath), filePath: cfgPath };
}

// ─────────────────────────────────────────────────────────────────
// Build auth headers từ account object
// ─────────────────────────────────────────────────────────────────

function buildHeaders(account, extraHeaders = {}) {
  if (!account.email || !account.apikey) {
    throw new Error(`${LOG} Thiếu email hoặc apikey cho account: ${account.label}`);
  }
  return {
    'X-Auth-Email':   account.email,
    'X-Auth-Key':     account.apikey,
    'Content-Type':   'application/json',
    'Accept':         'application/json',
    ...extraHeaders,
  };
}

// ─────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────

/**
 * Gọi Cloudflare REST API.
 *
 * @param {object} opts
 *   method    : 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
 *   path      : path sau https://api.cloudflare.com/client/v4 (VD: '/accounts/:id/tunnels')
 *   body      : object (JSON) hoặc undefined
 *   account   : { label, email, apikey, accountid }
 *
 * @returns Promise<{ ok, status, result, errors, messages, raw }>
 */
function cloudflaredRequest(opts) {
  const { method = 'GET', path: apiPath, body, account } = opts;

  let headers;
  try {
    headers = buildHeaders(account);
  } catch (e) {
    return Promise.reject(e);
  }

  const bodyStr = body ? JSON.stringify(body) : '';
  if (bodyStr) {
    headers['Content-Length'] = Buffer.byteLength(bodyStr);
  }

  const hostname = 'api.cloudflare.com';
  const fullPath = `/client/v4${apiPath}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: fullPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch {
            parsed = { success: false, _rawText: raw };
          }

          const ok = res.statusCode >= 200 && res.statusCode < 300 && parsed.success !== false;
          resolve({
            ok,
            status:   res.statusCode,
            result:   parsed.result   ?? null,
            errors:   parsed.errors   ?? [],
            messages: parsed.messages ?? [],
            raw,
          });
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = { cloudflaredRequest, loadCloudflaredSections, resolveCloudflaredConfigPath };
