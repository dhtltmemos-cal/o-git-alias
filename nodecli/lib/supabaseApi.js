// lib/supabaseApi.js — Gọi Supabase Management API qua https built-in
// Auth: Bearer Personal Access Token từ .supabase-o-config
// Không dùng axios hay node-fetch — chỉ dùng https của Node.

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const LOG     = '[supabase:api]';
const LOG_CFG = '[supabase]';

// ─────────────────────────────────────────────────────────────────
// Load .env file vào process.env (dotenv-style, không cần package ngoài)
// Copy từ cloudflaredApi.js — không require chéo service
// ─────────────────────────────────────────────────────────────────

function loadDotenv(envFilePath) {
  if (!fs.existsSync(envFilePath)) return {};

  const raw = fs.readFileSync(envFilePath, 'utf8');
  const loaded = {};

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let val   = line.slice(eq + 1).trim();

    // Bỏ dấu nháy bao quanh
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    // Expand ${VAR} hoặc $VAR đơn giản
    val = val.replace(/\$\{([^}]+)\}/g, (_, k) => process.env[k] || loaded[k] || '');
    val = val.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, k) => process.env[k] || loaded[k] || '');

    loaded[key] = val;
    if (!(key in process.env)) process.env[key] = val;
  }

  return loaded;
}

/**
 * Load .env file và trả về các biến SUPABASE_* đang có trong process.env.
 * Tìm .env theo thứ tự: cwd → thư mục nodecli → thư mục gốc repo.
 */
function loadSupabaseEnv(envFilePath) {
  const candidates = [];

  if (envFilePath) {
    candidates.push(envFilePath);
  } else {
    candidates.push(
      path.join(process.cwd(), '.env'),
      path.resolve(__dirname, '..', '.env'),
      path.resolve(__dirname, '..', '..', '.env'),
    );
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      loadDotenv(p);
      break;
    }
  }

  // Trả về tất cả key SUPABASE_* từ process.env
  const result = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('SUPABASE_')) result[k] = v;
  }

  return { vars: result };
}

// ─────────────────────────────────────────────────────────────────
// Parse .supabase-o-config (INI-style)
// ─────────────────────────────────────────────────────────────────

function resolveSupabaseConfigPath() {
  const nodeCliDir = path.resolve(__dirname, '..');
  const candidate  = path.join(nodeCliDir, '.supabase-o-config');
  if (fs.existsSync(candidate)) return candidate;

  const homeCand = path.join(os.homedir(), '.supabase-o-config');
  if (fs.existsSync(homeCand)) return homeCand;

  return null;
}

function parseSupabaseConfig(filePath) {
  const raw   = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const sections = [];
  let cur = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const secMatch = line.match(/^\[(.+)\]$/);
    if (secMatch) {
      cur = {
        label:            secMatch[1],
        email:            '',
        accessToken:      '',
        accessTokenExp:   '',
        defaultPassword:  '',
        defaultOrgId:     '',
      };
      sections.push(cur);
      continue;
    }

    if (!cur) continue;

    const kv = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (!kv) continue;

    const [, key, val] = kv;
    if (key === 'email')           cur.email           = val.trim();
    if (key === 'accessToken')     cur.accessToken     = val.trim();
    if (key === 'accessTokenExp')  cur.accessTokenExp  = val.trim();
    if (key === 'defaultPassword') cur.defaultPassword = val.trim();
    if (key === 'defaultOrgId')    cur.defaultOrgId    = val.trim();
  }

  return sections;
}

/**
 * Load tất cả sections từ .supabase-o-config
 * Throw nếu không tìm thấy file.
 */
function loadSupabaseSections() {
  const cfgPath = resolveSupabaseConfigPath();
  if (!cfgPath) {
    throw new Error(
      `${LOG_CFG} Không tìm thấy .supabase-o-config.\n` +
      '  Tạo từ mẫu: cp nodecli/.supabase-o-config.example nodecli/.supabase-o-config\n' +
      '  Điền email và accessToken của bạn.',
    );
  }
  return { sections: parseSupabaseConfig(cfgPath), filePath: cfgPath };
}

// ─────────────────────────────────────────────────────────────────
// HTTP helper — gọi Supabase Management API
// ─────────────────────────────────────────────────────────────────

/**
 * Gọi Supabase Management API.
 *
 * @param {object} opts
 *   method  : 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
 *   path    : path sau https://api.supabase.com/v1 (VD: '/projects')
 *   body    : object (JSON) hoặc undefined
 *   token   : Personal Access Token (sbp_xxx)
 *
 * @returns Promise<{ ok, status, data }>
 *   ok:   true nếu status 2xx
 *   data: object parse JSON hoặc null
 */
function supabaseRequest(opts) {
  const { method = 'GET', path: apiPath, body, token } = opts;

  if (!token) {
    return Promise.reject(new Error(`${LOG_CFG} Thiếu accessToken để gọi Supabase API`));
  }

  const bodyStr = body ? JSON.stringify(body) : '';
  const hostname = 'api.supabase.com';
  const fullPath = `/v1${apiPath}`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
  if (bodyStr) {
    headers['Content-Length'] = Buffer.byteLength(bodyStr);
  }

  const startTime = Date.now();

  if (bodyStr) {
    const bodyObj = JSON.parse(bodyStr);
    console.log(`${LOG} → ${method} /v1${apiPath}  (body keys: ${Object.keys(bodyObj).join(', ')})`);
  } else {
    console.log(`${LOG} → ${method} /v1${apiPath}`);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: fullPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const elapsed = Date.now() - startTime;
          const raw     = Buffer.concat(chunks).toString('utf8');
          let data      = null;

          if (raw.trim()) {
            try { data = JSON.parse(raw); } catch {
              data = { _rawText: raw };
            }
          }

          const ok = res.statusCode >= 200 && res.statusCode < 300;

          if (ok) {
            console.log(`${LOG} ← ${res.statusCode} OK (${elapsed}ms)`);
          } else {
            const errMsg = data && data.message ? data.message : raw.slice(0, 120);
            console.log(`${LOG} ✗ ${method} /v1${apiPath} — ${res.statusCode}: ${errMsg}`);
          }

          resolve({ ok, status: res.statusCode, data });
        });
      },
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────
// Slugify — chuyển email username thành slug hợp lệ
// ─────────────────────────────────────────────────────────────────

/**
 * Lấy phần trước @ của email, lowercase, replace ký tự đặc biệt → slug.
 * Tối đa 40 ký tự.
 */
function slugify(str) {
  const username = str.includes('@') ? str.split('@')[0] : str;
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

module.exports = {
  loadSupabaseSections,
  resolveSupabaseConfigPath,
  supabaseRequest,
  loadSupabaseEnv,
  slugify,
  loadDotenv,
};
