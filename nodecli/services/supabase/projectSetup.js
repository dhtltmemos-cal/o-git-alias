// services/supabase/projectSetup.js — Resolve org, tạo/chọn project, polling

'use strict';

const { supabaseRequest } = require('../../lib/supabaseApi');
const { selectMenu, confirm } = require('../../lib/prompt');

const LOG = '[supabase]';

// ─────────────────────────────────────────────────────────────────
// RESOLVE ORG
// ─────────────────────────────────────────────────────────────────

/**
 * Lấy danh sách organizations và chọn org phù hợp.
 * @returns {{ id, name }}
 */
async function resolveOrg(account, inputs) {
  console.log(`\n${LOG} Bước 1: Lấy danh sách organizations`);

  const res = await supabaseRequest({
    method: 'GET',
    path:   '/organizations',
    token:  account.accessToken,
  });

  if (!res.ok) {
    throw new Error(`${LOG} Không lấy được danh sách organizations: status ${res.status}`);
  }

  const orgs = Array.isArray(res.data) ? res.data : [];
  console.log(`${LOG} Tìm thấy ${orgs.length} organization(s)`);

  if (orgs.length === 0) {
    throw new Error(`${LOG} Account không có organization nào. Vui lòng tạo org trên Supabase dashboard.`);
  }

  // Nếu inputs.orgId có giá trị → dùng luôn
  if (inputs.orgId && inputs.orgId.trim()) {
    const found = orgs.find((o) => o.id === inputs.orgId.trim());
    if (found) {
      console.log(`${LOG} Org đã chọn: ${found.name} (id=${found.id})`);
      return { id: found.id, name: found.name };
    }
    console.log(`${LOG} ⚠  Không tìm thấy org id="${inputs.orgId}" trong danh sách. Sẽ hỏi chọn.`);
  }

  // 1 org → dùng luôn
  if (orgs.length === 1) {
    const org = orgs[0];
    console.log(`${LOG} Org đã chọn (duy nhất): ${org.name} (id=${org.id})`);
    return { id: org.id, name: org.name };
  }

  // Nhiều org → cho chọn
  const idx = await selectMenu(
    `Chọn Organization (${orgs.length} org)`,
    orgs.map((o) => ({ label: `${o.name.padEnd(40)} ${o.id}` })),
  );
  if (idx === -1) throw new Error(`${LOG} Người dùng hủy chọn organization.`);

  const chosen = orgs[idx];
  console.log(`${LOG} Org đã chọn: ${chosen.name} (id=${chosen.id})`);
  return { id: chosen.id, name: chosen.name };
}

// ─────────────────────────────────────────────────────────────────
// POLLING helper
// ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollProjectReady(account, projectRef, maxRetries = 20, intervalMs = 5000) {
  console.log(`${LOG} Bước 2c: Chờ project sẵn sàng (polling /v1/projects/${projectRef})`);

  for (let i = 1; i <= maxRetries; i++) {
    const res = await supabaseRequest({
      method: 'GET',
      path:   `/projects/${projectRef}`,
      token:  account.accessToken,
    });

    const status = res.ok && res.data ? (res.data.status || 'UNKNOWN') : 'ERROR';
    console.log(`${LOG} ... polling ${i}/${maxRetries} — status: ${status}`);

    if (status === 'ACTIVE_HEALTHY') {
      console.log(`${LOG} ✓ Project sẵn sàng (ACTIVE_HEALTHY)`);
      return res.data;
    }

    if (i < maxRetries) await sleep(intervalMs);
  }

  console.log(`${LOG} ⚠  Timeout chờ project sẵn sàng. Tiếp tục với trạng thái hiện tại.`);
  return null;
}

// ─────────────────────────────────────────────────────────────────
// RESOLVE PROJECT
// ─────────────────────────────────────────────────────────────────

/**
 * Tìm project theo tên trong org hoặc tạo mới.
 * @returns {{ id, ref, name, region, status, organization_id }}
 */
async function resolveProject(account, inputs, org) {
  console.log(`\n${LOG} Bước 2: Kiểm tra project tồn tại`);

  const res = await supabaseRequest({
    method: 'GET',
    path:   '/projects',
    token:  account.accessToken,
  });

  if (!res.ok) {
    throw new Error(`${LOG} Không lấy được danh sách projects: status ${res.status}`);
  }

  const projects = Array.isArray(res.data) ? res.data : [];
  console.log(`${LOG} Tìm thấy ${projects.length} project(s) trong account`);

  // Tìm project trùng tên trong đúng org
  const existing = projects.find(
    (p) => p.name === inputs.projectName && p.organization_id === org.id,
  );

  if (existing) {
    console.log(`${LOG} ✓ Project đã tồn tại: ${existing.name} (ref=${existing.ref})`);

    if (existing.status !== 'ACTIVE_HEALTHY') {
      console.log(`${LOG} ⚠  Project status: ${existing.status}. Đang chờ ACTIVE_HEALTHY...`);
      await pollProjectReady(account, existing.ref);
    }

    return {
      id:              existing.id,
      ref:             existing.ref,
      name:            existing.name,
      region:          existing.region,
      status:          existing.status,
      organization_id: existing.organization_id,
    };
  }

  // Không tìm thấy → tạo mới
  console.log(`${LOG} Không tìm thấy project trùng tên. Sẽ tạo mới.`);
  console.log(`\n${LOG} Bước 2b: Tạo project mới`);

  const createBody = {
    name:            inputs.projectName,
    db_pass:         inputs.dbPassword,
    region:          inputs.region,
    organization_id: org.id,
    plan:            'free',
  };

  const createRes = await supabaseRequest({
    method: 'POST',
    path:   '/projects',
    body:   createBody,
    token:  account.accessToken,
  });

  if (!createRes.ok) {
    const errMsg = createRes.data && createRes.data.message
      ? createRes.data.message
      : `status ${createRes.status}`;
    throw new Error(`${LOG} Tạo project thất bại: ${errMsg}`);
  }

  const created = createRes.data;
  console.log(`${LOG} ✓ Đã tạo project: ${created.name} (ref=${created.ref})`);

  // Polling đến ACTIVE_HEALTHY
  const ready = await pollProjectReady(account, created.ref);

  return {
    id:              created.id,
    ref:             created.ref,
    name:            created.name,
    region:          created.region || inputs.region,
    status:          ready ? ready.status : created.status,
    organization_id: created.organization_id || org.id,
  };
}

module.exports = { resolveOrg, resolveProject };
