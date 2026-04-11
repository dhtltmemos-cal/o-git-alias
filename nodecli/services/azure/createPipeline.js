// services/azure/createPipeline.js — Tạo Azure Pipeline từ YAML trong repo

"use strict";

const { azureRequest } = require("../../lib/azureApi");
const { ask, selectMenu, confirm } = require("../../lib/prompt");

const LOG = "[azure:createPipeline]";
const API_VERSION = "7.1";

// ─────────────────────────────────────────────────────────────────
// Lấy danh sách Git repositories trong project
// ─────────────────────────────────────────────────────────────────

async function listRepositories(org, project, account) {
  const res = await azureRequest({
    method: "GET",
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

// ─────────────────────────────────────────────────────────────────
// Quét toàn bộ file *.yml / *.yaml trong repo
// recursionLevel=full (lowercase) là giá trị đúng theo Azure DevOps API
// ─────────────────────────────────────────────────────────────────

async function listYamlFiles(org, project, repoId, account) {
  const res = await azureRequest({
    method: "GET",
    org,
    path: `${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}/items?scopePath=/&recursionLevel=full&includeContentMetadata=true&api-version=${API_VERSION}`,
    account,
  });

  if (!res.ok) {
    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    throw new Error(`${LOG} Không lấy được danh sách file trong repo: ${msg}`);
  }

  const items = (res.data && res.data.value) || [];
  return items
    .filter((it) => !it.isFolder && /\.(yml|yaml)$/i.test(it.path || ""))
    .map((it) => it.path)
    .sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────────────────────────
// Lấy danh sách agent queues trong project.
// Lưu ý:
//   - Build definition YAML vẫn nên có `pool` trong file YAML.
//   - Nhưng nhiều org/project vẫn bắt buộc "Default agent pool for YAML" ở definition.
//     Vì vậy khi tạo pipeline qua API, cần gắn queue mặc định ngay từ đầu.
// ─────────────────────────────────────────────────────────────────

async function listQueues(org, project, account) {
  const candidatePaths = [
    // Endpoint cũ cho Build definitions (nhiều org vẫn dùng được)
    `${encodeURIComponent(project)}/_apis/build/queues?api-version=${API_VERSION}`,
    // Endpoint queue chuẩn theo Distributed Task, project-scoped
    `${encodeURIComponent(project)}/_apis/distributedtask/queues?api-version=${API_VERSION}`,
    // Fallback org-scoped (một số org/project trả 404 ở project-scoped)
    `_apis/distributedtask/queues?api-version=${API_VERSION}`,
  ];

  const errors = [];
  for (const path of candidatePaths) {
    const res = await azureRequest({
      method: "GET",
      org,
      path,
      account,
    });

    if (res.ok) {
      return (res.data && res.data.value) || [];
    }

    const msg = res.data && res.data.message ? res.data.message : `status ${res.status}`;
    errors.push(`${path} -> ${msg}`);

    // 401/403 thì dừng luôn vì là lỗi quyền/auth, không cần thử endpoint khác.
    if (res.status === 401 || res.status === 403) {
      break;
    }
  }

  throw new Error(`${LOG} Không lấy được danh sách queues (đã thử nhiều endpoint): ${errors.join(" | ")}`);
}

// ─────────────────────────────────────────────────────────────────
// Tạo build definition mới (YAML pipeline)
// ─────────────────────────────────────────────────────────────────

async function createDefinition(org, project, body, account) {
  const res = await azureRequest({
    method: "POST",
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

// ─────────────────────────────────────────────────────────────────
// MAIN — được gọi từ azure/index.js
// Trả về { id, name } của pipeline vừa tạo, hoặc null nếu hủy/lỗi
// ─────────────────────────────────────────────────────────────────

async function run(org, project, account) {
  // ── Bước 1: Chọn repo ──────────────────────────────────────────
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
    "Chọn repo chứa file YAML pipeline",
    repos.map((r) => ({
      label: `${r.name}${r.defaultBranch ? ` (${r.defaultBranch})` : ""}`,
    })),
  );
  if (repoIdx === -1) return null;

  const selectedRepo = repos[repoIdx];
  console.log(`${LOG} Repo: ${selectedRepo.name}`);

  // ── Bước 2: Chọn file YAML ────────────────────────────────────
  let yamlFiles = [];
  try {
    console.log(`${LOG} Đang quét file *.yml/*.yaml trong repo...`);
    yamlFiles = await listYamlFiles(org, project, selectedRepo.id, account);
  } catch (e) {
    console.error(e.message);
    return null;
  }

  if (yamlFiles.length === 0) {
    console.log(`${LOG} Không tìm thấy file YAML trong repo. Bạn có thể nhập path thủ công.`);
  }

  const menuItems = [...yamlFiles.map((f) => ({ label: f })), { label: "✏  Nhập path YAML thủ công" }];

  const yamlIdx = await selectMenu(`Chọn file YAML${yamlFiles.length > 0 ? ` (${yamlFiles.length} file)` : ""}`, menuItems);
  if (yamlIdx === -1) return null;

  let selectedYaml;
  if (yamlIdx === yamlFiles.length) {
    // Nhập tay
    selectedYaml = await ask("  Path YAML (VD: /azure-pipelines.yml)");
    if (!selectedYaml) {
      console.log("  Hủy.");
      return null;
    }
    // Đảm bảo path bắt đầu bằng /
    if (!selectedYaml.startsWith("/")) selectedYaml = `/${selectedYaml}`;
  } else {
    selectedYaml = yamlFiles[yamlIdx];
  }

  // ── Bước 3: Đặt tên pipeline ──────────────────────────────────
  const defaultPipelineName = `${selectedRepo.name} - ${selectedYaml.replace(/^\//, "")}`;
  const pipelineName = await ask("  Tên pipeline mới", defaultPipelineName);
  if (!pipelineName) {
    console.log("  Hủy.");
    return null;
  }

  // ── Bước 4: Chọn queue mặc định cho YAML (bắt buộc) ───────────
  let queueId = null;
  let queueName = "";
  try {
    const queues = await listQueues(org, project, account);
    if (queues.length === 0) {
      console.error(`${LOG} Không có agent queue nào trong project.`);
      console.error(`${LOG} Hãy tạo/authorize queue (ví dụ: Azure Pipelines) rồi chạy lại.`);
      return null;
    }

    const preferredIdx = queues.findIndex((q) => {
      const qn = (q && q.name ? String(q.name) : "").toLowerCase();
      const pn = (q && q.pool && q.pool.name ? String(q.pool.name) : "").toLowerCase();
      return qn === "azure pipelines" || pn === "azure pipelines";
    });

    if (preferredIdx >= 0) {
      // Theo yêu cầu: nếu có "Azure Pipelines" thì auto chọn luôn, không hỏi user.
      queueId = queues[preferredIdx].id;
      queueName = queues[preferredIdx].name;
      console.log(`${LOG} Tự động chọn default agent pool for YAML: ${queueName} (id=${queueId})`);
    } else {
      const queueIdx = await selectMenu(
        `Chọn default agent pool for YAML (${queues.length} queue)`,
        queues.map((q) => {
          const poolName = q && q.pool && q.pool.name ? q.pool.name : "";
          return {
            label: `[${String(q.id).padStart(4)}]  ${q.name}${poolName ? ` (pool: ${poolName})` : ""}`,
          };
        }),
      );

      if (queueIdx === -1) {
        console.log("  Hủy.");
        return null;
      }

      queueId = queues[queueIdx].id;
      queueName = queues[queueIdx].name;
    }
  } catch (e) {
    console.error(`${LOG} Không lấy được queue mặc định cho YAML: ${e.message}`);
    return null;
  }

  // ── Bước 5: Build payload và xác nhận ────────────────────────
  //
  // Azure DevOps Git repos luôn dùng type "TfsGit" trong build definition.
  // API /git/repositories trả về loại repo là "Git" (enum internal), nhưng
  // build definition API nhận "TfsGit" cho Azure Repos Git.
  // Không dùng selectedRepo.type vì giá trị đó không ánh xạ 1-1 sang build def type.
  //
  // defaultBranch từ repo API có thể là "" (repo rỗng) → fallback 'refs/heads/main'.

  const resolvedBranch = selectedRepo.defaultBranch && selectedRepo.defaultBranch.trim() ? selectedRepo.defaultBranch.trim() : "refs/heads/main";

  const body = {
    name: pipelineName,
    type: "build",
    quality: "definition",
    queueStatus: "enabled",
    path: "\\",
    process: {
      type: 2, // 2 = YAML pipeline
      yamlFilename: selectedYaml,
    },
    repository: {
      id: selectedRepo.id,
      name: selectedRepo.name,
      type: "TfsGit", // hardcode: đây là giá trị đúng cho Azure Repos Git
      url: selectedRepo.url,
      defaultBranch: resolvedBranch,
      clean: "false",
    },
  };

  body.queue = { id: queueId };

  console.log("\n  Tóm tắt pipeline sẽ tạo:");
  console.log(`    • Name   : ${pipelineName}`);
  console.log(`    • Repo   : ${selectedRepo.name}`);
  console.log(`    • YAML   : ${selectedYaml}`);
  console.log(`    • Branch : ${resolvedBranch}`);
  console.log(`    • Queue  : ${queueName || queueId} (id=${queueId})`);
  console.log("");

  const ok = await confirm("  Xác nhận tạo pipeline?", true);
  if (!ok) {
    console.log("  Hủy.");
    return null;
  }

  // ── Bước 6: Gọi API tạo pipeline ─────────────────────────────
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
