// services/cloudflared/tunnelAlerts.js — Quản lý Cloudflare Notification Policies cho tunnel health
"use strict";

const { cloudflaredRequest } = require("../../lib/cloudflaredApi");
const { ask, confirm, selectMenu } = require("../../lib/prompt");

const LOG = "[tunnel-alerts]";
const ALERT_TYPE = "tunnel_health_alert";
const DEFAULT_EMAIL = "ongtrieuhau861@gmail.com";
const DEFAULT_NAME = "Tunnel Health Alert";

function extractApiError(res) {
  if (res && Array.isArray(res.errors) && res.errors.length > 0) {
    if (res.errors.some((e) => e && (e.code === 7003 || String(e.message || "").toLowerCase().includes("not entitled")))) {
      return "API token cần quyền: Account > Notifications > Edit";
    }
    return res.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
  }
  if (res && res.status) return `status ${res.status}`;
  return "Unknown error";
}

function getPolicyEmails(policy) {
  const emailMechanisms = policy && policy.mechanisms && Array.isArray(policy.mechanisms.email) ? policy.mechanisms.email : [];
  return emailMechanisms.map((item) => item && item.id).filter(Boolean);
}

function printPoliciesTable(policies) {
  console.log("");
  console.log(`  ${"#".padEnd(4)} ${"Tên Policy".padEnd(30)} ${"Policy ID".padEnd(36)} ${"Enabled".padEnd(8)} Email`);
  console.log(`  ${"─".repeat(4)} ${"─".repeat(30)} ${"─".repeat(36)} ${"─".repeat(8)} ${"─".repeat(24)}`);

  policies.forEach((policy, idx) => {
    const emails = getPolicyEmails(policy).join(", ") || "-";
    const enabled = policy.enabled ? "✓" : "✗";
    console.log(
      `  [${String(idx + 1).padStart(1)}] ${String(policy.name || "").padEnd(30)} ${String(policy.id || "").padEnd(36)} ${enabled.padEnd(8)} ${emails}`,
    );
  });
}

async function listAlertPolicies(account) {
  console.log(`\n${LOG} Đang lấy danh sách Notification Policies...`);

  const res = await cloudflaredRequest({
    method: "GET",
    path: `/accounts/${account.accountid}/alerting/v3/policies`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Không lấy được policies: ${extractApiError(res)}`);
    return [];
  }

  const policies = Array.isArray(res.result) ? res.result.filter((item) => item && item.alert_type === ALERT_TYPE) : [];

  if (policies.length === 0) {
    console.log(`${LOG} Chưa có policy nào.`);
    return [];
  }

  printPoliciesTable(policies);
  return policies;
}

async function createAlertPolicy(account, { name, description, email }) {
  const res = await cloudflaredRequest({
    method: "POST",
    path: `/accounts/${account.accountid}/alerting/v3/policies`,
    body: {
      alert_type: ALERT_TYPE,
      name,
      description,
      enabled: true,
      mechanisms: {
        email: [{ id: email }],
      },
      filters: {},
    },
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Tạo policy thất bại: ${extractApiError(res)}`);
    return null;
  }

  const policy = res.result || null;
  console.log(`${LOG} ✓ Đã tạo policy: ${name} (id=${policy && policy.id ? policy.id : "unknown"})`);
  return policy;
}

async function deleteAlertPolicy(account, policyId, policyName) {
  const res = await cloudflaredRequest({
    method: "DELETE",
    path: `/accounts/${account.accountid}/alerting/v3/policies/${policyId}`,
    account,
  });

  if (!res.ok) {
    console.error(`${LOG} Xóa policy thất bại: ${extractApiError(res)}`);
    return false;
  }

  console.log(`${LOG} ✓ Đã xóa policy: ${policyName}`);
  return true;
}

async function handleCreatePolicy(account) {
  const email = await ask("  Email nhận thông báo", DEFAULT_EMAIL);
  if (!email) {
    console.log("  Hủy.");
    return;
  }

  const name = await ask("  Tên policy", DEFAULT_NAME);
  if (!name) {
    console.log("  Hủy.");
    return;
  }

  const description = await ask("  Mô tả (Enter để bỏ qua)", "");

  console.log("");
  console.log(`    alert_type : ${ALERT_TYPE}`);
  console.log("    trigger    : tất cả trạng thái (healthy / degraded / down)");
  console.log(`    email      : ${email}`);
  console.log(`    name       : ${name}`);
  console.log("");

  const ok = await confirm("  Xác nhận tạo?", true);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  await createAlertPolicy(account, { name, description, email });
}

async function handleDeletePolicy(account) {
  const policies = await listAlertPolicies(account);
  if (policies.length === 0) return;

  const idx = await selectMenu(
    "Chọn policy cần xóa",
    policies.map((policy) => {
      const emails = getPolicyEmails(policy).join(", ") || "-";
      return { label: `${policy.name.padEnd(30)} ${policy.id}  ${emails}` };
    }),
  );

  if (idx === -1) return;

  const selected = policies[idx];
  const ok = await confirm(`  Xác nhận xóa policy \"${selected.name}\"?`, false);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  await deleteAlertPolicy(account, selected.id, selected.name);
}

async function runAlertMenu(account) {
  while (true) {
    const idx = await selectMenu(`Tunnel Health Alert Policies — ${account.label} (${account.accountid})`, [
      { label: "Xem danh sách policies hiện có" },
      { label: "Tạo policy mới (gửi email khi tunnel thay đổi trạng thái)" },
      { label: "Xóa policy" },
    ]);

    if (idx === -1) break;
    if (idx === 0) await listAlertPolicies(account);
    if (idx === 1) await handleCreatePolicy(account);
    if (idx === 2) await handleDeletePolicy(account);
  }
}

module.exports = {
  listAlertPolicies,
  createAlertPolicy,
  deleteAlertPolicy,
  runAlertMenu,
};
