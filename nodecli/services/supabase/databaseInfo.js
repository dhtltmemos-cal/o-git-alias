// services/supabase/databaseInfo.js — Lấy thông tin kết nối PostgreSQL và API keys

'use strict';

const { supabaseRequest } = require('../../lib/supabaseApi');
const { ask, confirm } = require('../../lib/prompt');

const LOG = '[supabase]';

function buildPoolerHost(region) {
  return `aws-0-${region}.pooler.supabase.com`;
}

function nonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function findJwtSecret(secrets) {
  if (!Array.isArray(secrets)) return null;
  const entry = secrets.find((s) => s && (s.name === 'JWT_SECRET' || s.name === 'SUPABASE_JWT_SECRET'));
  if (!entry) return null;
  return nonEmptyString(entry.value) || null;
}

async function fetchJwtSecretNoRetry(account, projectRef, previousJwtSecret, interactive) {
  console.log(`\n${LOG} Bước 6b: Lấy JWT secret`);
  const secretsRes = await supabaseRequest({
    method: 'GET',
    path: `/projects/${projectRef}/secrets`,
    token: account.accessToken,
  });

  if (secretsRes.ok && Array.isArray(secretsRes.data)) {
    const jwtSecret = findJwtSecret(secretsRes.data);
    if (jwtSecret) {
      console.log(`${LOG} ✓ jwtSecret          : ****** (ẩn)`);
      return jwtSecret;
    }

    console.log(`${LOG} ⚠ Không tìm thấy JWT_SECRET trong danh sách secrets`);
  } else if (secretsRes.status === 403) {
    console.log(`${LOG} ✗ jwtSecret          : không lấy được (403 Forbidden — cần quyền secrets)`);
  } else {
    console.log(`${LOG} ✗ jwtSecret          : không lấy được (status ${secretsRes.status})`);
  }

  const dashboardUrl = `https://supabase.com/dashboard/project/${projectRef}/settings/api`;
  console.log(`${LOG} Mở Dashboard để lấy JWT secret:`);
  console.log(`  ${dashboardUrl}`);

  if (interactive) {
    const ok = await confirm('  Bạn muốn nhập tay JWT secret ngay bây giờ?', false);
    if (ok) {
      const manual = await ask('  Nhập JWT secret', previousJwtSecret || '');
      const value = nonEmptyString(manual);
      if (value) {
        console.log(`${LOG} ✓ Đã nhận JWT secret nhập tay.`);
        return value;
      }
    }
  }

  if (previousJwtSecret) {
    console.log(`${LOG} ✓ Giữ lại JWT secret từ dữ liệu cũ.`);
  }
  return previousJwtSecret || null;
}

async function fetchAll(account, project, inputs, opts = {}) {
  const previous = opts.previous || {};
  const previousPostgres = previous.postgres || {};
  const previousApi = previous.api || {};
  const interactive = opts.interactive !== false;

  console.log(`\n${LOG} Bước 5: Lấy thông tin kết nối PostgreSQL`);

  const projectRes = await supabaseRequest({
    method: 'GET',
    path: `/projects/${project.ref}`,
    token: account.accessToken,
  });

  let directHost = `db.${project.ref}.supabase.co`;
  let directPort = 5432;

  if (projectRes.ok && projectRes.data) {
    const d = projectRes.data;
    directHost = d.db_host || directHost;
    directPort = d.db_port || directPort;
    console.log(`${LOG} ✓ direct.host        : ${directHost}`);
    console.log(`${LOG} ✓ direct.port        : ${directPort}`);
  } else {
    const prevDirect = previousPostgres.direct || {};
    directHost = prevDirect.host || directHost;
    directPort = prevDirect.port || directPort;
    console.log(`${LOG} ⚠ Không lấy được project detail, dùng fallback từ dữ liệu hiện có`);
    console.log(`${LOG} ✓ direct.host        : ${directHost}`);
    console.log(`${LOG} ✓ direct.port        : ${directPort}`);
  }

  let poolerTransactionHost = buildPoolerHost(project.region || inputs.region);
  let poolerSessionHost = poolerTransactionHost;

  const poolerRes = await supabaseRequest({
    method: 'GET',
    path: `/projects/${project.ref}/config/database`,
    token: account.accessToken,
  });

  if (poolerRes.ok && poolerRes.data) {
    const p = poolerRes.data;
    if (p.db_pool_transaction_host) poolerTransactionHost = p.db_pool_transaction_host;
    if (p.db_pool_session_host) poolerSessionHost = p.db_pool_session_host;
    console.log(`${LOG} ✓ pooler.transaction : ${poolerTransactionHost}:6543`);
    console.log(`${LOG} ✓ pooler.session     : ${poolerSessionHost}:5432`);
  } else {
    const prevTxnHost = previousPostgres.transactionPooler && previousPostgres.transactionPooler.host;
    const prevSessionHost = previousPostgres.sessionPooler && previousPostgres.sessionPooler.host;
    poolerTransactionHost = prevTxnHost || poolerTransactionHost;
    poolerSessionHost = prevSessionHost || poolerSessionHost;
    console.log(`${LOG} ✓ pooler.transaction : ${poolerTransactionHost}:6543 (fallback)`);
    console.log(`${LOG} ✓ pooler.session     : ${poolerSessionHost}:5432 (fallback)`);
  }

  const dbPass = inputs.dbPassword || (previousPostgres.direct && previousPostgres.direct.password) || '';
  const directUri = `postgresql://postgres:${dbPass}@${directHost}:${directPort}/postgres`;
  const directJdbc = `jdbc:postgresql://${directHost}:${directPort}/postgres?user=postgres&password=${dbPass}`;

  const poolerUser = `postgres.${project.ref}`;
  const transactionUri = `postgresql://${poolerUser}:${dbPass}@${poolerTransactionHost}:6543/postgres`;
  const sessionUri = `postgresql://${poolerUser}:${dbPass}@${poolerSessionHost}:5432/postgres`;

  console.log(`\n${LOG} Bước 6: Lấy API keys`);

  let anonKey = previousApi.anonKey || null;
  let serviceRoleKey = previousApi.serviceRoleKey || null;
  let publishableKey = previousApi.publishableKey || null;

  const keysRes = await supabaseRequest({
    method: 'GET',
    path: `/projects/${project.ref}/api-keys`,
    token: account.accessToken,
  });

  if (keysRes.ok && Array.isArray(keysRes.data)) {
    const keys = keysRes.data;
    console.log(`${LOG} Tìm thấy ${keys.length} key(s): ${keys.map((k) => k.name).join(', ')}`);

    const anonEntry = keys.find((k) => k.name === 'anon');
    if (anonEntry && anonEntry.api_key) {
      anonKey = anonEntry.api_key;
      console.log(`${LOG} ✓ anonKey            : ${anonKey.slice(0, 20)}... (truncated)`);
    }

    const srEntry = keys.find((k) => k.name === 'service_role');
    if (srEntry && srEntry.api_key) {
      serviceRoleKey = srEntry.api_key;
      console.log(`${LOG} ✓ serviceRoleKey     : ${serviceRoleKey.slice(0, 20)}... (truncated)`);
    }

    const pbEntry = keys.find((k) => k.name === 'publishable' || k.name === 'default_publishable');
    if (pbEntry && pbEntry.api_key) {
      publishableKey = pbEntry.api_key;
    }
  } else {
    console.log(`${LOG} ⚠ Không lấy được API keys: status ${keysRes.status}`);
    if (anonKey || serviceRoleKey || publishableKey) {
      console.log(`${LOG} ✓ Giữ lại API keys từ dữ liệu cũ.`);
    }
  }

  const jwtSecret = await fetchJwtSecretNoRetry(account, project.ref, previousApi.jwtSecret || null, interactive);

  const projectUrl = `https://${project.ref}.supabase.co`;

  const envNextjs = [
    `NEXT_PUBLIC_SUPABASE_URL=${projectUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey || ''}`,
  ].join('\n');

  const envPrisma = [
    `DATABASE_URL=${transactionUri}`,
    `DIRECT_URL=${directUri}`,
  ].join('\n');

  const envFull = [
    '# Supabase',
    `NEXT_PUBLIC_SUPABASE_URL=${projectUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey || ''}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey || ''}`,
    jwtSecret ? `SUPABASE_JWT_SECRET=${jwtSecret}` : '# SUPABASE_JWT_SECRET=(không lấy được)',
    '',
    '# PostgreSQL',
    `DATABASE_URL=${transactionUri}`,
    `DIRECT_URL=${directUri}`,
    `SESSION_POOL_URL=${sessionUri}`,
  ].join('\n');

  return {
    direct: {
      host: directHost,
      port: directPort,
      database: 'postgres',
      user: 'postgres',
      password: dbPass,
      uri: directUri,
      jdbcUri: directJdbc,
      sslMode: 'require',
    },
    transactionPooler: {
      host: poolerTransactionHost,
      port: 6543,
      database: 'postgres',
      user: poolerUser,
      password: dbPass,
      uri: transactionUri,
      mode: 'transaction',
      _note: 'Dùng cho serverless, short-lived connections (Next.js, Vercel, v.v.)',
    },
    sessionPooler: {
      host: poolerSessionHost,
      port: 5432,
      database: 'postgres',
      user: poolerUser,
      password: dbPass,
      uri: sessionUri,
      mode: 'session',
      _note: 'Dùng cho long-lived connections (Prisma migrations, pgAdmin, v.v.)',
    },
    api: {
      projectUrl,
      anonKey,
      serviceRoleKey,
      jwtSecret,
      publishableKey,
    },
    envFormats: {
      nextjs: envNextjs,
      prisma: envPrisma,
      full: envFull,
    },
  };
}

module.exports = { fetchAll };
