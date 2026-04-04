// services/azure/createPipeline.js — Tạo Azure Pipeline từ YAML trong repo

'use strict';

const { azureRequest } = require('../../lib/azureApi');
const { ask, selectMenu, confirm } = require('../../lib/prompt');

const LOG = '[azure:createPipeline]';
const API_VERSION = '7.1';

async function listRepositories(org, project, account) {
  const res = await azureRequest({
    method: 'GET',
    org,
    path: `${encodeURIComponent(project)}/_apis/git/repositories?api-version=${API_VERSION}`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được danh sách repositories: ${msg}`);
  }

  return (res.data && res.data.value) || [];
}

async function listYamlFiles(org, project, repoId, account) {
  const res = await azureRequest({
    method: 'GET',
    org,
    path: `${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}/items?scopePath=/&recursionLevel=Full&includeContentMetadata=true&api-version=${API_VERSION}`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được danh sách file trong repo: ${msg}`);
  }

  const items = (res.data && res.data.value) || [];
  return items
    .filter((it) => !it.isFolder && /\.(yml|yaml)$/i.test(it.path || ''))
    .map((it) => it.path)
    .sort((a, b) => a.localeCompare(b));
}

async function listQueues(org, project, account) {
  const res = await azureRequest({
    method: 'GET',
    org,
    path: `${encodeURIComponent(project)}/_apis/build/queues?api-version=${API_VERSION}`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được danh sách queues: ${msg}`);
  }

  return (res.data && res.data.value) || [];
}

async function createDefinition(org, project, body, account) {
  const res = await azureRequest({
    method: 'POST',
    org,
    path: `${encodeURIComponent(project)}/_apis/build/definitions?api-version=${API_VERSION}`,
    body,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không tạo được pipeline: ${msg}`);
  }

  return res.data;
}

async function run(org, project, account) {
  let repos = [];
  try {
    console.log(`${LOG} Đang lấy danh sách repo...`);
    repos = await listRepositories(org, project, account);
  } catch (e) {
    console.error(e.message);
    return null;
  }

  if (repos.length === 0) {
    console.log(`${LOG} Project chưa có repository nào.`);
    return null;
  }

  const repoIdx = await selectMenu(
    'Chọn repo chứa file YAML pipeline',
    repos.map((r) => ({
      label: `${r.name}${r.defaultBranch ? ` (${r.defaultBranch})` : ''}`,
    }))
  );
  if (repoIdx === -1) return null;

  const selectedRepo = repos[repoIdx];
  console.log(`${LOG} Repo: ${selectedRepo.name}`);

  let yamlFiles = [];
  try {
    console.log(`${LOG} Đang quét file *.yml/*.yaml trong repo...`);
    yamlFiles = await listYamlFiles(org, project, selectedRepo.id, account);
  } catch (e) {
    console.error(e.message);
    return null;
  }

  if (yamlFiles.length === 0) {
    console.log(`${LOG} Không tìm thấy file YAML trong repo.`);
    return null;
  }

  const yamlIdx = await selectMenu(
    `Chọn file YAML (${yamlFiles.length} file)`,
    [
      ...yamlFiles.map((f) => ({ label: f })),
      { label: '✏  Nhập path YAML thủ công' },
    ]
  );
  if (yamlIdx === -1) return null;

  const selectedYaml = yamlIdx === yamlFiles.length
    ? await ask('  Path YAML (VD: /azure-pipelines.yml)')
    : yamlFiles[yamlIdx];
  if (!selectedYaml) {
    console.log('  Hủy.');
    return null;
  }

  const defaultPipelineName = `${selectedRepo.name} - ${selectedYaml.replace(/^\//, '')}`;
  const pipelineName = await ask('  Tên pipeline mới', defaultPipelineName);
  if (!pipelineName) {
    console.log('  Hủy.');
    return null;
  }

  let queueId = null;
  try {
    const queues = await listQueues(org, project, account);
    if (queues.length > 0) queueId = queues[0].id;
  } catch (e) {
    console.error(`${LOG} Cảnh báo: không lấy được queue, sẽ thử tạo không kèm queue.`);
  }

  const body = {
    name: pipelineName,
    type: 'build',
    quality: 'definition',
    queueStatus: 'enabled',
    path: '\\',
    process: {
      type: 2,
      yamlFilename: selectedYaml,
    },
    repository: {
      id: selectedRepo.id,
      name: selectedRepo.name,
      type: selectedRepo.type || 'TfsGit',
      url: selectedRepo.url,
      defaultBranch: selectedRepo.defaultBranch || 'refs/heads/main',
      clean: 'false',
    },
  };

  if (queueId) {
    body.queue = { id: queueId };
  }

  console.log('\n  Tóm tắt pipeline sẽ tạo:');
  console.log(`    • Name: ${pipelineName}`);
  console.log(`    • Repo: ${selectedRepo.name}`);
  console.log(`    • YAML: ${selectedYaml}`);
  if (queueId) console.log(`    • Queue ID: ${queueId}`);
  console.log('');

  const ok = await confirm('  Xác nhận tạo pipeline?', true);
  if (!ok) {
    console.log('  Hủy.');
    return null;
  }

  try {
    const created = await createDefinition(org, project, body, account);
    console.log(`${LOG} ✓ Đã tạo pipeline: ${created.name} (id=${created.id})`);
    return { id: created.id, name: created.name };
  } catch (e) {
    console.error(e.message);
    return null;
  }
}

module.exports = { run };
