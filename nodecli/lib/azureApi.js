// lib/azureApi.js — Gọi Azure DevOps REST API qua https built-in
// Không dùng axios hay node-fetch, chỉ dùng https của Node.
// Auth: Basic base64(":token") từ .git-o-config (header hoặc token field)

'use strict';

const https = require('https');

const LOG = '[azureApi]';

// ─────────────────────────────────────────────────────────────────
// Build Authorization header từ account object
// account: { section, token, user, header }
//
// Azure DevOps chấp nhận:
//   - header field  : "Authorization: Basic <base64>"   → dùng thẳng
//   - token field   : PAT                                → tự encode Basic
// ─────────────────────────────────────────────────────────────────
function buildAuthHeader(account) {
  // Nếu header đã được khai báo đầy đủ trong config (ví dụ: "Authorization: Basic xxx")
  if (account.header && account.header.startsWith('Authorization:')) {
    return account.header.replace(/^Authorization:\s*/, '').trim();
    // trả về phần sau "Authorization: " để gán vào header object
  }

  // Nếu có token field → tự encode
  if (account.token) {
    const pat = account.token;
    const encoded = Buffer.from(`:${pat}`).toString('base64');
    return `Basic ${encoded}`;
  }

  throw new Error(`${LOG} Không tìm thấy auth (token hoặc header) cho account: ${account.section}`);
}

/**
 * Gọi Azure DevOps REST API.
 *
 * @param {object} opts
 *   method   : 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
 *   org      : tên organization (VD: 'myorg')
 *   path     : path sau /org/ (VD: 'myproject/_apis/build/definitions?api-version=7.1')
 *   body     : object (sẽ JSON.stringify) hoặc undefined
 *   account  : { section, token, user, header }
 *
 * @returns Promise<{ ok, status, data }>
 *   ok   : true nếu status 2xx
 *   data : object đã parse JSON, hoặc null nếu response rỗng
 */
function azureRequest(opts) {
  const { method = 'GET', org, path: apiPath, body, account } = opts;

  let authValue;
  try {
    authValue = buildAuthHeader(account);
  } catch (e) {
    return Promise.reject(e);
  }

  const bodyStr = body ? JSON.stringify(body) : '';
  const hostname = 'dev.azure.com';
  const fullPath = `/${org}/${apiPath}`;

  const headers = {
    'Authorization': authValue,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (bodyStr) {
    headers['Content-Length'] = Buffer.byteLength(bodyStr);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: fullPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          if (raw.trim()) {
            try { data = JSON.parse(raw); } catch {
              data = { _rawText: raw };
            }
          }
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ ok, status: res.statusCode, data });
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = { azureRequest, buildAuthHeader };
