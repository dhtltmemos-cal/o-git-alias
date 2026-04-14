// services/supabase/outputWriter.js — Tổng hợp JSON output và ghi file

'use strict';

const fs   = require('fs');
const path = require('path');
const { resolveSupabaseConfigPath } = require('../../lib/supabaseApi');

const LOG = '[supabase:output]';

// ─────────────────────────────────────────────────────────────────
// HELPER: safe email string cho tên file
// ─────────────────────────────────────────────────────────────────

function safeEmailSlug(email) {
  return (email || 'unknown')
    .replace(/@/g, '-at-')
    .replace(/\+/g, '-plus-')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ─────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────

/**
 * Tổng hợp JSON output và ghi file tại 2 nơi.
 */
async function write(account, project, s3Creds, dbInfo, inputs) {
  console.log(`\n${LOG} Ghi file output...`);

  // ── Tổng hợp JSON ────────────────────────────────────────────────
  const output = {
    _meta: {
      generatedAt:  new Date().toISOString(),
      email:        account.email,
      projectName:  project.name,
      projectRef:   project.ref,
      region:       project.region || inputs.region,
    },
    s3: {
      accessKeyId:      s3Creds.accessKeyId,
      secretAccessKey:  s3Creds.secretAccessKey,
      endpoint:         s3Creds.endpoint,
      region:           s3Creds.region,
      bucketName:       s3Creds.bucketName,
      projectRef:       s3Creds.projectRef,
      _note:            'S3-compatible storage. Use with AWS SDK or any S3-compatible client.',
    },
    postgres: {
      direct: {
        host:     dbInfo.direct.host,
        port:     dbInfo.direct.port,
        database: dbInfo.direct.database,
        user:     dbInfo.direct.user,
        password: dbInfo.direct.password,
        uri:      dbInfo.direct.uri,
        jdbcUri:  dbInfo.direct.jdbcUri,
        sslMode:  dbInfo.direct.sslMode,
      },
      transactionPooler: {
        host:     dbInfo.transactionPooler.host,
        port:     dbInfo.transactionPooler.port,
        database: dbInfo.transactionPooler.database,
        user:     dbInfo.transactionPooler.user,
        password: dbInfo.transactionPooler.password,
        uri:      dbInfo.transactionPooler.uri,
        mode:     dbInfo.transactionPooler.mode,
        _note:    dbInfo.transactionPooler._note,
      },
      sessionPooler: {
        host:     dbInfo.sessionPooler.host,
        port:     dbInfo.sessionPooler.port,
        database: dbInfo.sessionPooler.database,
        user:     dbInfo.sessionPooler.user,
        password: dbInfo.sessionPooler.password,
        uri:      dbInfo.sessionPooler.uri,
        mode:     dbInfo.sessionPooler.mode,
        _note:    dbInfo.sessionPooler._note,
      },
    },
    api: {
      projectUrl:      dbInfo.api.projectUrl,
      anonKey:         dbInfo.api.anonKey,
      serviceRoleKey:  dbInfo.api.serviceRoleKey,
      jwtSecret:       dbInfo.api.jwtSecret,
      publishableKey:  dbInfo.api.publishableKey,
    },
    envFormats: {
      nextjs: dbInfo.envFormats.nextjs,
      prisma: dbInfo.envFormats.prisma,
      full:   dbInfo.envFormats.full,
    },
  };

  const jsonContent = JSON.stringify(output, null, 2);
  const slug        = safeEmailSlug(account.email);
  const fileName    = `supabase-${slug}.json`;

  // ── Ghi vào cwd ───────────────────────────────────────────────────
  const cwdPath = path.join(process.cwd(), fileName);
  try {
    fs.writeFileSync(cwdPath, jsonContent, 'utf8');
    console.log(`${LOG} ✓ Ghi: ${cwdPath}`);
  } catch (e) {
    console.error(`${LOG} ✗ Không ghi được file tại cwd: ${e.message}`);
  }

  // ── Ghi vào .supabase-data/ bên cạnh config ───────────────────────
  let configDirPath = null;
  const cfgPath = resolveSupabaseConfigPath();
  if (cfgPath) {
    const dataDir = path.join(path.dirname(cfgPath), '.supabase-data');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      configDirPath = path.join(dataDir, fileName);
      fs.writeFileSync(configDirPath, jsonContent, 'utf8');
      console.log(`${LOG} ✓ Ghi: ${configDirPath}`);
    } catch (e) {
      console.error(`${LOG} ✗ Không ghi được file tại config dir: ${e.message}`);
      configDirPath = null;
    }
  }

  // ── In tóm tắt ────────────────────────────────────────────────────
  const maskPass = (s) => (s ? '******* (có giá trị)' : '(trống)');
  const truncate = (s, n = 20) => (s ? s.slice(0, n) + '... (truncated)' : '(null)');

  console.log('');
  console.log(`${LOG} ========== KẾT QUẢ ==========`);
  console.log('');
  console.log(`  Project:   ${project.name} (ref=${project.ref})`);
  console.log(`  Region:    ${project.region || inputs.region}`);
  console.log('');
  console.log('  S3 Storage:');
  console.log(`    Endpoint : ${s3Creds.endpoint}`);
  console.log(`    Bucket   : ${s3Creds.bucketName}`);
  console.log(`    Key ID   : ${s3Creds.accessKeyId || '(không lấy được)'}`);
  console.log('');
  console.log('  Database — Direct:');
  console.log(`    Host     : ${dbInfo.direct.host}:${dbInfo.direct.port}`);
  console.log(`    User     : ${dbInfo.direct.user}`);
  console.log(`    URI      : postgresql://postgres:****@${dbInfo.direct.host}:${dbInfo.direct.port}/postgres`);
  console.log('');
  console.log('  Database — Transaction Pooler:');
  console.log(`    Host     : ${dbInfo.transactionPooler.host}:${dbInfo.transactionPooler.port}`);
  console.log(`    User     : ${dbInfo.transactionPooler.user}`);
  console.log('');
  console.log(`  API URL    : ${dbInfo.api.projectUrl}`);
  console.log(`  Anon Key   : ${dbInfo.api.anonKey ? truncate(dbInfo.api.anonKey, 30) : '(null)'}`);
  console.log('');
  console.log('  Output files:');
  console.log(`    ✓ ${cwdPath}`);
  if (configDirPath) {
    console.log(`    ✓ ${configDirPath}`);
  }
  console.log('');
  console.log(`${LOG} ==============================`);
}

module.exports = { write };
