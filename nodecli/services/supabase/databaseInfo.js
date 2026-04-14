// services/supabase/databaseInfo.js — Lấy thông tin kết nối PostgreSQL và API keys

'use strict';

const { supabaseRequest } = require('../../lib/supabaseApi');

const LOG = '[supabase]';

// ─────────────────────────────────────────────────────────────────
// Build pooler host từ region
// ─────────────────────────────────────────────────────────────────

function buildPoolerHost(region) {
  // Convention của Supabase: aws-0-<region>.pooler.supabase.com
  return `aws-0-${region}.pooler.supabase.com`;
}

// ─────────────────────────────────────────────────────────────────
// FETCH ALL DATABASE INFO
// ─────────────────────────────────────────────────────────────────

/**
 * Lấy toàn bộ thông tin kết nối PostgreSQL và API keys từ Supabase.
 *
 * @returns object đầy đủ, không bỏ field nào dù null
 */
async function fetchAll(account, project, inputs) {
  // ── Bước 5: Thông tin kết nối PostgreSQL ──────────────────────────
  console.log(`\n${LOG} Bước 5: Lấy thông tin kết nối PostgreSQL`);

  // Project detail
  const projectRes = await supabaseRequest({
    method: 'GET',
    path:   `/projects/${project.ref}`,
    token:  account.accessToken,
  });

  let directHost  = `db.${project.ref}.supabase.co`;
  let directPort  = 5432;

  if (projectRes.ok && projectRes.data) {
    const d = projectRes.data;
    directHost = d.db_host || directHost;
    directPort = d.db_port || directPort;
    console.log(`${LOG} ✓ direct.host        : ${directHost}`);
    console.log(`${LOG} ✓ direct.port        : ${directPort}`);
  } else {
    console.log(`${LOG} ⚠  Không lấy được project detail, dùng hostname mặc định`);
    console.log(`${LOG} ✓ direct.host        : ${directHost} (mặc định)`);
    console.log(`${LOG} ✓ direct.port        : ${directPort} (mặc định)`);
  }

  // Pooler config
  let poolerTransactionHost = buildPoolerHost(project.region || inputs.region);
  let poolerSessionHost     = poolerTransactionHost;

  const poolerRes = await supabaseRequest({
    method: 'GET',
    path:   `/projects/${project.ref}/config/database`,
    token:  account.accessToken,
  });

  if (poolerRes.ok && poolerRes.data) {
    const p = poolerRes.data;
    if (p.db_pool_transaction_host) poolerTransactionHost = p.db_pool_transaction_host;
    if (p.db_pool_session_host)     poolerSessionHost     = p.db_pool_session_host;
    console.log(`${LOG} ✓ pooler.transaction : ${poolerTransactionHost}:6543`);
    console.log(`${LOG} ✓ pooler.session     : ${poolerSessionHost}:5432`);
  } else {
    console.log(`${LOG} ✓ pooler.transaction : ${poolerTransactionHost}:6543 (mặc định)`);
    console.log(`${LOG} ✓ pooler.session     : ${poolerSessionHost}:5432 (mặc định)`);
  }

  const dbPass    = inputs.dbPassword || '';
  const directUri = `postgresql://postgres:${dbPass}@${directHost}:${directPort}/postgres`;
  const directJdbc = `jdbc:postgresql://${directHost}:${directPort}/postgres?user=postgres&password=${dbPass}`;

  const poolerUser            = `postgres.${project.ref}`;
  const transactionUri        = `postgresql://${poolerUser}:${dbPass}@${poolerTransactionHost}:6543/postgres`;
  const sessionUri            = `postgresql://${poolerUser}:${dbPass}@${poolerSessionHost}:5432/postgres`;

  // ── Bước 6: API Keys ──────────────────────────────────────────────
  console.log(`\n${LOG} Bước 6: Lấy API keys`);

  const keysRes = await supabaseRequest({
    method: 'GET',
    path:   `/projects/${project.ref}/api-keys`,
    token:  account.accessToken,
  });

  let anonKey        = null;
  let serviceRoleKey = null;
  let publishableKey = null;

  if (keysRes.ok && Array.isArray(keysRes.data)) {
    const keys = keysRes.data;
    console.log(`${LOG} Tìm thấy ${keys.length} key(s): ${keys.map((k) => k.name).join(', ')}`);

    const anonEntry = keys.find((k) => k.name === 'anon');
    if (anonEntry) {
      anonKey = anonEntry.api_key || null;
      console.log(`${LOG} ✓ anonKey            : ${anonKey ? anonKey.slice(0, 20) + '... (truncated)' : 'null'}`);
    }

    const srEntry = keys.find((k) => k.name === 'service_role');
    if (srEntry) {
      serviceRoleKey = srEntry.api_key || null;
      console.log(`${LOG} ✓ serviceRoleKey     : ${serviceRoleKey ? serviceRoleKey.slice(0, 20) + '... (truncated)' : 'null'}`);
    }

    const pbEntry = keys.find((k) => k.name === 'publishable');
    if (pbEntry) {
      publishableKey = pbEntry.api_key || null;
    }
  } else {
    console.log(`${LOG} ⚠  Không lấy được API keys: status ${keysRes.status}`);
  }

  // ── Bước 6b: JWT Secret ───────────────────────────────────────────
  console.log(`\n${LOG} Bước 6b: Lấy JWT secret`);

  let jwtSecret = null;

  const secretsRes = await supabaseRequest({
    method: 'GET',
    path:   `/projects/${project.ref}/secrets`,
    token:  account.accessToken,
  });

  if (secretsRes.ok && Array.isArray(secretsRes.data)) {
    const jwtEntry = secretsRes.data.find(
      (s) => s.name === 'JWT_SECRET' || s.name === 'SUPABASE_JWT_SECRET',
    );
    if (jwtEntry) {
      jwtSecret = jwtEntry.value || null;
      console.log(`${LOG} ✓ jwtSecret          : ${jwtSecret ? '****** (ẩn)' : 'null'}`);
    } else {
      console.log(`${LOG} ⚠  Không tìm thấy JWT_SECRET trong danh sách secrets`);
    }
  } else if (secretsRes.status === 403) {
    console.log(`${LOG} ✗ jwtSecret          : không lấy được (403 Forbidden — cần service_role token)`);
  } else {
    console.log(`${LOG} ✗ jwtSecret          : không lấy được (status ${secretsRes.status})`);
  }

  // ── Build ENV format strings ───────────────────────────────────────
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
      host:     directHost,
      port:     directPort,
      database: 'postgres',
      user:     'postgres',
      password: dbPass,
      uri:      directUri,
      jdbcUri:  directJdbc,
      sslMode:  'require',
    },
    transactionPooler: {
      host:     poolerTransactionHost,
      port:     6543,
      database: 'postgres',
      user:     poolerUser,
      password: dbPass,
      uri:      transactionUri,
      mode:     'transaction',
      _note:    'Dùng cho serverless, short-lived connections (Next.js, Vercel, v.v.)',
    },
    sessionPooler: {
      host:     poolerSessionHost,
      port:     5432,
      database: 'postgres',
      user:     poolerUser,
      password: dbPass,
      uri:      sessionUri,
      mode:     'session',
      _note:    'Dùng cho long-lived connections (Prisma migrations, pgAdmin, v.v.)',
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
      full:   envFull,
    },
  };
}

module.exports = { fetchAll };
