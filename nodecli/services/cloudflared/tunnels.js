// services/cloudflared/tunnels.js — Quản lý Cloudflare Tunnels
// Nghiệp vụ: list, tạo tunnel, tạo tunnel token/secret,
//            xuất credentials.json và config.yml để deploy Docker.
//
// Cloudflare Tunnels API:
//   GET    /accounts/:id/cfd_tunnel                    — list tunnels
//   POST   /accounts/:id/cfd_tunnel                    — tạo tunnel mới
//   DELETE /accounts/:id/cfd_tunnel/:tunnel_id         — xóa tunnel
//   GET    /accounts/:id/cfd_tunnel/:tunnel_id/token   — lấy tunnel token
//   POST   /accounts/:id/cfd_tunnel/:tunnel_id/connections — reset connections

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const { cloudflaredRequest } = require('../../lib/cloudflaredApi');
const { ask, confirm, selectMenu, askFilePath } = require('../../lib/prompt');

const LOG = '[cloudflared:tunnels]';

// ─────────────────────────────────────────────────────────────────
// HELPER: Lỗi từ Cloudflare API
// ─────────────────────────────────────────────────────────────────

function extractError(res) {
  if (res.errors && res.errors.length > 0) {
    return res.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
  }
  return `status ${res.status}`;
}

// ─────────────────────────────────────────────────────────────────
// LIST tunnels
// ─────────────────────────────────────────────────────────────────

async function listTunnels(account) {
  console.log(`\n${LOG} Đang lấy danh sách tunnel...`);
  const res = await cloudflaredRequest({
    method: 'GET',
    path:   `/accounts/${account.accountid}/cfd_tunnel?is_deleted=false`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Lỗi: ${extractError(res)}`);
    return [];
  }

  const tunnels = res.result || [];
  if (tunnels.length === 0) {
    console.log(`${LOG} Account chưa có tunnel nào.`);
    return [];
  }

  console.log(`\n  Tunnels hiện có (${tunnels.length}):\n`);
  console.log(`    ${'Tên'.padEnd(35)} ${'ID'.padEnd(38)} Status`);
  console.log(`    ${'─'.repeat(35)} ${'─'.repeat(38)} ${'─'.repeat(10)}`);
  tunnels.forEach((t, i) => {
    const status = t.status || 'inactive';
    console.log(`    [${String(i + 1).padStart(2)}]  ${(t.name || '').padEnd(31)} ${t.id}  ${status}`);
  });

  return tunnels;
}

// ─────────────────────────────────────────────────────────────────
// TẠO tunnel mới
// ─────────────────────────────────────────────────────────────────

async function createTunnel(account) {
  console.log(`\n${LOG} Tạo tunnel mới`);

  const name = await ask('  Tên tunnel (VD: my-service-tunnel)');
  if (!name) { console.log('  Hủy.'); return null; }

  // Sinh tunnel secret ngẫu nhiên (32 bytes base64)
  const secretBytes = crypto.randomBytes(32);
  const tunnelSecret = secretBytes.toString('base64');

  console.log(`\n${LOG} Đang tạo tunnel: ${name}...`);

  const res = await cloudflaredRequest({
    method: 'POST',
    path:   `/accounts/${account.accountid}/cfd_tunnel`,
    body:   { name, tunnel_secret: tunnelSecret },
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Tạo tunnel thất bại: ${extractError(res)}`);
    return null;
  }

  const tunnel = res.result;
  console.log(`${LOG} ✓ Đã tạo tunnel: ${tunnel.name} (id=${tunnel.id})`);

  return {
    id:            tunnel.id,
    name:          tunnel.name,
    tunnelSecret,
    accountTag:    account.accountid,
  };
}

// ─────────────────────────────────────────────────────────────────
// LẤY token của tunnel hiện có
// ─────────────────────────────────────────────────────────────────

async function getTunnelToken(account, tunnelId) {
  const res = await cloudflaredRequest({
    method: 'GET',
    path:   `/accounts/${account.accountid}/cfd_tunnel/${tunnelId}/token`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Không lấy được token: ${extractError(res)}`);
    return null;
  }

  return res.result; // string token
}

// ─────────────────────────────────────────────────────────────────
// PARSE file .env để lấy ingress rules
// Format hỗ trợ:
//   TUNNEL_HOSTNAME_1=yourdomain.com
//   TUNNEL_SERVICE_1=http://service:port
//   TUNNEL_HOSTNAME_2=sub.domain.com
//   TUNNEL_SERVICE_2=http://other:port
//   (hoặc HOSTNAME=, SERVICE= nếu chỉ có 1 rule)
// ─────────────────────────────────────────────────────────────────

function parseEnvForIngress(filePath) {
  const raw    = fs.readFileSync(filePath, 'utf8');
  const envMap = {};

  raw.split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    const eq = l.indexOf('=');
    if (eq === -1) return;
    const key = l.slice(0, eq).trim().toUpperCase();
    const val = l.slice(eq + 1).trim();
    envMap[key] = val;
  });

  const rules = [];

  // Thử pattern TUNNEL_HOSTNAME_N + TUNNEL_SERVICE_N (N = 1..20)
  for (let i = 1; i <= 20; i++) {
    const hostname = envMap[`TUNNEL_HOSTNAME_${i}`] || envMap[`HOSTNAME_${i}`];
    const service  = envMap[`TUNNEL_SERVICE_${i}`]  || envMap[`SERVICE_${i}`];
    if (hostname && service) {
      rules.push({ hostname, service });
    }
  }

  // Nếu không tìm thấy pattern đánh số, thử key đơn
  if (rules.length === 0) {
    const h = envMap['TUNNEL_HOSTNAME'] || envMap['HOSTNAME'];
    const s = envMap['TUNNEL_SERVICE']  || envMap['SERVICE'];
    if (h && s) rules.push({ hostname: h, service: s });
  }

  return { rules, envMap };
}

// ─────────────────────────────────────────────────────────────────
// BUILD credentials.json content
// ─────────────────────────────────────────────────────────────────

function buildCredentialsJson(tunnelId, tunnelSecret, accountTag) {
  return JSON.stringify(
    {
      AccountTag:   accountTag,
      TunnelSecret: tunnelSecret,
      TunnelID:     tunnelId,
      Endpoint:     '',
    },
    null,
    2
  );
}

// ─────────────────────────────────────────────────────────────────
// BUILD config.yml content
// ─────────────────────────────────────────────────────────────────

function buildConfigYml(tunnelId, ingressRules) {
  const lines = [
    `tunnel: ${tunnelId}`,
    `credentials-file: /etc/cloudflared/credentials.json`,
    ``,
    `ingress:`,
  ];

  for (const rule of ingressRules) {
    lines.push(`  - hostname: ${rule.hostname}`);
    lines.push(`    service: ${rule.service}`);
  }

  // Catch-all rule bắt buộc
  lines.push(`  - service: http_status:404`);
  lines.push('');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Tạo tunnel mới + xuất credentials + config
// ─────────────────────────────────────────────────────────────────

async function workflowCreateWithOutput(account) {
  // Bước 1: Tạo tunnel
  const created = await createTunnel(account);
  if (!created) return;

  await workflowOutputFiles(account, created.id, created.name, created.tunnelSecret, created.accountTag);
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Chọn tunnel hiện có → xuất credentials + config
// (Dùng khi đã có tunnel, muốn tái xuất file hoặc set lại secret)
// ─────────────────────────────────────────────────────────────────

async function workflowExistingTunnel(account) {
  const tunnels = await listTunnels(account);
  if (tunnels.length === 0) return;

  const idx = await selectMenu(
    'Chọn tunnel để xuất credentials + config',
    [
      ...tunnels.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` })),
      { label: '✏  Nhập Tunnel ID thủ công' },
    ]
  );
  if (idx === -1) return;

  let tunnelId, tunnelName, tunnelSecret;

  if (idx === tunnels.length) {
    tunnelId   = await ask('  Tunnel ID (UUID)');
    tunnelName = await ask('  Tên tunnel (để đặt tên file output)');
    if (!tunnelId) { console.log('  Hủy.'); return; }
  } else {
    tunnelId   = tunnels[idx].id;
    tunnelName = tunnels[idx].name;
  }

  // Hỏi nguồn secret
  const secretSourceIdx = await selectMenu(
    'Nguồn Tunnel Secret',
    [
      { label: 'Sinh secret mới ngẫu nhiên (32 bytes)' },
      { label: 'Nhập secret thủ công (base64)' },
    ]
  );
  if (secretSourceIdx === -1) return;

  if (secretSourceIdx === 0) {
    tunnelSecret = crypto.randomBytes(32).toString('base64');
    console.log(`${LOG} Secret mới: ${tunnelSecret}`);
  } else {
    tunnelSecret = await ask('  Tunnel Secret (base64)');
    if (!tunnelSecret) { console.log('  Hủy.'); return; }
  }

  await workflowOutputFiles(account, tunnelId, tunnelName, tunnelSecret, account.accountid);
}

// ─────────────────────────────────────────────────────────────────
// HELPER CHUNG: Hỏi ingress rules + ghi file credentials.json + config.yml
// ─────────────────────────────────────────────────────────────────

async function workflowOutputFiles(account, tunnelId, tunnelName, tunnelSecret, accountTag) {
  console.log(`\n${LOG} Chuẩn bị xuất file cho tunnel: ${tunnelName} (${tunnelId})`);

  // Bước: chọn nguồn ingress rules
  const ingressSourceIdx = await selectMenu(
    'Nguồn ingress rules',
    [
      { label: 'Nhập từ file .env' },
      { label: 'Nhập thủ công (từng hostname + service)' },
    ]
  );
  if (ingressSourceIdx === -1) return;

  let ingressRules = [];

  if (ingressSourceIdx === 0) {
    // Từ .env
    console.log('\n  Format .env hỗ trợ:');
    console.log('    TUNNEL_HOSTNAME_1=yourdomain.com');
    console.log('    TUNNEL_SERVICE_1=http://my-service:8080');
    console.log('    TUNNEL_HOSTNAME_2=sub.domain.com');
    console.log('    TUNNEL_SERVICE_2=http://other-service:3000\n');

    const envPath = await askFilePath('  Đường dẫn file .env');
    if (!envPath) { console.log('  Hủy.'); return; }

    let parsed;
    try {
      parsed = parseEnvForIngress(envPath);
    } catch (e) {
      console.error(`${LOG} Không đọc được file .env: ${e.message}`);
      return;
    }

    if (parsed.rules.length === 0) {
      console.log(`${LOG} Không tìm thấy ingress rule nào trong .env.`);
      console.log(`${LOG} Cần có TUNNEL_HOSTNAME_1 + TUNNEL_SERVICE_1 (hoặc không đánh số).`);

      // Hỏi có muốn tiếp tục không
      const fallback = await confirm('  Nhập thủ công thay thế?', true);
      if (!fallback) return;
      ingressRules = await askIngressManual();
    } else {
      ingressRules = parsed.rules;
      console.log(`\n  Tìm thấy ${ingressRules.length} ingress rule(s):`);
      ingressRules.forEach((r) => console.log(`    • ${r.hostname} → ${r.service}`));
    }
  } else {
    // Nhập tay
    ingressRules = await askIngressManual();
  }

  if (ingressRules.length === 0) {
    console.log(`${LOG} Không có ingress rule nào. Hủy.`);
    return;
  }

  // Chọn thư mục output
  const defaultOutputDir = process.cwd();
  const outputDirRaw = await ask(`  Thư mục output [${defaultOutputDir}]`);
  const outputDir    = outputDirRaw ? path.resolve(outputDirRaw) : defaultOutputDir;

  fs.mkdirSync(outputDir, { recursive: true });

  // Tên file dựa vào tunnel name (sanitized)
  const safeSlug     = (tunnelName || tunnelId).replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const credFile     = path.join(outputDir, `${safeSlug}-credentials.json`);
  const configFile   = path.join(outputDir, `${safeSlug}-config.yml`);

  // Preview
  console.log('\n  Tóm tắt sẽ xuất:');
  console.log(`    Tunnel ID    : ${tunnelId}`);
  console.log(`    Account Tag  : ${accountTag}`);
  console.log(`    Tunnel Secret: ${tunnelSecret.slice(0, 8)}... (${tunnelSecret.length} ký tự)`);
  console.log(`    Ingress rules:`);
  ingressRules.forEach((r) => console.log(`      ${r.hostname} → ${r.service}`));
  console.log(`    credentials.json → ${credFile}`);
  console.log(`    config.yml       → ${configFile}`);
  console.log('');

  const ok = await confirm('  Xác nhận ghi file?', true);
  if (!ok) { console.log('  Hủy.'); return; }

  // Ghi credentials.json
  const credContent = buildCredentialsJson(tunnelId, tunnelSecret, accountTag);
  fs.writeFileSync(credFile, credContent, 'utf8');
  console.log(`${LOG} ✓ Đã ghi: ${credFile}`);

  // Ghi config.yml
  const configContent = buildConfigYml(tunnelId, ingressRules);
  fs.writeFileSync(configFile, configContent, 'utf8');
  console.log(`${LOG} ✓ Đã ghi: ${configFile}`);

  console.log('');
  console.log(`${LOG} ──── Nội dung credentials.json ────`);
  console.log(credContent);
  console.log(`${LOG} ──── Nội dung config.yml ────`);
  console.log(configContent);
  console.log(`${LOG} Hướng dẫn deploy Docker:`);
  console.log(`  1. Copy ${path.basename(credFile)} vào container tại /etc/cloudflared/credentials.json`);
  console.log(`  2. Copy ${path.basename(configFile)} vào container tại /etc/cloudflared/config.yml`);
  console.log(`  3. docker run cloudflare/cloudflared:latest tunnel --config /etc/cloudflared/config.yml run`);
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Nhập ingress rules thủ công
// ─────────────────────────────────────────────────────────────────

async function askIngressManual() {
  const rules = [];
  let addMore = true;

  while (addMore) {
    const n = rules.length + 1;
    const hostname = await ask(`  Hostname ${n} (VD: yourdomain.com)`);
    if (!hostname) break;

    const service = await ask(`  Service ${n} (VD: http://my-service:8080)`);
    if (!service) break;

    rules.push({ hostname, service });

    if (rules.length >= 20) break; // giới hạn hợp lý
    addMore = await confirm('  Thêm rule tiếp theo?', false);
  }

  return rules;
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Xóa tunnel
// ─────────────────────────────────────────────────────────────────

async function deleteTunnel(account) {
  const tunnels = await listTunnels(account);
  if (tunnels.length === 0) return;

  const idx = await selectMenu(
    'Chọn tunnel để xóa',
    tunnels.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` }))
  );
  if (idx === -1) return;

  const t = tunnels[idx];

  const ok = await confirm(
    `  Xác nhận xóa tunnel "${t.name}" (${t.id})?`, false
  );
  if (!ok) { console.log('  Hủy.'); return; }

  // Force delete
  const res = await cloudflaredRequest({
    method: 'DELETE',
    path:   `/accounts/${account.accountid}/cfd_tunnel/${t.id}?force=true`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Xóa thất bại: ${extractError(res)}`);
    return;
  }

  console.log(`${LOG} ✓ Đã xóa tunnel: ${t.name}`);
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Lấy tunnel run token (dùng cho cloudflared tunnel run --token)
// ─────────────────────────────────────────────────────────────────

async function showTunnelToken(account) {
  const tunnels = await listTunnels(account);
  if (tunnels.length === 0) return;

  const idx = await selectMenu(
    'Chọn tunnel để lấy run token',
    tunnels.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` }))
  );
  if (idx === -1) return;

  const t = tunnels[idx];
  console.log(`\n${LOG} Đang lấy token cho tunnel: ${t.name}...`);

  const token = await getTunnelToken(account, t.id);
  if (!token) return;

  console.log(`\n${LOG} ✓ Tunnel run token:`);
  console.log(`\n  ${token}\n`);
  console.log(`${LOG} Dùng lệnh:`);
  console.log(`  cloudflared tunnel run --token ${token}`);
  console.log(`  hoặc trong docker-compose:`);
  console.log(`  command: tunnel --no-autoupdate run --token ${token}`);
}

// ─────────────────────────────────────────────────────────────────
// MENU chính
// ─────────────────────────────────────────────────────────────────

async function run(account) {
  while (true) {
    const idx = await selectMenu(
      `Cloudflare Tunnels — ${account.label} (${account.accountid})`,
      [
        { label: 'Xem danh sách tunnels' },
        { label: 'Tạo tunnel mới + xuất credentials.json + config.yml' },
        { label: 'Chọn tunnel hiện có → xuất credentials.json + config.yml' },
        { label: 'Lấy tunnel run token (cho cloudflared tunnel run --token)' },
        { label: 'Xóa tunnel' },
      ]
    );

    if (idx === -1) break;

    if (idx === 0) await listTunnels(account);
    if (idx === 1) await workflowCreateWithOutput(account);
    if (idx === 2) await workflowExistingTunnel(account);
    if (idx === 3) await showTunnelToken(account);
    if (idx === 4) await deleteTunnel(account);
  }
}

module.exports = { run };
