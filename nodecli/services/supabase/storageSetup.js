// services/supabase/storageSetup.js — Tạo S3 access key, kiểm tra/tạo bucket

'use strict';

const { supabaseRequest } = require('../../lib/supabaseApi');

const LOG = '[supabase]';

// ─────────────────────────────────────────────────────────────────
// RESOLVE S3
// ─────────────────────────────────────────────────────────────────

/**
 * Tạo S3 Access Key + đảm bảo bucket tồn tại.
 *
 * @returns {{
 *   accessKeyId, secretAccessKey, endpoint, region,
 *   bucketName, projectRef,
 *   bucketPublic, bucketCreatedAt,
 *   _note
 * }}
 */
async function resolveS3(account, project, inputs) {
  console.log(`\n${LOG} Bước 4: Lấy S3 Storage credentials`);

  // ── Bước 4a: Tạo S3 Access Key ───────────────────────────────────
  const s3KeyRes = await supabaseRequest({
    method: 'POST',
    path:   `/projects/${project.ref}/storage/s3-access-key`,
    body:   {},
    token:  account.accessToken,
  });

  let accessKeyId     = null;
  let secretAccessKey = null;

  if (!s3KeyRes.ok) {
    console.log(`${LOG} ⚠  Không tạo được S3 Access Key: status ${s3KeyRes.status}`);
    console.log(`${LOG}    (có thể project chưa sẵn sàng hoặc API endpoint khác)`);
    // Tiếp tục không dừng — trả về null cho field này
  } else {
    const keyData   = s3KeyRes.data || {};
    accessKeyId     = keyData.access_key_id     || keyData.accessKeyId     || null;
    secretAccessKey = keyData.secret_access_key || keyData.secretAccessKey || null;

    console.log(`${LOG} ✓ S3 Access Key tạo thành công`);
    if (accessKeyId) {
      console.log(`${LOG}   accessKeyId     : ${accessKeyId.slice(0, 16)}************ (truncated)`);
    }
    console.log(`${LOG}   secretAccessKey : **** (ẩn)`);
  }

  // ── Bước 4b: Kiểm tra bucket tồn tại ─────────────────────────────
  console.log(`${LOG} Bước 4b: Kiểm tra bucket tồn tại`);

  const bucketsRes = await supabaseRequest({
    method: 'GET',
    path:   `/projects/${project.ref}/storage/buckets`,
    token:  account.accessToken,
  });

  let bucketPublic    = false;
  let bucketCreatedAt = null;

  if (!bucketsRes.ok) {
    console.log(`${LOG} ⚠  Không lấy được danh sách buckets: status ${bucketsRes.status}`);
  } else {
    const buckets     = Array.isArray(bucketsRes.data) ? bucketsRes.data : [];
    const existBucket = buckets.find((b) => b.name === inputs.bucketName);

    if (existBucket) {
      console.log(`${LOG} ✓ Bucket "${inputs.bucketName}" đã tồn tại`);
      bucketPublic    = existBucket.public || false;
      bucketCreatedAt = existBucket.created_at || null;
    } else {
      console.log(`${LOG} Bucket "${inputs.bucketName}" chưa tồn tại. Tạo mới...`);

      const createRes = await supabaseRequest({
        method: 'POST',
        path:   `/projects/${project.ref}/storage/buckets`,
        body:   { name: inputs.bucketName, public: false },
        token:  account.accessToken,
      });

      if (!createRes.ok) {
        console.log(`${LOG} ⚠  Không tạo được bucket: status ${createRes.status}`);
      } else {
        const created   = createRes.data || {};
        bucketPublic    = created.public || false;
        bucketCreatedAt = created.created_at || new Date().toISOString();
        console.log(`${LOG} ✓ Bucket "${inputs.bucketName}" tạo thành công`);
      }
    }
  }

  // ── Build endpoint S3 ─────────────────────────────────────────────
  const endpoint = `https://${project.ref}.supabase.co/storage/v1/s3`;

  console.log(`\n${LOG} S3 Info:`);
  console.log(`  accessKeyId     : ${accessKeyId ? accessKeyId.slice(0, 16) + '************ (truncated)' : '(không lấy được)'}`);
  console.log(`  secretAccessKey : **** (ẩn)`);
  console.log(`  endpoint        : ${endpoint}`);
  console.log(`  region          : ${inputs.region}`);
  console.log(`  bucket          : ${inputs.bucketName}`);
  console.log(`  projectRef      : ${project.ref}`);

  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    region:         inputs.region,
    bucketName:     inputs.bucketName,
    projectRef:     project.ref,
    bucketPublic,
    bucketCreatedAt,
    _note: 'S3-compatible. Use path-style: endpoint/bucket/key',
  };
}

module.exports = { resolveS3 };
