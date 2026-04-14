// services/supabase/storageSetup.js — Tạo S3 access key, kiểm tra/tạo bucket

'use strict';

const https = require('https');

const { supabaseRequest } = require('../../lib/supabaseApi');
const { ask, confirm } = require('../../lib/prompt');

const LOG = '[supabase]';

function truncateKey(value, max = 16) {
  if (!value) return '(không lấy được)';
  return `${String(value).slice(0, max)}************ (truncated)`;
}

function normalizeBucketMeta(bucket, fallbackCreatedAt = null) {
  if (!bucket) {
    return { bucketPublic: false, bucketCreatedAt: fallbackCreatedAt };
  }
  return {
    bucketPublic: !!bucket.public,
    bucketCreatedAt: bucket.created_at || fallbackCreatedAt,
  };
}

function normalizeS3Credential(data) {
  const payload = data || {};
  return {
    accessKeyId: payload.access_key_id || payload.accessKeyId || payload.access_key || payload.accessKey || null,
    secretAccessKey:
      payload.secret_access_key || payload.secretAccessKey || payload.secret_key || payload.secretKey || null,
    credentialId: payload.id || null,
  };
}

function httpRequestRaw({ hostname, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request(
      {
        hostname,
        path,
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...headers,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = null;
          if (raw.trim()) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = { _rawText: raw };
            }
          }

          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ ok, status: res.statusCode, data, raw });
        });
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function platformRequest(accountToken, method, apiPath, body) {
  console.log(`[supabase:api] → ${method} ${apiPath}`);
  const start = Date.now();
  const res = await httpRequestRaw({
    hostname: 'api.supabase.com',
    path: apiPath,
    method,
    headers: { Authorization: `Bearer ${accountToken}` },
    body,
  });

  const elapsed = Date.now() - start;
  if (res.ok) {
    console.log(`[supabase:api] ← ${res.status} OK (${elapsed}ms)`);
  } else {
    const msg = res.data && res.data.message ? res.data.message : String(res.raw || '').slice(0, 140);
    console.log(`[supabase:api] ✗ ${method} ${apiPath} — ${res.status}: ${msg}`);
  }

  return res;
}

async function storageApiRequest(projectRef, serviceRoleKey, method, apiPath, body) {
  const host = `${projectRef}.supabase.co`;
  console.log(`[supabase:api] → ${method} https://${host}${apiPath}`);
  const start = Date.now();
  const res = await httpRequestRaw({
    hostname: host,
    path: apiPath,
    method,
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body,
  });

  const elapsed = Date.now() - start;
  if (res.ok) {
    console.log(`[supabase:api] ← ${res.status} OK (${elapsed}ms)`);
  } else {
    const msg = res.data && res.data.message ? res.data.message : String(res.raw || '').slice(0, 140);
    console.log(`[supabase:api] ✗ ${method} https://${host}${apiPath} — ${res.status}: ${msg}`);
  }

  return res;
}

async function getServiceRoleKey(account, projectRef, cache) {
  if (cache && cache.serviceRoleKey) return cache.serviceRoleKey;

  const keysRes = await supabaseRequest({
    method: 'GET',
    path: `/projects/${projectRef}/api-keys`,
    token: account.accessToken,
  });

  if (!keysRes.ok || !Array.isArray(keysRes.data)) {
    return null;
  }

  const entry = keysRes.data.find((k) => k.name === 'service_role' && k.api_key);
  const value = entry ? entry.api_key : null;
  if (cache) cache.serviceRoleKey = value;
  return value;
}

async function tryPlatformCreateS3Credential(account, projectRef) {
  const candidates = [
    { name: 'accessTokenExp', token: account.accessTokenExp || '' },
    { name: 'accessToken', token: account.accessToken || '' },
  ].filter((x, idx, arr) => x.token && arr.findIndex((i) => i.token === x.token) === idx);

  for (const candidate of candidates) {
    const res = await platformRequest(
      candidate.token,
      'POST',
      `/platform/storage/${projectRef}/credentials`,
      { description: `ocli-${Date.now()}` },
    );

    if (res.ok) {
      const creds = normalizeS3Credential(res.data);
      if (creds.accessKeyId && creds.secretAccessKey) {
        return { ok: true, creds, source: `platform:${candidate.name}` };
      }
    }

    if (res.status === 401 || res.status === 403) {
      const msg = res.data && res.data.message ? String(res.data.message) : '';
      if (msg.toLowerCase().includes('jwt')) {
        return {
          ok: false,
          permanent: true,
          reason: 'platform_auth_unsupported',
          detail: `${candidate.name}: ${msg}`,
        };
      }
    }
  }

  return {
    ok: false,
    permanent: false,
    reason: 'platform_failed',
    detail: 'platform endpoint không trả về S3 credential',
  };
}

async function askManualS3Credentials(projectRef, existing) {
  const dashboardUrl = `https://supabase.com/dashboard/project/${projectRef}/storage/s3`;
  console.log(`\n${LOG} Không lấy được S3 Access Key qua API.`);
  console.log(`${LOG} Mở Dashboard để tạo/lấy S3 credentials:`);
  console.log(`  ${dashboardUrl}`);

  const ok = await confirm('  Bạn muốn nhập tay S3 Access Key/Secret ngay bây giờ?', true);
  if (!ok) return existing;

  const accessKeyId = await ask('  Nhập S3 accessKeyId', (existing && existing.accessKeyId) || '');
  const secretAccessKey = await ask('  Nhập S3 secretAccessKey', (existing && existing.secretAccessKey) || '');

  return {
    accessKeyId: accessKeyId || null,
    secretAccessKey: secretAccessKey || null,
    source: accessKeyId && secretAccessKey ? 'manual' : 'unavailable',
  };
}

async function resolveS3Credentials(account, projectRef, previous, interactive) {
  let state = {
    accessKeyId: previous && previous.accessKeyId ? previous.accessKeyId : null,
    secretAccessKey: previous && previous.secretAccessKey ? previous.secretAccessKey : null,
    source: previous && previous.accessKeyId && previous.secretAccessKey ? 'previous' : 'unavailable',
  };

  const v1Res = await supabaseRequest({
    method: 'POST',
    path: `/projects/${projectRef}/storage/s3-access-key`,
    body: {},
    token: account.accessToken,
  });

  if (v1Res.ok) {
    const creds = normalizeS3Credential(v1Res.data);
    state = {
      accessKeyId: creds.accessKeyId || state.accessKeyId,
      secretAccessKey: creds.secretAccessKey || state.secretAccessKey,
      source: 'v1',
    };
    if (state.accessKeyId || state.secretAccessKey) {
      console.log(`${LOG} ✓ S3 Access Key tạo thành công`);
      return state;
    }
  } else {
    console.log(`${LOG} ⚠ Không tạo được S3 Access Key: status ${v1Res.status}`);
  }

  const platform = await tryPlatformCreateS3Credential(account, projectRef);
  if (platform.ok) {
    state = {
      accessKeyId: platform.creds.accessKeyId,
      secretAccessKey: platform.creds.secretAccessKey,
      source: platform.source,
    };
    console.log(`${LOG} ✓ Tạo S3 credential thành công qua ${platform.source}`);
    return state;
  }

  if (platform.permanent) {
    console.log(`${LOG} ✗ Không thể gọi platform endpoint bằng PAT hiện tại (${platform.detail}).`);
  }

  const envAccessKeyId = (process.env.SUPABASE_S3_ACCESS_KEY_ID || '').trim();
  const envSecretAccessKey = (process.env.SUPABASE_S3_SECRET_ACCESS_KEY || '').trim();
  if (envAccessKeyId && envSecretAccessKey) {
    console.log(`${LOG} ✓ Dùng S3 credentials từ env (SUPABASE_S3_ACCESS_KEY_ID / SUPABASE_S3_SECRET_ACCESS_KEY).`);
    return {
      accessKeyId: envAccessKeyId,
      secretAccessKey: envSecretAccessKey,
      source: 'env',
    };
  }

  if (interactive && (!state.accessKeyId || !state.secretAccessKey)) {
    state = await askManualS3Credentials(projectRef, state);
  }

  return state;
}

async function listBucketsPreferV1(account, projectRef, serviceRoleKey) {
  const v1 = await supabaseRequest({
    method: 'GET',
    path: `/projects/${projectRef}/storage/buckets`,
    token: account.accessToken,
  });

  if (v1.ok) {
    const data = Array.isArray(v1.data) ? v1.data : [];
    return { ok: true, data, source: 'v1' };
  }

  if (serviceRoleKey) {
    const dataApi = await storageApiRequest(projectRef, serviceRoleKey, 'GET', '/storage/v1/bucket');
    if (dataApi.ok && Array.isArray(dataApi.data)) {
      return { ok: true, data: dataApi.data, source: 'project-storage-api' };
    }
  }

  return { ok: false, data: [], source: 'none', status: v1.status };
}

async function createBucketPrefer(account, projectRef, bucketName, serviceRoleKey) {
  const v1 = await supabaseRequest({
    method: 'POST',
    path: `/projects/${projectRef}/storage/buckets`,
    body: { name: bucketName, public: false },
    token: account.accessToken,
  });

  if (v1.ok) {
    return { ok: true, data: v1.data || {}, source: 'v1' };
  }

  if (v1.status === 404 && serviceRoleKey) {
    console.log(`${LOG} Endpoint v1 tạo bucket không khả dụng. Fallback qua project Storage API...`);
    const dataApi = await storageApiRequest(projectRef, serviceRoleKey, 'POST', '/storage/v1/bucket', {
      id: bucketName,
      name: bucketName,
      public: false,
    });

    if (dataApi.ok) {
      return {
        ok: true,
        data: {
          name: bucketName,
          public: false,
          created_at: new Date().toISOString(),
          ...(dataApi.data || {}),
        },
        source: 'project-storage-api',
      };
    }
  }

  return { ok: false, data: null, source: 'none', status: v1.status };
}

async function ensureBucketNoRetry(account, projectRef, bucketName, previous, cache, interactive) {
  let bucketPublic = previous && typeof previous.bucketPublic === 'boolean' ? previous.bucketPublic : false;
  let bucketCreatedAt = previous && previous.bucketCreatedAt ? previous.bucketCreatedAt : null;

  const serviceRoleKey = await getServiceRoleKey(account, projectRef, cache);
  if (!serviceRoleKey) {
    console.log(`${LOG} ⚠ Không lấy được service_role key, fallback bucket sẽ hạn chế.`);
  }

  console.log(`${LOG} Bước 4b: Kiểm tra bucket tồn tại`);
  const listRes = await listBucketsPreferV1(account, projectRef, serviceRoleKey);

  if (listRes.ok) {
    const existing = listRes.data.find((b) => b.name === bucketName || b.id === bucketName);
    if (existing) {
      console.log(`${LOG} ✓ Bucket "${bucketName}" đã tồn tại (${listRes.source})`);
      return normalizeBucketMeta(existing, bucketCreatedAt);
    }
  }

  console.log(`${LOG} Bucket "${bucketName}" chưa tồn tại. Tạo mới...`);
  const createRes = await createBucketPrefer(account, projectRef, bucketName, serviceRoleKey);
  if (createRes.ok) {
    const normalized = normalizeBucketMeta(createRes.data, new Date().toISOString());
    console.log(`${LOG} ✓ Bucket "${bucketName}" tạo thành công (${createRes.source})`);
    return normalized;
  }

  const dashboardBucketUrl = `https://supabase.com/dashboard/project/${projectRef}/storage/buckets`;
  console.log(`${LOG} ✗ Không tạo được bucket qua API.`);
  console.log(`${LOG} Mở Dashboard để tạo bucket:`);
  console.log(`  ${dashboardBucketUrl}`);

  if (interactive) {
    const done = await confirm(`  Bạn đã tạo bucket "${bucketName}" trên Dashboard chưa?`, false);
    if (done) {
      bucketCreatedAt = new Date().toISOString();
      bucketPublic = false;
      console.log(`${LOG} ✓ Đánh dấu bucket đã được tạo thủ công.`);
    }
  }

  return { bucketPublic, bucketCreatedAt };
}

// ─────────────────────────────────────────────────────────────────
// RESOLVE S3
// ─────────────────────────────────────────────────────────────────

/**
 * Tạo S3 Access Key + đảm bảo bucket tồn tại.
 */
async function resolveS3(account, project, inputs, opts = {}) {
  const previous = opts.previous || {};
  const interactive = opts.interactive !== false;
  const cache = {};

  console.log(`\n${LOG} Bước 4: Lấy S3 Storage credentials`);

  const keyState = await resolveS3Credentials(account, project.ref, previous, interactive);
  const bucketState = await ensureBucketNoRetry(account, project.ref, inputs.bucketName, previous, cache, interactive);

  const endpoint = `https://${project.ref}.supabase.co/storage/v1/s3`;

  console.log(`\n${LOG} S3 Info:`);
  console.log(`  accessKeyId     : ${truncateKey(keyState.accessKeyId)}`);
  console.log(`  secretAccessKey : ${keyState.secretAccessKey ? '**** (ẩn)' : '(không lấy được)'}`);
  console.log(`  endpoint        : ${endpoint}`);
  console.log(`  region          : ${inputs.region}`);
  console.log(`  bucket          : ${inputs.bucketName}`);
  console.log(`  projectRef      : ${project.ref}`);

  return {
    accessKeyId: keyState.accessKeyId,
    secretAccessKey: keyState.secretAccessKey,
    endpoint,
    region: inputs.region,
    bucketName: inputs.bucketName,
    projectRef: project.ref,
    bucketPublic: bucketState.bucketPublic,
    bucketCreatedAt: bucketState.bucketCreatedAt,
    _note: 'S3-compatible. Use path-style: endpoint/bucket/key',
  };
}

module.exports = { resolveS3 };
