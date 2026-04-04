// services/azure/index.js — Subcommand `ocli azure`
// Flow: chọn account Azure từ .git-o-config
//       → chọn project → chọn pipeline → chọn nghiệp vụ

'use strict';

const { loadSections, filterByProvider, parseSection } = require('../../lib/config');
const { azureRequest } = require('../../lib/azureApi');
const { selectMenu, ask } = require('../../lib/prompt');
const variables = require('./variables');
const createPipeline = require('./createPipeline');

const LOG = '[azure]';

// ─────────────────────────────────────────────────────────────────
// Lấy danh sách projects
// ─────────────────────────────────────────────────────────────────

async function listProjects(org, account) {
  const res = await azureRequest({
    method: 'GET',
    org,
    path: `_apis/projects?api-version=7.1&$top=100`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được danh sách project: ${msg}`);
  }

  return (res.data && res.data.value) || [];
}

// ─────────────────────────────────────────────────────────────────
// Lấy danh sách pipeline definitions của một project
// ─────────────────────────────────────────────────────────────────

async function listPipelines(org, project, account) {
  const res = await azureRequest({
    method: 'GET',
    org,
    path: `${encodeURIComponent(project)}/_apis/build/definitions?api-version=7.1&$top=100`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được danh sách pipeline: ${msg}`);
  }

  return (res.data && res.data.value) || [];
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────

async function run() {

  // ── Bước 1: Chọn account Azure từ .git-o-config ───────────────────
  let sections;
  try {
    const cfg = loadSections();
    sections = filterByProvider(cfg.sections, 'dev.azure.com');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  if (sections.length === 0) {
    console.error(`${LOG} Không tìm thấy account dev.azure.com nào trong .git-o-config.`);
    console.error(`${LOG}   Thêm section ví dụ:`);
    console.error(`${LOG}   [dev.azure.com/myorg]`);
    console.error(`${LOG}   header=Authorization: Basic <base64_PAT>`);
    process.exit(1);
  }

  const accountIdx = await selectMenu(
    'Chọn account / org Azure DevOps',
    sections.map((s) => ({ label: s.section }))
  );
  if (accountIdx === -1) return;

  const account = sections[accountIdx];
  const { owner: org, extra: configProject } = parseSection(account.section);

  console.log(`\n${LOG} Org: ${org}`);

  // ── Bước 2: Chọn project ──────────────────────────────────────────
  let selectedProject = configProject;  // có thể đã có trong section config

  if (!selectedProject) {
    let projects = [];
    try {
      console.log(`${LOG} Đang lấy danh sách project...`);
      projects = await listProjects(org, account);
    } catch (e) {
      console.error(e.message);
      // Cho nhập tay nếu API lỗi
    }

    if (projects.length > 0) {
      const projectIdx = await selectMenu(
        `Chọn project (org: ${org})`,
        [
          ...projects.map((p) => ({
            label: `${p.name.padEnd(40)} ${p.description || ''}`.trimEnd(),
          })),
          { label: '✏  Nhập tên project thủ công' },
        ]
      );

      if (projectIdx === -1) return;

      if (projectIdx === projects.length) {
        selectedProject = await ask('  Tên project');
        if (!selectedProject) { console.log('  Hủy.'); return; }
      } else {
        selectedProject = projects[projectIdx].name;
      }
    } else {
      // Không lấy được list → nhập tay
      selectedProject = await ask('  Tên project Azure DevOps');
      if (!selectedProject) { console.log('  Hủy.'); return; }
    }
  } else {
    console.log(`${LOG} Project: ${selectedProject} (từ cấu hình)`);
  }

  console.log(`\n${LOG} Project: ${selectedProject}`);

  // ── Bước 3: Chọn flow pipeline ────────────────────────────────────
  const flowIdx = await selectMenu(
    `Pipeline action — ${selectedProject}`,
    [
      { label: 'Chọn pipeline hiện có để quản lý variables' },
      { label: 'Tạo pipeline mới từ file YAML trong repo' },
    ]
  );
  if (flowIdx === -1) return;

  let selectedPipeline;
  if (flowIdx === 0) {
    let pipelines = [];
    try {
      console.log(`${LOG} Đang lấy danh sách pipeline...`);
      pipelines = await listPipelines(org, selectedProject, account);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }

    if (pipelines.length === 0) {
      console.log(`${LOG} Project không có pipeline nào.`);
      return;
    }

    const pipelineIdx = await selectMenu(
      `Chọn pipeline — ${selectedProject} (${pipelines.length} pipeline)`,
      [
        ...pipelines.map((p) => ({
          label: `[${String(p.id).padStart(4)}]  ${p.name}`,
        })),
        { label: '✏  Nhập ID pipeline thủ công' },
      ]
    );

    if (pipelineIdx === -1) return;

    if (pipelineIdx === pipelines.length) {
      const idStr = await ask('  Pipeline ID (số)');
      const id = parseInt(idStr, 10);
      if (isNaN(id)) { console.log('  ID không hợp lệ.'); return; }
      selectedPipeline = { id, name: `pipeline-${id}` };
    } else {
      selectedPipeline = {
        id:   pipelines[pipelineIdx].id,
        name: pipelines[pipelineIdx].name,
      };
    }
  } else {
    selectedPipeline = await createPipeline.run(org, selectedProject, account);
    if (!selectedPipeline) return;
  }

  console.log(`\n${LOG} Pipeline: ${selectedPipeline.name} (id=${selectedPipeline.id})`);

  // ── Bước 4: Chọn nghiệp vụ ────────────────────────────────────────
  while (true) {
    const featureIdx = await selectMenu(
      `Chọn nghiệp vụ — ${selectedPipeline.name}`,
      [
        { label: 'Variables — thêm/xem/xóa pipeline variables' },
        // Thêm nghiệp vụ mới ở đây
      ]
    );

    if (featureIdx === -1) break;

    if (featureIdx === 0) {
      await variables.run(org, selectedProject, selectedPipeline, account);
    }
  }
}

module.exports = { run };
