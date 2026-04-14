// services/supabase/index.js — Subcommand `ocli supabase`
// Flow: load .env -> chọn account -> hỏi inputs -> confirm -> thực hiện

'use strict';

const fs = require('fs');
const path = require('path');

const {
  loadSupabaseSections,
  loadSupabaseEnv,
  slugify,
  resolveSupabaseConfigPath,
  supabaseRequest,
} = require('../../lib/supabaseApi');
const { ask, confirm, selectMenu } = require('../../lib/prompt');
const projectSetup = require('./projectSetup');
const storageSetup = require('./storageSetup');
const databaseInfo = require('./databaseInfo');
const outputWriter = require('./outputWriter');

const LOG = '[supabase]';

const REGIONS = [
  { code: 'ap-southeast-1', label: 'ap-southeast-1  (Singapore)' },
  { code: 'ap-southeast-2', label: 'ap-southeast-2  (Sydney)' },
  { code: 'ap-northeast-1', label: 'ap-northeast-1  (Tokyo)' },
  { code: 'us-east-1', label: 'us-east-1       (North Virginia)' },
  { code: 'us-west-1', label: 'us-west-1       (North California)' },
  { code: 'eu-west-1', label: 'eu-west-1       (Ireland)' },
  { code: 'eu-central-1', label: 'eu-central-1    (Frankfurt)' },
];

function resolveDefaultSupabaseConfigPath() {
  return path.resolve(__dirname, '..', '..', '.supabase-o-config');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeProject(project, fallbackInputs) {
  const p = project || {};
  return {
    id: p.id || p.ref || fallbackInputs.projectName,
    ref: p.ref || p.id || fallbackInputs.projectName,
    name: p.name || fallbackInputs.projectName,
    region: p.region || fallbackInputs.region,
    status: p.status || 'UNKNOWN',
    organization_id: p.organization_id || fallbackInputs.orgId || '',
  };
}

async function loadAccount(envVars) {
  let sections = [];
  try {
    const cfg = loadSupabaseSections();
    sections = cfg.sections;
  } catch (e) {
    const envToken = envVars.SUPABASE_ACCESS_TOKEN;
    const envEmail = envVars.SUPABASE_EMAIL;

    if (envToken && envEmail) {
      console.log(`${LOG} Dùng thông tin từ process.env (SUPABASE_EMAIL + SUPABASE_ACCESS_TOKEN)`);
      return {
        label: 'env',
        email: envEmail,
        accessToken: envToken,
        accessTokenExp: envVars.SUPABASE_ACCESS_TOKEN_EXP || '',
        defaultPassword: envVars.SUPABASE_DB_PASSWORD || '',
        defaultOrgId: envVars.SUPABASE_ORG_ID || '',
        _loadedFromEnv: true,
      };
    }

    console.error(e.message);
    console.error(`${LOG} Và không tìm thấy SUPABASE_EMAIL + SUPABASE_ACCESS_TOKEN trong process.env.`);
    console.error(`${LOG} Tạo config: cp nodecli/.supabase-o-config.example nodecli/.supabase-o-config`);
    process.exit(1);
  }

  const valid = sections.filter((s) => s.email && s.accessToken);
  if (valid.length === 0) {
    console.error(`${LOG} Các account trong .supabase-o-config đều thiếu email/accessToken.`);
    process.exit(1);
  }

  if (valid.length === 1) {
    const s = valid[0];
    const ok = await confirm(`  Dùng account: ${s.label} (${s.email})?`, true);
    if (!ok) process.exit(0);
    return s;
  }

  const idx = await selectMenu(
    'Chọn Supabase account',
    valid.map((s) => ({ label: `${s.label.padEnd(20)}  ${s.email}` })),
  );
  if (idx === -1) process.exit(0);

  const chosen = { ...valid[idx] };

  const envToken = envVars.SUPABASE_ACCESS_TOKEN;
  if (envToken && envToken !== chosen.accessToken) {
    const useEnvToken = await confirm('  Phát hiện SUPABASE_ACCESS_TOKEN trong env (khác config). Dùng từ env?', false);
    if (useEnvToken) chosen.accessToken = envToken;
  }

  return chosen;
}

async function askInputs(account, envVars) {
  const defaultSlug = slugify(account.email);
  const defaultProjectName = envVars.SUPABASE_PROJECT_NAME || `${defaultSlug}-project`;
  const defaultBucketName = envVars.SUPABASE_BUCKET_NAME || `${defaultSlug}-bucket`;
  const defaultDbPassword = envVars.SUPABASE_DB_PASSWORD || account.defaultPassword || '';
  const defaultOrgId = envVars.SUPABASE_ORG_ID || account.defaultOrgId || '';
  const defaultRegionCode = envVars.SUPABASE_REGION || 'ap-southeast-1';

  console.log(`\n${LOG} Account: ${account.label} (${account.email})`);

  const projectName = await ask('  Tên project', defaultProjectName);
  const bucketName = await ask('  Tên bucket', defaultBucketName);
  const dbPassword = await ask('  DB Password', defaultDbPassword);
  const orgId = await ask('  Org ID (Enter để tự detect)', defaultOrgId);

  const defaultRegionIdx = REGIONS.findIndex((r) => r.code === defaultRegionCode);
  const regionIdx = await selectMenu(
    'Chọn region',
    REGIONS.map((r) => ({ label: r.label })),
  );
  const region = regionIdx === -1
    ? REGIONS[defaultRegionIdx >= 0 ? defaultRegionIdx : 0].code
    : REGIONS[regionIdx].code;

  return { projectName, bucketName, dbPassword, orgId, region };
}

function showSummary(account, inputs) {
  const maskPass = (s) => (s ? '******* (có giá trị)' : '(trống)');
  const safeEmail = (account.email || 'unknown')
    .replace(/@/g, '-at-')
    .replace(/\+/g, '-plus-')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const outFile1 = `<cwd>/supabase-${safeEmail}.json`;
  const cfgPath = resolveSupabaseConfigPath();
  const outFile2 = cfgPath
    ? `${path.dirname(cfgPath)}/.supabase-data/supabase-${safeEmail}.json`
    : '(config không tìm thấy)';

  console.log('');
  console.log(`  ┌${'─'.repeat(62)}`);
  console.log('  │  Xác nhận thực hiện');
  console.log(`  ├${'─'.repeat(62)}`);
  console.log(`  │  Account      : ${account.label} (${account.email})`);
  console.log(`  │  Project name : ${inputs.projectName}`);
  console.log(`  │  Bucket name  : ${inputs.bucketName}`);
  console.log(`  │  Region       : ${inputs.region}`);
  console.log(`  │  DB Password  : ${maskPass(inputs.dbPassword)}`);
  console.log(`  │  Org ID       : ${inputs.orgId || '(lấy tự động nếu chỉ có 1 org)'}`);
  console.log('  │');
  console.log('  │  Sẽ thực hiện:');
  console.log('  │    [1] Lấy danh sách organizations');
  console.log('  │    [2] Tạo project (hoặc dùng project đã có nếu tên trùng)');
  console.log('  │    [3] Chờ project sẵn sàng (polling)');
  console.log('  │    [4] Lấy S3 credentials (tạo bucket nếu chưa có)');
  console.log('  │    [5] Lấy thông tin kết nối PostgreSQL');
  console.log('  │    [6] Lấy API keys (anon key, service_role key)');
  console.log('  │    [7] Ghi file output JSON (2 nơi)');
  console.log('  │');
  console.log('  │  Output sẽ ghi tại:');
  console.log(`  │    - ${outFile1}`);
  console.log(`  │    - ${outFile2}`);
  console.log(`  └${'─'.repeat(62)}`);
  console.log('');
}

async function resolveProjectForRead(account, inputs) {
  const envRef = (process.env.SUPABASE_PROJECT_REF || '').trim();

  if (envRef) {
    console.log(`\n${LOG} Dùng SUPABASE_PROJECT_REF=${envRef} để lấy thông tin project.`);
    const byRefRes = await supabaseRequest({
      method: 'GET',
      path: `/projects/${envRef}`,
      token: account.accessToken,
    });

    if (byRefRes.ok && byRefRes.data) {
      return normalizeProject(byRefRes.data, inputs);
    }

    console.log(`${LOG} ⚠ Không lấy được project theo SUPABASE_PROJECT_REF (status ${byRefRes.status}). Sẽ resolve qua danh sách projects.`);
  }

  console.log(`\n${LOG} Đang lấy danh sách projects để resolve project ref...`);
  const listRes = await supabaseRequest({
    method: 'GET',
    path: '/projects',
    token: account.accessToken,
  });

  if (!listRes.ok) {
    throw new Error(`${LOG} Không lấy được danh sách projects: status ${listRes.status}`);
  }

  const projects = Array.isArray(listRes.data) ? listRes.data : [];
  if (projects.length === 0) {
    throw new Error(`${LOG} Account chưa có project nào để lấy DB/S3.`);
  }

  let candidates = projects;
  const byName = (inputs.projectName || '').trim();
  const byOrg = (inputs.orgId || '').trim();

  if (byName) {
    candidates = candidates.filter((p) => p.name === byName);
  }
  if (byOrg) {
    candidates = candidates.filter((p) => p.organization_id === byOrg);
  }

  if (candidates.length === 0) {
    console.log(`${LOG} Không match theo projectName/orgId. Sẽ cho chọn từ toàn bộ project.`);
    candidates = projects;
  }

  if (candidates.length === 1) {
    const selected = normalizeProject(candidates[0], inputs);
    console.log(`${LOG} Project đã chọn: ${selected.name} (ref=${selected.ref})`);
    return selected;
  }

  const idx = await selectMenu(
    'Chọn project để lấy thông tin',
    candidates.map((p) => ({
      label: `${String(p.name || '').padEnd(24)} ref=${p.ref || p.id || '-'} org=${p.organization_id || '-'} status=${p.status || '-'}`,
    })),
  );

  if (idx === -1) {
    throw new Error(`${LOG} Người dùng hủy chọn project.`);
  }

  const selected = normalizeProject(candidates[idx], inputs);
  console.log(`${LOG} Project đã chọn: ${selected.name} (ref=${selected.ref})`);
  return selected;
}

async function runOnce(account, inputs) {
  const envRef = (process.env.SUPABASE_PROJECT_REF || '').trim();

  let project;
  if (envRef) {
    console.log(`\n${LOG} Phát hiện SUPABASE_PROJECT_REF = ${envRef} -> bỏ qua bước tạo project.`);

    const byRefRes = await supabaseRequest({
      method: 'GET',
      path: `/projects/${envRef}`,
      token: account.accessToken,
    });

    if (byRefRes.ok && byRefRes.data) {
      project = normalizeProject(byRefRes.data, inputs);
    } else {
      console.log(`${LOG} ⚠ Không lấy được project detail theo ref (status ${byRefRes.status}), dùng fallback inputs.`);
      project = {
        id: envRef,
        ref: envRef,
        name: inputs.projectName,
        region: inputs.region,
        status: 'UNKNOWN',
        organization_id: inputs.orgId || '',
      };
    }
  } else {
    const org = await projectSetup.resolveOrg(account, inputs);
    project = await projectSetup.resolveProject(account, inputs, org);
  }

  const s3Creds = await storageSetup.resolveS3(account, project, inputs);
  const dbInfo = await databaseInfo.fetchAll(account, project, inputs);
  await outputWriter.write(account, project, s3Creds, dbInfo, inputs);
}

function saveEnvAccountToConfig(account) {
  const cfgPath = resolveSupabaseConfigPath() || resolveDefaultSupabaseConfigPath();
  const email = String(account.email || '').trim();
  const accessToken = String(account.accessToken || '').trim();

  if (!email || !accessToken) {
    console.warn(`${LOG} Không đủ thông tin để lưu vào .supabase-o-config.`);
    return;
  }

  const fileExists = fs.existsSync(cfgPath);
  const raw = fileExists ? fs.readFileSync(cfgPath, 'utf8') : '';

  const emailPattern = new RegExp(`^\\s*email\\s*=\\s*${escapeRegExp(email)}\\s*$`, 'm');
  if (fileExists && emailPattern.test(raw)) {
    console.log(`${LOG} Account ${email} đã có trong config. Bỏ qua lưu.`);
    return;
  }

  let labelBase = slugify(email) || 'myaccount';
  if (labelBase === 'env') labelBase = 'myaccount';

  let label = labelBase;
  let idx = 2;
  while (new RegExp(`^\\[${escapeRegExp(label)}\\]$`, 'm').test(raw)) {
    label = `${labelBase}-${idx}`;
    idx += 1;
  }

  const block = [
    `[${label}]`,
    `email=${email}`,
    `accessToken=${accessToken}`,
    `accessTokenExp=${account.accessTokenExp || ''}`,
    `defaultPassword=${account.defaultPassword || ''}`,
    `defaultOrgId=${account.defaultOrgId || ''}`,
  ].join('\n');

  let content = raw;
  if (!fileExists) {
    content = [
      '# .supabase-o-config — Auth config cho Supabase Management API (ocli supabase)',
      '# Tạo từ .supabase-o-config.example. Không commit file này lên git.',
      '',
      block,
      '',
    ].join('\n');
  } else {
    const trimmed = raw.trimEnd();
    content = `${trimmed}\n\n${block}\n`;
  }

  fs.writeFileSync(cfgPath, content, 'utf8');
  console.log(`${LOG} ✓ Đã lưu account vào config: ${cfgPath} (section: ${label})`);
}

async function run() {
  const { vars: envVars } = loadSupabaseEnv();

  const account = await loadAccount(envVars);
  console.log(`\n${LOG} Account: ${account.label} (${account.email})`);

  let currentInputs = await askInputs(account, envVars);

  showSummary(account, currentInputs);
  const ok = await confirm('  Xác nhận tiến hành?', true);
  if (!ok) {
    console.log('  Hủy.');
    return;
  }

  await runOnce(account, currentInputs);

  if (account._loadedFromEnv) {
    const saveOk = await confirm('  Lưu thông tin này vào `.supabase-o-config`?', false);
    if (saveOk) {
      saveEnvAccountToConfig(account);
    }
  }

  while (true) {
    const idx = await selectMenu(
      `Supabase — ${account.email}`,
      [
        { label: 'Chạy lại với account này (inputs khác)' },
        { label: 'Chỉ lấy lại thông tin DB' },
        { label: 'Chỉ lấy lại S3 credentials' },
      ],
    );

    if (idx === -1) break;

    if (idx === 0) {
      const newInputs = await askInputs(account, envVars);
      showSummary(account, newInputs);
      const ok2 = await confirm('  Xác nhận tiến hành?', true);
      if (ok2) {
        await runOnce(account, newInputs);
        currentInputs = newInputs;
      }
    }

    if (idx === 1) {
      const resolvedProject = await resolveProjectForRead(account, currentInputs);
      await databaseInfo.fetchAll(account, resolvedProject, currentInputs);
      console.log(`\n${LOG} DB info đã tải. Xem log phía trên.`);
    }

    if (idx === 2) {
      const resolvedProject = await resolveProjectForRead(account, currentInputs);
      await storageSetup.resolveS3(account, resolvedProject, currentInputs);
      console.log(`\n${LOG} S3 credentials đã tải. Xem log phía trên.`);
    }
  }
}

module.exports = { run };
