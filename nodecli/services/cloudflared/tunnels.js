// services/cloudflared/tunnels.js — Quản lý Cloudflare Tunnels
// Nghiệp vụ: list, tạo tunnel, xuất credentials + config,
//            tạo/cập nhật DNS records (CNAME) cho tunnel,
//            đọc cấu hình từ biến CLOUDFLARED_* trong process.env.
//
// Biến môi trường hỗ trợ (CLOUDFLARED_*):
//   CLOUDFLARED_TUNNEL_NAME         — tên tunnel
//   CLOUDFLARED_TUNNEL_ID           — tunnel ID (UUID)
//   CLOUDFLARED_TUNNEL_SECRET       — tunnel secret (base64)
//   CLOUDFLARED_ACCOUNT_ID          — account ID
//   CLOUDFLARED_TUNNEL_HOSTNAME_1   — hostname ingress rule 1
//   CLOUDFLARED_TUNNEL_SERVICE_1    — service ingress rule 1
//   CLOUDFLARED_TUNNEL_HOSTNAME_2   — hostname ingress rule 2
//   CLOUDFLARED_TUNNEL_SERVICE_2    — service ingress rule 2
//   ... (tối đa 20 rules)
//
// Cloudflare Tunnels API:
//   GET    /accounts/:id/cfd_tunnel
//   POST   /accounts/:id/cfd_tunnel
//   DELETE /accounts/:id/cfd_tunnel/:tunnel_id
//   GET    /accounts/:id/cfd_tunnel/:tunnel_id/token
//
// Cloudflare DNS API:
//   GET    /zones?name=<domain>
//   GET    /zones/:zone_id/dns_records?name=<hostname>&type=CNAME
//   POST   /zones/:zone_id/dns_records
//   PUT    /zones/:zone_id/dns_records/:record_id
//   PATCH  /zones/:zone_id/dns_records/:record_id

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cloudflaredRequest } = require("../../lib/cloudflaredApi");
const { ask, confirm, selectMenu, askFilePath } = require("../../lib/prompt");
const { runAlertMenu } = require("./tunnelAlerts");

const LOG = "[cloudflared:tunnels]";

// ─────────────────────────────────────────────────────────────────
// HELPER: Lỗi từ Cloudflare API
// ─────────────────────────────────────────────────────────────────

function extractError(res) {
  if (res.errors && res.errors.length > 0) {
    return res.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
  }
  return `status ${res.status}`;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Đọc ingress rules từ CLOUDFLARED_TUNNEL_HOSTNAME_N + SERVICE_N
// ─────────────────────────────────────────────────────────────────

function readIngressFromEnv(envVars) {
  const rules = [];

  for (let i = 1; i <= 20; i++) {
    const hostname = envVars[`CLOUDFLARED_TUNNEL_HOSTNAME_${i}`];
    const service = envVars[`CLOUDFLARED_TUNNEL_SERVICE_${i}`];
    if (hostname && service) {
      rules.push({ hostname: hostname.trim(), service: service.trim() });
    }
  }

  return rules;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Build label cho menu option "Lấy từ process.env"
// ─────────────────────────────────────────────────────────────────

function buildEnvIngressLabel(envRules) {
  if (envRules.length === 0) {
    return "Lấy từ process.env hiện tại  ⚠  (không tìm thấy CLOUDFLARED_TUNNEL_HOSTNAME_N)";
  }
  const preview = envRules
    .slice(0, 3)
    .map((r) => r.hostname)
    .join(", ");
  const more = envRules.length > 3 ? ` +${envRules.length - 3} nữa` : "";
  return `Lấy từ process.env hiện tại  ✓  (${envRules.length} rule(s): ${preview}${more})`;
}

function buildEnvHostnamesLabel(envRules) {
  if (envRules.length === 0) {
    return "Lấy hostname từ process.env hiện tại  ⚠  (không tìm thấy CLOUDFLARED_TUNNEL_HOSTNAME_N)";
  }
  const preview = envRules
    .slice(0, 3)
    .map((r) => r.hostname)
    .join(", ");
  const more = envRules.length > 3 ? ` +${envRules.length - 3} nữa` : "";
  return `Lấy hostname từ process.env hiện tại  ✓  (${envRules.length} hostname(s): ${preview}${more})`;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: In chi tiết ingress rules từ env
// ─────────────────────────────────────────────────────────────────

function printEnvIngressRules(envRules) {
  console.log(`\n  Ingress rules từ process.env (${envRules.length} rule(s)):\n`);
  envRules.forEach((r, i) => {
    console.log(`    ${String(i + 1).padStart(2)}.  ${r.hostname}`);
    console.log(`        → ${r.service}`);
  });
  console.log("");
}

// ─────────────────────────────────────────────────────────────────
// LIST tunnels
// ─────────────────────────────────────────────────────────────────

async function listTunnels(account) {
  console.log(`\n${LOG} Đang lấy danh sách tunnel...`);
  const res = await cloudflaredRequest({
    method: "GET",
    path: `/accounts/${account.accountid}/cfd_tunnel?is_deleted=false`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Lỗi: ${extractError(res)}`);
    return [];
  }

  const tunnelList = res.result || [];
  if (tunnelList.length === 0) {
    console.log(`${LOG} Account chưa có tunnel nào.`);
    return [];
  }

  console.log(`\n  Tunnels hiện có (${tunnelList.length}):\n`);
  console.log(`    ${"Tên".padEnd(35)} ${"ID".padEnd(38)} Status`);
  console.log(`    ${"─".repeat(35)} ${"─".repeat(38)} ${"─".repeat(10)}`);
  tunnelList.forEach((t, i) => {
    const status = t.status || "inactive";
    console.log(`    [${String(i + 1).padStart(2)}]  ${(t.name || "").padEnd(31)} ${t.id}  ${status}`);
  });

  return tunnelList;
}

// ─────────────────────────────────────────────────────────────────
// TẠO tunnel mới
// ─────────────────────────────────────────────────────────────────

async function createTunnel(account, envVars) {
  console.log(`\n${LOG} Tạo tunnel mới`);

  const envName = envVars["CLOUDFLARED_TUNNEL_NAME"];
  let defaultName = envName || "";

  if (envName) {
    console.log(`${LOG} Phát hiện CLOUDFLARED_TUNNEL_NAME = ${envName}`);
  }

  const name = await ask(`  Tên tunnel${defaultName ? ` [${defaultName}]` : " (VD: my-service-tunnel)"}`, defaultName);
  if (!name) {
    console.log("  Hủy.");
    return null;
  }

  const envSecret = envVars["CLOUDFLARED_TUNNEL_SECRET"];
  let tunnelSecret;

  if (envSecret && envSecret.trim()) {
    console.log(`${LOG} Phát hiện CLOUDFLARED_TUNNEL_SECRET trong env — dùng secret này.`);
    tunnelSecret = envSecret.trim();
  } else {
    tunnelSecret = crypto.randomBytes(32).toString("base64");
    console.log(`${LOG} Sinh tunnel secret mới (32 bytes).`);
  }

  console.log(`\n${LOG} Đang tạo tunnel: ${name}...`);

  const res = await cloudflaredRequest({
    method: "POST",
    path: `/accounts/${account.accountid}/cfd_tunnel`,
    body: { name, tunnel_secret: tunnelSecret },
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Tạo tunnel thất bại: ${extractError(res)}`);
    return null;
  }

  const tunnel = res.result;
  console.log(`${LOG} ✓ Đã tạo tunnel: ${tunnel.name} (id=${tunnel.id})`);

  return {
    id: tunnel.id,
    name: tunnel.name,
    tunnelSecret,
    accountTag: account.accountid,
  };
}

// ─────────────────────────────────────────────────────────────────
// LẤY token của tunnel hiện có
// ─────────────────────────────────────────────────────────────────

async function getTunnelToken(account, tunnelId) {
  const res = await cloudflaredRequest({
    method: "GET",
    path: `/accounts/${account.accountid}/cfd_tunnel/${tunnelId}/token`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Không lấy được token: ${extractError(res)}`);
    return null;
  }

  return res.result;
}

// ─────────────────────────────────────────────────────────────────
// PARSE file .env để lấy ingress rules (CLOUDFLARED_TUNNEL_HOSTNAME_N)
// ─────────────────────────────────────────────────────────────────

function parseEnvForIngress(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const envMap = {};

  raw.split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    const eq = l.indexOf("=");
    if (eq === -1) return;
    const key = l.slice(0, eq).trim().toUpperCase();
    let val = l.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envMap[key] = val;
  });

  const rules = [];

  for (let i = 1; i <= 20; i++) {
    const hostname = envMap[`CLOUDFLARED_TUNNEL_HOSTNAME_${i}`];
    const service = envMap[`CLOUDFLARED_TUNNEL_SERVICE_${i}`];
    if (hostname && service) {
      rules.push({ hostname, service });
    }
  }

  if (rules.length === 0) {
    const h = envMap["CLOUDFLARED_TUNNEL_HOSTNAME"];
    const s = envMap["CLOUDFLARED_TUNNEL_SERVICE"];
    if (h && s) rules.push({ hostname: h, service: s });
  }

  return { rules, envMap };
}

// ─────────────────────────────────────────────────────────────────
// BUILD credentials.json + config.yml
// ─────────────────────────────────────────────────────────────────

function buildCredentialsJson(tunnelId, tunnelSecret, accountTag) {
  return JSON.stringify({ AccountTag: accountTag, TunnelSecret: tunnelSecret, TunnelID: tunnelId, Endpoint: "" }, null, 2);
}

function buildConfigYml(tunnelId, ingressRules) {
  const lines = [`tunnel: ${tunnelId}`, `credentials-file: /etc/cloudflared/credentials.json`, ``, `ingress:`];

  for (const rule of ingressRules) {
    lines.push(`  - hostname: ${rule.hostname}`);
    lines.push(`    service: ${rule.service}`);
  }

  lines.push(`  - service: http_status:404`);
  lines.push("");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────
// MENU CHỌN NGUỒN INGRESS RULES (workflowOutputFiles)
//
//   [1] Lấy từ process.env — hiển thị số rules + preview hostname/service
//   [2] Nhập từ file .env
//   [3] Nhập thủ công
//
// Trả về: mảng { hostname, service } hoặc null nếu hủy
// ─────────────────────────────────────────────────────────────────

async function selectIngressSource(envVars) {
  const envRules = readIngressFromEnv(envVars || {});

  const sourceIdx = await selectMenu("Nguồn ingress rules", [
    { label: buildEnvIngressLabel(envRules) },
    { label: "Nhập từ file .env (CLOUDFLARED_TUNNEL_HOSTNAME_N + SERVICE_N)" },
    { label: "Nhập thủ công (từng hostname + service)" },
  ]);

  if (sourceIdx === -1) return null;

  // ── [1] process.env ──────────────────────────────────────────────
  if (sourceIdx === 0) {
    if (envRules.length === 0) {
      console.log(`\n${LOG} Không tìm thấy CLOUDFLARED_TUNNEL_HOSTNAME_N nào trong process.env.`);
      console.log(`${LOG} Gợi ý: thêm vào .env:`);
      console.log(`${LOG}   CLOUDFLARED_TUNNEL_HOSTNAME_1=app.yourdomain.com`);
      console.log(`${LOG}   CLOUDFLARED_TUNNEL_SERVICE_1=http://your-service:8080`);
      return null;
    }

    printEnvIngressRules(envRules);
    const ok = await confirm("  Dùng các ingress rules này?", true);
    if (!ok) return null;

    return envRules;
  }

  // ── [2] file .env ────────────────────────────────────────────────
  if (sourceIdx === 1) {
    console.log("\n  Format .env hỗ trợ:");
    console.log("    CLOUDFLARED_TUNNEL_HOSTNAME_1=yourdomain.com");
    console.log("    CLOUDFLARED_TUNNEL_SERVICE_1=http://my-service:8080");
    console.log("    CLOUDFLARED_TUNNEL_HOSTNAME_2=sub.domain.com");
    console.log("    CLOUDFLARED_TUNNEL_SERVICE_2=http://other:3000\n");

    const envPath = await askFilePath("  Đường dẫn file .env");
    if (!envPath) {
      console.log("  Hủy.");
      return null;
    }

    let parsed;
    try {
      parsed = parseEnvForIngress(envPath);
    } catch (e) {
      console.error(`${LOG} Không đọc được file .env: ${e.message}`);
      return null;
    }

    if (parsed.rules.length === 0) {
      console.log(`${LOG} Không tìm thấy CLOUDFLARED_TUNNEL_HOSTNAME_N + SERVICE_N trong file.`);
      return null;
    }

    console.log(`\n  Tìm thấy ${parsed.rules.length} ingress rule(s):`);
    parsed.rules.forEach((r) => console.log(`    • ${r.hostname} → ${r.service}`));
    console.log("");

    return parsed.rules;
  }

  // ── [3] nhập thủ công ────────────────────────────────────────────
  return await askIngressManual();
}

// ─────────────────────────────────────────────────────────────────
// MENU CHỌN NGUỒN HOSTNAMES (workflowManageDns)
//
//   [1] Lấy hostname từ process.env — hiển thị danh sách
//   [2] Nhập từ file .env
//   [3] Nhập thủ công
//
// Trả về: mảng string hostnames hoặc null nếu hủy
// ─────────────────────────────────────────────────────────────────

async function selectHostnameSource(envVars) {
  const envRules = readIngressFromEnv(envVars || {});

  const sourceIdx = await selectMenu("Nguồn hostnames để tạo DNS records", [
    { label: buildEnvHostnamesLabel(envRules) },
    { label: "Nhập từ file .env (CLOUDFLARED_TUNNEL_HOSTNAME_N)" },
    { label: "Nhập thủ công (từng hostname)" },
  ]);

  if (sourceIdx === -1) return null;

  // ── [1] process.env ──────────────────────────────────────────────
  if (sourceIdx === 0) {
    if (envRules.length === 0) {
      console.log(`\n${LOG} Không tìm thấy CLOUDFLARED_TUNNEL_HOSTNAME_N nào trong process.env.`);
      console.log(`${LOG} Gợi ý: thêm vào .env: CLOUDFLARED_TUNNEL_HOSTNAME_1=app.yourdomain.com`);
      return null;
    }

    console.log(`\n  Hostnames từ process.env (${envRules.length} hostname(s)):\n`);
    envRules.forEach((r, i) => {
      console.log(`    ${String(i + 1).padStart(2)}.  ${r.hostname}`);
    });
    console.log("");

    const ok = await confirm("  Dùng danh sách hostname này?", true);
    if (!ok) return null;

    return envRules.map((r) => r.hostname);
  }

  // ── [2] file .env ────────────────────────────────────────────────
  if (sourceIdx === 1) {
    const envPath = await askFilePath("  Đường dẫn file .env");
    if (!envPath) {
      console.log("  Hủy.");
      return null;
    }

    let parsed;
    try {
      parsed = parseEnvForIngress(envPath);
    } catch (e) {
      console.error(`${LOG} Không đọc được file .env: ${e.message}`);
      return null;
    }

    if (parsed.rules.length === 0) {
      console.log(`${LOG} Không tìm thấy CLOUDFLARED_TUNNEL_HOSTNAME_N trong file.`);
      return null;
    }

    console.log(`\n  Tìm thấy ${parsed.rules.length} hostname(s):`);
    parsed.rules.forEach((r) => console.log(`    • ${r.hostname}`));
    console.log("");

    return parsed.rules.map((r) => r.hostname);
  }

  // ── [3] nhập thủ công ────────────────────────────────────────────
  return await askHostnamesManual();
}

// ─────────────────────────────────────────────────────────────────
// DNS: Lấy zone ID từ hostname
// ─────────────────────────────────────────────────────────────────

function extractRootDomain(hostname) {
  const clean = hostname.replace(/^\*\./, "");
  const parts = clean.split(".");
  if (parts.length < 2) return clean;
  return parts.slice(-2).join(".");
}

async function listAllZones(account) {
  const res = await cloudflaredRequest({
    method: "GET",
    path: `/zones?per_page=50&status=active`,
    account,
  });

  if (!res.ok) return [];
  return (res.result || []).map((z) => ({ id: z.id, name: z.name, status: z.status }));
}

async function tryGetZoneId(account, hostname) {
  const rootDomain = extractRootDomain(hostname);

  const res = await cloudflaredRequest({
    method: "GET",
    path: `/zones?name=${encodeURIComponent(rootDomain)}&status=active`,
    account,
  });

  if (!res.ok) return null;

  const zones = res.result || [];
  if (zones.length === 0) return null;

  return { zoneId: zones[0].id, zoneName: zones[0].name };
}

// ─────────────────────────────────────────────────────────────────
// DNS: Tìm CNAME record hiện có cho hostname
// ─────────────────────────────────────────────────────────────────

async function findDnsRecord(account, zoneId, hostname) {
  const res = await cloudflaredRequest({
    method: "GET",
    path: `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}&per_page=10`,
    account,
  });

  if (!res.ok) {
    throw new Error(`${LOG} Không lấy được DNS records: ${extractError(res)}`);
  }

  const records = res.result || [];
  return records.length > 0 ? records[0] : null;
}

// ─────────────────────────────────────────────────────────────────
// DNS: Tạo CNAME record mới
// ─────────────────────────────────────────────────────────────────

async function createDnsRecord(account, zoneId, hostname, tunnelId) {
  const target = `${tunnelId}.cfargotunnel.com`;

  const res = await cloudflaredRequest({
    method: "POST",
    path: `/zones/${zoneId}/dns_records`,
    body: {
      type: "CNAME",
      name: hostname,
      content: target,
      proxied: true,
      ttl: 1,
      comment: `cloudflared tunnel: ${tunnelId}`,
    },
    account,
  });

  if (!res.ok) {
    throw new Error(`${LOG} Tạo DNS record thất bại cho ${hostname}: ${extractError(res)}`);
  }

  return res.result;
}

// ─────────────────────────────────────────────────────────────────
// DNS: Cập nhật CNAME record hiện có
// ─────────────────────────────────────────────────────────────────

async function updateDnsRecord(account, zoneId, recordId, hostname, tunnelId) {
  const target = `${tunnelId}.cfargotunnel.com`;

  const res = await cloudflaredRequest({
    method: "PATCH",
    path: `/zones/${zoneId}/dns_records/${recordId}`,
    body: {
      type: "CNAME",
      name: hostname,
      content: target,
      proxied: true,
      ttl: 1,
      comment: `cloudflared tunnel: ${tunnelId}`,
    },
    account,
  });

  if (!res.ok) {
    throw new Error(`${LOG} Cập nhật DNS record thất bại cho ${hostname}: ${extractError(res)}`);
  }

  return res.result;
}

// ─────────────────────────────────────────────────────────────────
// DNS: Upsert CNAME record
// ─────────────────────────────────────────────────────────────────

async function upsertDnsRecord(account, hostname, tunnelId, zoneId, zoneName) {
  const target = `${tunnelId}.cfargotunnel.com`;

  let existing;
  try {
    existing = await findDnsRecord(account, zoneId, hostname);
  } catch (e) {
    return { hostname, action: "error", error: e.message };
  }

  if (existing) {
    if (existing.content === target && existing.proxied) {
      return { hostname, action: "ok", record: existing, zoneName };
    }
    try {
      const updated = await updateDnsRecord(account, zoneId, existing.id, hostname, tunnelId);
      return { hostname, action: "updated", record: updated, previousContent: existing.content, zoneName };
    } catch (e) {
      return { hostname, action: "error", error: e.message };
    }
  }

  try {
    const created = await createDnsRecord(account, zoneId, hostname, tunnelId);
    return { hostname, action: "created", record: created, zoneName };
  } catch (e) {
    return { hostname, action: "error", error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// DNS: Resolve zone cho hostname với fallback chọn tay
// ─────────────────────────────────────────────────────────────────

async function resolveZoneForHostname(account, hostname, cachedZones) {
  let found = await tryGetZoneId(account, hostname);
  if (found) return found;

  const clean = hostname.replace(/^\*\./, "");
  const parts = clean.split(".");
  if (parts.length >= 3) {
    const threeLevel = parts.slice(-3).join(".");
    const res = await cloudflaredRequest({
      method: "GET",
      path: `/zones?name=${encodeURIComponent(threeLevel)}&status=active`,
      account,
    });
    if (res.ok && res.result && res.result.length > 0) {
      return { zoneId: res.result[0].id, zoneName: res.result[0].name };
    }
  }

  console.log(`\n${LOG} Không tìm thấy zone tự động cho: ${hostname}`);

  let zones = cachedZones;
  if (!zones) {
    console.log(`${LOG} Đang lấy danh sách zones trong account...`);
    zones = await listAllZones(account);
  }

  if (zones.length === 0) {
    console.log(`${LOG} Account không có zone nào hoặc API key thiếu quyền "Zone: Read".`);
    console.log(`${LOG} Để thêm domain vào Cloudflare: https://dash.cloudflare.com → Add a Site`);
    return null;
  }

  console.log(`${LOG} Zones có trong account (${zones.length}):`);
  const zoneIdx = await selectMenu(`Chọn zone cho hostname: ${hostname}`, [
    ...zones.map((z) => ({ label: `${z.name.padEnd(40)} ${z.id}` })),
    { label: "✗  Bỏ qua hostname này" },
  ]);

  if (zoneIdx === -1 || zoneIdx === zones.length) return null;

  return { zoneId: zones[zoneIdx].id, zoneName: zones[zoneIdx].name };
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Tạo / cập nhật DNS records cho tunnel
// ─────────────────────────────────────────────────────────────────

async function workflowManageDns(account, envVars) {
  const tunnelList = await listTunnels(account);
  if (tunnelList.length === 0) return;

  const idx = await selectMenu(
    "Chọn tunnel để quản lý DNS records",
    tunnelList.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` })),
  );
  if (idx === -1) return;

  const selectedTunnel = tunnelList[idx];
  const tunnelId = selectedTunnel.id;

  console.log(`\n${LOG} Tunnel: ${selectedTunnel.name} (${tunnelId})`);
  console.log(`${LOG} Target CNAME: ${tunnelId}.cfargotunnel.com`);
  console.log("");

  // Chọn nguồn hostname — menu 3 lựa chọn
  const hostnames = await selectHostnameSource(envVars);

  if (!hostnames || hostnames.length === 0) {
    console.log(`${LOG} Không có hostname nào. Hủy.`);
    return;
  }

  // Preview
  console.log(`\n${LOG} Sẽ tạo/cập nhật ${hostnames.length} CNAME record(s):`);
  hostnames.forEach((h) => console.log(`    ${h}  →  ${tunnelId}.cfargotunnel.com  [proxied]`));
  console.log("");

  const ok = await confirm("  Xác nhận tiến hành?", true);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  let cachedZones = null;

  const results = [];
  for (const hostname of hostnames) {
    process.stdout.write(`  ${hostname.padEnd(50)} ... `);

    const zoneInfo = await resolveZoneForHostname(account, hostname, cachedZones);

    if (!cachedZones && !zoneInfo) {
      cachedZones = await listAllZones(account);
    }

    if (!zoneInfo) {
      console.log("✗ bỏ qua (không chọn zone)");
      results.push({ hostname, action: "skipped" });
      continue;
    }

    const r = await upsertDnsRecord(account, hostname, tunnelId, zoneInfo.zoneId, zoneInfo.zoneName);
    results.push(r);

    if (r.action === "created") console.log(`✓ tạo mới (zone: ${r.zoneName})`);
    else if (r.action === "updated") console.log(`↺ cập nhật từ [${r.previousContent}] (zone: ${r.zoneName})`);
    else if (r.action === "ok") console.log(`= đã đúng, bỏ qua (zone: ${r.zoneName})`);
    else console.log(`✗ lỗi: ${r.error}`);
  }

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const ok2 = results.filter((r) => r.action === "ok").length;
  const skipped = results.filter((r) => r.action === "skipped").length;
  const errors = results.filter((r) => r.action === "error");

  console.log("");
  console.log(`${LOG} Tổng kết DNS: tạo mới=${created}  cập nhật=${updated}  đã đúng=${ok2}  bỏ qua=${skipped}  lỗi=${errors.length}`);

  if (errors.length > 0) {
    console.log(`\n${LOG} Các record gặp lỗi:`);
    errors.forEach((r) => console.log(`    ✗ ${r.hostname}: ${r.error}`));
    console.log("");
    console.log(`${LOG} Gợi ý:`);
    console.log('    - API key cần quyền "Zone: DNS: Edit" và "Zone: Zone: Read"');
    console.log("    - Nếu record bị conflict type: xóa record cũ trong Cloudflare dashboard rồi chạy lại");
  }
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Tạo tunnel mới + xuất file + tạo DNS
// ─────────────────────────────────────────────────────────────────

async function workflowCreateWithOutput(account, envVars) {
  const created = await createTunnel(account, envVars);
  if (!created) return;

  await workflowOutputFiles(account, created.id, created.name, created.tunnelSecret, created.accountTag, envVars);

  const doDns = await confirm("\n  Tạo DNS records (CNAME) cho tunnel này ngay bây giờ?", true);
  if (doDns) {
    await workflowManageDns(account, envVars);
  }
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Chọn tunnel hiện có → xuất credentials + config
// ─────────────────────────────────────────────────────────────────

async function workflowExistingTunnel(account, envVars) {
  const tunnelList = await listTunnels(account);
  if (tunnelList.length === 0) return;

  const envTunnelId = envVars["CLOUDFLARED_TUNNEL_ID"];
  const envTunnelName = envVars["CLOUDFLARED_TUNNEL_NAME"];

  let selectedTunnel = null;

  if (envTunnelId) {
    const found = tunnelList.find((t) => t.id === envTunnelId.trim());
    if (found) {
      console.log(`${LOG} Phát hiện CLOUDFLARED_TUNNEL_ID = ${envTunnelId} → tunnel: ${found.name}`);
      const useEnv = await confirm("  Dùng tunnel này?", true);
      if (useEnv) selectedTunnel = found;
    }
  } else if (envTunnelName) {
    const found = tunnelList.find((t) => t.name === envTunnelName.trim());
    if (found) {
      console.log(`${LOG} Phát hiện CLOUDFLARED_TUNNEL_NAME = ${envTunnelName} → id: ${found.id}`);
      const useEnv = await confirm("  Dùng tunnel này?", true);
      if (useEnv) selectedTunnel = found;
    }
  }

  if (!selectedTunnel) {
    const menuItems = [...tunnelList.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` })), { label: "✏  Nhập Tunnel ID thủ công" }];

    const idx = await selectMenu("Chọn tunnel để xuất credentials + config", menuItems);
    if (idx === -1) return;

    if (idx === tunnelList.length) {
      const tunnelIdInput = await ask("  Tunnel ID (UUID)");
      const tunnelNameInput = await ask("  Tên tunnel (để đặt tên file output)");
      if (!tunnelIdInput) {
        console.log("  Hủy.");
        return;
      }
      selectedTunnel = { id: tunnelIdInput.trim(), name: tunnelNameInput || tunnelIdInput };
    } else {
      selectedTunnel = tunnelList[idx];
    }
  }

  let tunnelSecret;
  const envSecret = envVars["CLOUDFLARED_TUNNEL_SECRET"];

  if (envSecret && envSecret.trim()) {
    console.log(`${LOG} Phát hiện CLOUDFLARED_TUNNEL_SECRET trong env.`);
    const useEnvSecret = await confirm("  Dùng secret từ env?", true);
    if (useEnvSecret) {
      tunnelSecret = envSecret.trim();
    }
  }

  if (!tunnelSecret) {
    const secretSourceIdx = await selectMenu("Nguồn Tunnel Secret", [
      { label: "Sinh secret mới ngẫu nhiên (32 bytes)" },
      { label: "Nhập secret thủ công (base64)" },
    ]);
    if (secretSourceIdx === -1) return;

    if (secretSourceIdx === 0) {
      tunnelSecret = crypto.randomBytes(32).toString("base64");
      console.log(`${LOG} Secret mới: ${tunnelSecret.slice(0, 12)}...`);
    } else {
      tunnelSecret = await ask("  Tunnel Secret (base64)");
      if (!tunnelSecret) {
        console.log("  Hủy.");
        return;
      }
    }
  }

  await workflowOutputFiles(account, selectedTunnel.id, selectedTunnel.name, tunnelSecret, account.accountid, envVars);
}

// ─────────────────────────────────────────────────────────────────
// HELPER CHUNG: Chọn ingress rules + ghi credentials.json + config.yml
// ─────────────────────────────────────────────────────────────────

async function workflowOutputFiles(account, tunnelId, tunnelName, tunnelSecret, accountTag, envVars) {
  console.log(`\n${LOG} Chuẩn bị xuất file cho tunnel: ${tunnelName} (${tunnelId})`);
  console.log("");

  // Chọn nguồn ingress rules — menu 3 lựa chọn
  const ingressRules = await selectIngressSource(envVars);

  if (!ingressRules || ingressRules.length === 0) {
    console.log(`${LOG} Không có ingress rule nào. Hủy.`);
    return;
  }

  const defaultOutputDir = process.cwd();
  const outputDirRaw = await ask(`  Thư mục output [${defaultOutputDir}]`);
  const outputDir = outputDirRaw ? path.resolve(outputDirRaw) : defaultOutputDir;

  fs.mkdirSync(outputDir, { recursive: true });

  const safeSlug = (tunnelName || tunnelId).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const credFile = path.join(outputDir, `${safeSlug}-credentials.json`);
  const configFile = path.join(outputDir, `${safeSlug}-config.yml`);

  console.log("\n  Tóm tắt sẽ xuất:");
  console.log(`    Tunnel ID    : ${tunnelId}`);
  console.log(`    Account Tag  : ${accountTag}`);
  console.log(`    Tunnel Secret: ${tunnelSecret.slice(0, 8)}... (${tunnelSecret.length} ký tự)`);
  console.log("    Ingress rules:");
  ingressRules.forEach((r) => console.log(`      ${r.hostname} → ${r.service}`));
  console.log(`    credentials.json → ${credFile}`);
  console.log(`    config.yml       → ${configFile}`);
  console.log("");

  const ok = await confirm("  Xác nhận ghi file?", true);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  const credContent = buildCredentialsJson(tunnelId, tunnelSecret, accountTag);
  const configContent = buildConfigYml(tunnelId, ingressRules);

  fs.writeFileSync(credFile, credContent, "utf8");
  console.log(`${LOG} ✓ Đã ghi: ${credFile}`);

  fs.writeFileSync(configFile, configContent, "utf8");
  console.log(`${LOG} ✓ Đã ghi: ${configFile}`);

  console.log("");
  console.log(`${LOG} ──── Nội dung credentials.json ────`);
  console.log(credContent);
  console.log(`${LOG} ──── Nội dung config.yml ────`);
  console.log(configContent);
  console.log(`${LOG} Hướng dẫn deploy Docker:`);
  console.log(`  1. Copy ${path.basename(credFile)} → container tại /etc/cloudflared/credentials.json`);
  console.log(`  2. Copy ${path.basename(configFile)} → container tại /etc/cloudflared/config.yml`);
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
    const hostname = await ask(`  Hostname ${n} (VD: app.yourdomain.com)`);
    if (!hostname) break;

    const service = await ask(`  Service ${n} (VD: http://my-service:8080)`);
    if (!service) break;

    rules.push({ hostname: hostname.trim(), service: service.trim() });

    if (rules.length >= 20) break;
    addMore = await confirm("  Thêm rule tiếp theo?", false);
  }

  return rules;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Nhập hostname thủ công
// ─────────────────────────────────────────────────────────────────

async function askHostnamesManual() {
  const hostnames = [];
  let addMore = true;

  while (addMore) {
    const n = hostnames.length + 1;
    const hostname = await ask(`  Hostname ${n} (VD: app.yourdomain.com)`);
    if (!hostname) break;

    hostnames.push(hostname.trim());
    if (hostnames.length >= 20) break;

    addMore = await confirm("  Thêm hostname tiếp theo?", false);
  }

  return hostnames;
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Xóa tunnel
// ─────────────────────────────────────────────────────────────────

async function deleteTunnel(account) {
  const tunnelList = await listTunnels(account);
  if (tunnelList.length === 0) return;

  const idx = await selectMenu(
    "Chọn tunnel để xóa",
    tunnelList.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` })),
  );
  if (idx === -1) return;

  const t = tunnelList[idx];
  const ok = await confirm(`  Xác nhận xóa tunnel "${t.name}" (${t.id})?`, false);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  const res = await cloudflaredRequest({
    method: "DELETE",
    path: `/accounts/${account.accountid}/cfd_tunnel/${t.id}?force=true`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Xóa thất bại: ${extractError(res)}`);
    return;
  }

  console.log(`${LOG} ✓ Đã xóa tunnel: ${t.name}`);
}

// ─────────────────────────────────────────────────────────────────
// NGHIỆP VỤ: Lấy tunnel run token
// ─────────────────────────────────────────────────────────────────

async function showTunnelToken(account) {
  const tunnelList = await listTunnels(account);
  if (tunnelList.length === 0) return;

  const idx = await selectMenu(
    "Chọn tunnel để lấy run token",
    tunnelList.map((t) => ({ label: `${t.name.padEnd(35)} ${t.id}` })),
  );
  if (idx === -1) return;

  const t = tunnelList[idx];
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
// MENU chính — nhận envVars từ index.js
// ─────────────────────────────────────────────────────────────────

async function run(account, envVars = {}) {
  while (true) {
    const idx = await selectMenu(`Cloudflare Tunnels — ${account.label} (${account.accountid})`, [
      { label: "Xem danh sách tunnels" },
      { label: "Tạo tunnel mới + xuất credentials.json + config.yml" },
      { label: "Chọn tunnel hiện có → xuất credentials.json + config.yml" },
      { label: "Tạo / cập nhật DNS records (CNAME) cho tunnel" },
      { label: "Lấy tunnel run token (cloudflared tunnel run --token)" },
      { label: "Xóa tunnel" },
      { label: "Quản lý Notification Policies (Tunnel Health Alert → email)" },
    ]);

    if (idx === -1) break;

    if (idx === 0) await listTunnels(account);
    if (idx === 1) await workflowCreateWithOutput(account, envVars);
    if (idx === 2) await workflowExistingTunnel(account, envVars);
    if (idx === 3) await workflowManageDns(account, envVars);
    if (idx === 4) await showTunnelToken(account);
    if (idx === 5) await deleteTunnel(account);
    if (idx === 6) await runAlertMenu(account);
  }
}

module.exports = { run };
