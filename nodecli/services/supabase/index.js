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
const DEFAULT_REGION = 'ap-southeast-1';
const REGION_CODES = new Set(REGIONS.map((r) => r.code));

function normalizeRegion(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return DEFAULT_REGION;

  if (REGION_CODES.has(raw)) return raw;

  const codeMatch = raw.match(/[a-z]{2}-[a-z-]+-\d/);
  if (codeMatch && REGION_CODES.has(codeMatch[0])) {
    return codeMatch[0];
  }

  if (
    raw === 'southeast' ||
    raw === 'south-east' ||
    raw === 'sea' ||
    raw === 'ap-southeast' ||
    raw === 'ap-southeast-1-singapore' ||
    raw === 'singapore'
  ) {
    return DEFAULT_REGION;
  }

  return DEFAULT_REGION;
}

function resolveDefaultSupabaseConfigPath() {
  return path.resolve(__dirname, '..', '..', '.supabase-o-config');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeEmailSlug(email) {
  return (email || 'unknown')
    .replace(/@/g, '-at-')
    .replace(/\+/g, '-plus-')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeProject(project, fallbackInputs) {
  const p = project || {};
  return {
    id: p.id || p.ref || fallbackInputs.projectName,
    ref: p.ref || p.id || fallbackInputs.projectName,
    name: p.name || fallbackInputs.projectName,
    region: normalizeRegion(p.region || fallbackInputs.region),
    status: p.status || 'UNKNOWN',
    organization_id: p.organization_id || fallbackInputs.orgId || '',
  };
}

function buildSnapshot(account, project, s3Creds, dbInfo, inputs) {
  return {
    _meta: {
      email: account.email,
      projectName: project.name || inputs.projectName,
      projectRef: project.ref,
      region: normalizeRegion(project.region || inputs.region),
    },
    s3: {
      accessKeyId: s3Creds.accessKeyId || null,
      secretAccessKey: s3Creds.secretAccessKey || null,
      bucketName: s3Creds.bucketName || inputs.bucketName,
      bucketCreatedAt: s3Creds.bucketCreatedAt || null,
      endpoint: s3Creds.endpoint || null,
      region: normalizeRegion(s3Creds.region || inputs.region),
      projectRef: s3Creds.projectRef || project.ref,
      bucketPublic: typeof s3Creds.bucketPublic === 'boolean' ? s3Creds.bucketPublic : false,
    },
    postgres: {
      direct: dbInfo.direct || null,
      transactionPooler: dbInfo.transactionPooler || null,
      sessionPooler: dbInfo.sessionPooler || null,
    },
    api: dbInfo.api || {},
    envFormats: dbInfo.envFormats || {},
  };
}

function detectMissing(snapshot) {
  const missing = [];

  if (!snapshot || !snapshot.s3 || !snapshot.s3.accessKeyId || !snapshot.s3.secretAccessKey) {
    missing.push('S3 Access Key');
  }
  if (!snapshot || !snapshot.s3 || !snapshot.s3.bucketCreatedAt) {
    missing.push('Bucket metadata (bucketCreatedAt)');
  }
  if (!snapshot || !snapshot.api || !snapshot.api.jwtSecret) {
    missing.push('JWT secret');
  }

  return missing;
}

function printExistingAndMissing(snapshot) {
  const missing = detectMissing(snapshot);
  const has = (v) => !!v;

  console.log(`\n${LOG} Trạng thái dữ liệu hiện có:`);
  console.log(`  ${has(snapshot && snapshot._meta && snapshot._meta.projectRef) ? '✓' : '✗'} projectRef          : ${(snapshot && snapshot._meta && snapshot._meta.projectRef) || '(thiếu)'}`);
  console.log(`  ${has(snapshot && snapshot.s3 && snapshot.s3.accessKeyId) ? '✓' : '✗'} s3.accessKeyId      : ${(snapshot && snapshot.s3 && snapshot.s3.accessKeyId) ? 'đã có' : 'thiếu'}`);
  console.log(`  ${has(snapshot && snapshot.s3 && snapshot.s3.secretAccessKey) ? '✓' : '✗'} s3.secretAccessKey  : ${(snapshot && snapshot.s3 && snapshot.s3.secretAccessKey) ? 'đã có' : 'thiếu'}`);
  console.log(`  ${has(snapshot && snapshot.s3 && snapshot.s3.bucketName) ? '✓' : '✗'} s3.bucketName       : ${(snapshot && snapshot.s3 && snapshot.s3.bucketName) || '(thiếu)'}`);
  console.log(`  ${has(snapshot && snapshot.s3 && snapshot.s3.bucketCreatedAt) ? '✓' : '✗'} s3.bucketCreatedAt  : ${(snapshot && snapshot.s3 && snapshot.s3.bucketCreatedAt) || '(thiếu)'}`);
  console.log(`  ${has(snapshot && snapshot.api && snapshot.api.jwtSecret) ? '✓' : '✗'} api.jwtSecret       : ${(snapshot && snapshot.api && snapshot.api.jwtSecret) ? 'đã có' : 'thiếu'}`);

  if (missing.length === 0) {
    console.log(`${LOG} Không có thông tin nào bị thiếu.`);
  } else {
    console.log(`${LOG} Cần bổ sung: ${missing.join(', ')}`);
  }

  return missing;
}

function getOutputPathsForAccount(account) {
  const fileName = `supabase-${safeEmailSlug(account.email)}.json`;
  const paths = [];

  const cfgPath = resolveSupabaseConfigPath();
  if (cfgPath) {
    paths.push(path.join(path.dirname(cfgPath), '.supabase-data', fileName));
  }

  paths.push(path.join(process.cwd(), fileName));
  return paths;
}

function readLatestOutput(account) {
  const candidates = getOutputPathsForAccount(account)
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ path: p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (candidates.length === 0) return null;

  const chosen = candidates[0];
  try {
    const raw = fs.readFileSync(chosen.path, 'utf8');
    const data = JSON.parse(raw);
    return { path: chosen.path, data };
  } catch (e) {
    console.log(`${LOG} ⚠ Không đọc được output JSON tại ${chosen.path}: ${e.message}`);
    return null;
  }
}

function saveDefaultOrgIdToConfig(sectionLabel, orgId) {
  const cfgPath = resolveSupabaseConfigPath();
  if (!cfgPath) return;
  if (!sectionLabel || !orgId) return;

  const raw = fs.readFileSync(cfgPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = [];
  let inSection = false;
  let wrote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const secMatch = trimmed.match(/^\[(.+)\]$/);

    if (secMatch) {
      if (inSection && !wrote) {
        out.push(`defaultOrgId=${orgId}`);
        wrote = true;
      }
      inSection = secMatch[1] === sectionLabel;
    }

    if (inSection && trimmed.startsWith('defaultOrgId=')) {
      out.push(`defaultOrgId=${orgId}`);
      wrote = true;
      continue;
    }

    out.push(line);
  }

  if (inSection && !wrote) {
    out.push(`defaultOrgId=${orgId}`);
  }

  fs.writeFileSync(cfgPath, out.join('\n'), 'utf8');
  console.log(`${LOG} ✓ Đã cập nhật defaultOrgId=${orgId} vào config.`);
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
  const defaultRegionCode = normalizeRegion(envVars.SUPABASE_REGION);

  console.log(`\n${LOG} Account: ${account.label} (${account.email})`);

  const projectName = await ask('  Tên project', defaultProjectName);
  const bucketName = await ask('  Tên bucket', defaultBucketName);
  const dbPassword = await ask('  DB Password', defaultDbPassword);
  const orgId = await ask('  Org ID (Enter để tự detect)', defaultOrgId);

  const defaultRegionIdx = REGIONS.findIndex((r) => r.code === defaultRegionCode);
  const regionIdx = await selectMenu('Chọn region', REGIONS.map((r) => ({ label: r.label })));
  const region = regionIdx === -1
    ? REGIONS[defaultRegionIdx >= 0 ? defaultRegionIdx : 0].code
    : REGIONS[regionIdx].code;

  return { projectName, bucketName, dbPassword, orgId, region: normalizeRegion(region) };
}

function showSummary(account, inputs) {
  const maskPass = (s) => (s ? '******* (có giá trị)' : '(trống)');
  const safeEmail = safeEmailSlug(account.email);
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

async function resolveProjectForRead(account, inputs, preferredRef = '') {
  const explicitRef = String(preferredRef || '').trim();
  const envRef = (process.env.SUPABASE_PROJECT_REF || '').trim();
  const ref = explicitRef || envRef;

  if (ref) {
    console.log(`\n${LOG} Dùng projectRef=${ref} để lấy thông tin project.`);
    const byRefRes = await supabaseRequest({
      method: 'GET',
      path: `/projects/${ref}`,
      token: account.accessToken,
    });

    if (byRefRes.ok && byRefRes.data) {
      return normalizeProject(byRefRes.data, inputs);
    }

    console.log(`${LOG} ⚠ Không lấy được project theo ref (status ${byRefRes.status}). Sẽ resolve qua danh sách projects.`);
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

  if (byName) candidates = candidates.filter((p) => p.name === byName);
  if (byOrg) candidates = candidates.filter((p) => p.organization_id === byOrg);

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

async function runOnce(account, inputs, opts = {}) {
  const previous = opts.previous || null;
  const preferredRef = opts.preferredRef || '';
  const envRef = (process.env.SUPABASE_PROJECT_REF || '').trim();

  let project;
  let org = null;

  if (envRef || preferredRef) {
    const ref = preferredRef || envRef;
    console.log(`\n${LOG} Phát hiện projectRef = ${ref} -> bỏ qua bước tạo project.`);
    project = await resolveProjectForRead(account, inputs, ref);
  } else {
    org = await projectSetup.resolveOrg(account, inputs);
    project = await projectSetup.resolveProject(account, inputs, org);
  }

  const s3Creds = await storageSetup.resolveS3(account, project, inputs, {
    previous: previous && previous.s3 ? previous.s3 : null,
  });

  const dbInfo = await databaseInfo.fetchAll(account, project, inputs, {
    previous: previous || null,
  });

  await outputWriter.write(account, project, s3Creds, dbInfo, inputs);

  const snapshot = buildSnapshot(account, project, s3Creds, dbInfo, inputs);
  return {
    org,
    project,
    s3Creds,
    dbInfo,
    snapshot,
    missing: detectMissing(snapshot),
  };
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

async function rerunMissingFromLatestOutput(account, currentInputs) {
  const latest = readLatestOutput(account);
  if (!latest) {
    console.log(`${LOG} Không tìm thấy output JSON trước đó để bổ sung thông tin.`);
    return null;
  }

  console.log(`\n${LOG} Dùng output gần nhất: ${latest.path}`);
  const prev = latest.data;
  const missing = printExistingAndMissing(prev);

  if (missing.length === 0) {
    const force = await confirm('  Không có thông tin thiếu. Vẫn chạy bổ sung để refresh?', false);
    if (!force) return null;
  } else {
    const ok = await confirm('  Chạy bổ sung thông tin còn thiếu ngay bây giờ?', true);
    if (!ok) return null;
  }

  const supplementInputs = {
    projectName: (prev._meta && prev._meta.projectName) || currentInputs.projectName,
    bucketName: (prev.s3 && prev.s3.bucketName) || currentInputs.bucketName,
    dbPassword:
      (prev.postgres && prev.postgres.direct && prev.postgres.direct.password) ||
      currentInputs.dbPassword ||
      '',
    orgId: currentInputs.orgId || '',
    region: normalizeRegion((prev._meta && prev._meta.region) || currentInputs.region),
  };

  const preferredRef = (prev._meta && prev._meta.projectRef) || '';
  const result = await runOnce(account, supplementInputs, {
    previous: prev,
    preferredRef,
  });

  const missingAfter = printExistingAndMissing(result.snapshot);
  if (missingAfter.length > 0) {
    console.log(`${LOG} Sau khi bổ sung vẫn còn thiếu: ${missingAfter.join(', ')}`);
  } else {
    console.log(`${LOG} ✓ Đã bổ sung đầy đủ các thông tin chính.`);
  }

  return { result, inputs: supplementInputs };
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

  const firstResult = await runOnce(account, currentInputs);

  const resolvedOrgId =
    (firstResult.org && firstResult.org.id) ||
    (firstResult.project && firstResult.project.organization_id) ||
    '';

  if (!account.defaultOrgId && resolvedOrgId && !account._loadedFromEnv) {
    const saveOrg = await confirm('  Cập nhật defaultOrgId vào `.supabase-o-config`?', true);
    if (saveOrg) {
      saveDefaultOrgIdToConfig(account.label, resolvedOrgId);
      account.defaultOrgId = resolvedOrgId;
    }
  }

  if (account._loadedFromEnv && resolvedOrgId && !account.defaultOrgId) {
    account.defaultOrgId = resolvedOrgId;
  }

  if (account._loadedFromEnv) {
    const saveOk = await confirm('  Lưu thông tin này vào `.supabase-o-config`?', false);
    if (saveOk) {
      saveEnvAccountToConfig(account);
    }
  }

  if (firstResult.missing.length > 0) {
    console.log(`\n${LOG} Phát hiện dữ liệu còn thiếu: ${firstResult.missing.join(', ')}`);
    const autoFill = await confirm('  Chạy bổ sung thông tin còn thiếu ngay?', true);
    if (autoFill) {
      const supplemented = await rerunMissingFromLatestOutput(account, currentInputs);
      if (supplemented && supplemented.inputs) {
        currentInputs = supplemented.inputs;
      }
    }
  }

  while (true) {
    const idx = await selectMenu(
      `Supabase — ${account.email}`,
      [
        { label: 'Chạy lại với account này (inputs khác)' },
        { label: 'Chỉ lấy lại thông tin DB' },
        { label: 'Chỉ lấy lại S3 credentials' },
        { label: 'Bổ sung thông tin còn thiếu (dựa trên output JSON gần nhất)' },
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
      const latest = readLatestOutput(account);
      const prev = latest ? latest.data : null;
      const preferredRef = prev && prev._meta ? prev._meta.projectRef : '';
      const resolvedProject = await resolveProjectForRead(account, currentInputs, preferredRef);
      await databaseInfo.fetchAll(account, resolvedProject, currentInputs, { previous: prev || {} });
      console.log(`\n${LOG} DB info đã tải. Xem log phía trên.`);
    }

    if (idx === 2) {
      const latest = readLatestOutput(account);
      const prev = latest ? latest.data : null;
      const preferredRef = prev && prev._meta ? prev._meta.projectRef : '';
      const resolvedProject = await resolveProjectForRead(account, currentInputs, preferredRef);
      await storageSetup.resolveS3(account, resolvedProject, currentInputs, {
        previous: prev && prev.s3 ? prev.s3 : null,
      });
      console.log(`\n${LOG} S3 credentials đã tải. Xem log phía trên.`);
    }

    if (idx === 3) {
      const supplemented = await rerunMissingFromLatestOutput(account, currentInputs);
      if (supplemented && supplemented.inputs) {
        currentInputs = supplemented.inputs;
      }
    }
  }
}

module.exports = { run };
