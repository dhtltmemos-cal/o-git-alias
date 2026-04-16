// services/gh/actions.js — Quản lý GitHub Actions cho một repo
// Nghiệp vụ: list workflows, xem runs, chi tiết run, trigger, bật/tắt, xem log

"use strict";

const { spawn } = require("../../lib/shell");
const { ask, confirm, selectMenu } = require("../../lib/prompt");

const LOG = "[gh:actions]";

// ─────────────────────────────────────────────────────────────────
// HELPER: Truyền GH_TOKEN đúng cách
// ─────────────────────────────────────────────────────────────────

function ghEnv(account) {
  return account.token ? { ...process.env, GH_TOKEN: account.token } : { ...process.env };
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Tính duration từ 2 ISO string
// ─────────────────────────────────────────────────────────────────

function formatDuration(createdAt, updatedAt) {
  if (!createdAt) return "-";
  const start = new Date(createdAt).getTime();
  const end = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// ─────────────────────────────────────────────────────────────────
// HELPER: Emoji ngắn gọn cho status/conclusion
// ─────────────────────────────────────────────────────────────────

function statusEmoji(status, conclusion) {
  if (status === "queued") return "🟡 queued";
  if (status === "in_progress") return "🔵 in_progress";
  if (status === "completed") {
    if (conclusion === "success") return "✅ success";
    if (conclusion === "failure") return "❌ failure";
    if (conclusion === "cancelled") return "⚪ cancelled";
    if (conclusion === "skipped") return "⏭ skipped";
    return `✅ ${conclusion || "completed"}`;
  }
  return status || "-";
}

// ─────────────────────────────────────────────────────────────────
// 1. Lấy danh sách workflows
// ─────────────────────────────────────────────────────────────────

function fetchWorkflows(repo, account) {
  const result = spawn("gh", ["workflow", "list", "--repo", repo, "--all", "--json", "name,state,path,id"], { env: ghEnv(account) });

  if (!result.ok) {
    throw new Error(`${LOG} Không lấy được danh sách workflow: ${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${LOG} Không parse được JSON workflow: ${result.stdout}`);
  }
}

async function listWorkflows(repo, account) {
  console.log(`\n${LOG} Đang lấy danh sách workflows: ${repo}`);

  let workflows;
  try {
    workflows = fetchWorkflows(repo, account);
  } catch (e) {
    console.error(e.message);
    return [];
  }

  if (workflows.length === 0) {
    console.log(`${LOG} Repo chưa có workflow nào.`);
    return [];
  }

  console.log(`\n  Workflows (${workflows.length}):\n`);
  console.log(`    ${"Tên".padEnd(40)} ${"State".padEnd(10)} Path`);
  console.log(`    ${"─".repeat(40)} ${"─".repeat(10)} ${"─".repeat(30)}`);

  workflows.forEach((w, i) => {
    const stateLabel = w.state === "active" ? "🟢 active" : "🔴 disabled";
    console.log(`    [${String(i + 1).padStart(2)}]  ${String(w.name || "").padEnd(36)} ${stateLabel.padEnd(14)} ${w.path || ""}`);
  });

  return workflows;
}

// ─────────────────────────────────────────────────────────────────
// Chọn workflow từ danh sách
// ─────────────────────────────────────────────────────────────────

async function pickWorkflow(repo, account) {
  let workflows;
  try {
    workflows = fetchWorkflows(repo, account);
  } catch (e) {
    console.error(e.message);
    return null;
  }

  if (workflows.length === 0) {
    console.log(`${LOG} Repo chưa có workflow nào.`);
    return null;
  }

  const idx = await selectMenu(
    `Chọn workflow — ${repo}`,
    workflows.map((w) => ({
      label: `${String(w.name || "").padEnd(40)} [${w.state === "active" ? "🟢 active" : "🔴 disabled"}]  ${w.path || ""}`,
    })),
  );

  if (idx === -1) return null;
  return workflows[idx];
}

// ─────────────────────────────────────────────────────────────────
// 2. Xem runs gần nhất của một workflow
// ─────────────────────────────────────────────────────────────────

async function viewRecentRuns(repo, account) {
  const workflow = await pickWorkflow(repo, account);
  if (!workflow) return;

  const limitStr = await ask("  Số run muốn xem", "10");
  const limit = parseInt(limitStr, 10) || 10;

  console.log(`\n${LOG} Đang lấy ${limit} run gần nhất của: ${workflow.name}`);

  const result = spawn(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      String(workflow.id),
      "--repo",
      repo,
      "--limit",
      String(limit),
      "--json",
      "databaseId,status,conclusion,headBranch,createdAt,updatedAt,displayTitle,number",
    ],
    { env: ghEnv(account) },
  );

  if (!result.ok) {
    console.error(`${LOG} Lỗi: ${result.stderr}`);
    return;
  }

  let runs;
  try {
    runs = JSON.parse(result.stdout);
  } catch {
    console.error(`${LOG} Không parse được JSON runs.`);
    return;
  }

  if (runs.length === 0) {
    console.log(`${LOG} Workflow chưa có run nào.`);
    return;
  }

  console.log(`\n  Runs gần nhất (${runs.length}):\n`);
  console.log(`    ${"#".padEnd(6)} ${"Branch".padEnd(22)} ${"Status".padEnd(20)} ${"Duration".padEnd(10)} Title`);
  console.log(`    ${"─".repeat(6)} ${"─".repeat(22)} ${"─".repeat(20)} ${"─".repeat(10)} ${"─".repeat(20)}`);

  runs.forEach((r, i) => {
    const runNum = `#${r.number || r.databaseId}`;
    const branch = (r.headBranch || "").slice(0, 20);
    const statusStr = statusEmoji(r.status, r.conclusion);
    const duration = formatDuration(r.createdAt, r.status === "completed" ? r.updatedAt : null);
    const title = (r.displayTitle || "").slice(0, 35);

    console.log(
      `    [${String(i + 1).padStart(2)}]  ${runNum.padEnd(8)} ${branch.padEnd(22)} ${statusStr.padEnd(20)} ${duration.padEnd(10)} ${title}`,
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// Lấy danh sách runs để chọn (dùng chung cho viewRunDetail, viewLog)
// ─────────────────────────────────────────────────────────────────

async function pickRun(repo, account, workflow, limit = 10) {
  const result = spawn(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      String(workflow.id),
      "--repo",
      repo,
      "--limit",
      String(limit),
      "--json",
      "databaseId,status,conclusion,headBranch,createdAt,updatedAt,number,displayTitle",
    ],
    { env: ghEnv(account) },
  );

  if (!result.ok) {
    console.error(`${LOG} Lỗi lấy runs: ${result.stderr}`);
    return null;
  }

  let runs;
  try {
    runs = JSON.parse(result.stdout);
  } catch {
    console.error(`${LOG} Không parse được JSON runs.`);
    return null;
  }

  if (runs.length === 0) {
    console.log(`${LOG} Workflow chưa có run nào.`);
    return null;
  }

  const idx = await selectMenu(
    `Chọn run — ${workflow.name}`,
    runs.map((r) => {
      const runNum = `#${r.number || r.databaseId}`;
      const branch = (r.headBranch || "").slice(0, 18);
      const statusStr = statusEmoji(r.status, r.conclusion);
      const duration = formatDuration(r.createdAt, r.status === "completed" ? r.updatedAt : null);
      return {
        label: `${runNum.padEnd(8)} ${branch.padEnd(20)} ${statusStr.padEnd(20)} ${duration.padEnd(10)} ${(r.displayTitle || "").slice(0, 35)}`,
      };
    }),
  );

  if (idx === -1) return null;
  return runs[idx];
}

// ─────────────────────────────────────────────────────────────────
// 3. Xem chi tiết một run (jobs + duration)
// ─────────────────────────────────────────────────────────────────

async function viewRunDetail(repo, account) {
  const workflow = await pickWorkflow(repo, account);
  if (!workflow) return;

  const run = await pickRun(repo, account, workflow);
  if (!run) return;

  console.log(`\n${LOG} Chi tiết run #${run.number || run.databaseId} — ${workflow.name}`);

  const result = spawn("gh", ["run", "view", String(run.databaseId), "--repo", repo, "--json", "jobs"], { env: ghEnv(account) });

  if (!result.ok) {
    console.error(`${LOG} Lỗi: ${result.stderr}`);
    return;
  }

  let detail;
  try {
    detail = JSON.parse(result.stdout);
  } catch {
    console.error(`${LOG} Không parse được JSON run detail.`);
    return;
  }

  const jobs = detail.jobs || [];

  if (jobs.length === 0) {
    console.log(`${LOG} Run chưa có job nào.`);
    return;
  }

  console.log(`\n  Jobs (${jobs.length}):\n`);
  console.log(`    ${"Tên Job".padEnd(40)} ${"Status".padEnd(22)} Duration`);
  console.log(`    ${"─".repeat(40)} ${"─".repeat(22)} ${"─".repeat(10)}`);

  jobs.forEach((job, i) => {
    const name = (job.name || "").slice(0, 38);
    const statusStr = statusEmoji(job.status, job.conclusion);
    const duration = formatDuration(job.startedAt || job.createdAt, job.completedAt || null);
    console.log(`    [${String(i + 1).padStart(2)}]  ${name.padEnd(36)} ${statusStr.padEnd(22)} ${duration}`);
  });

  console.log("");
}

// ─────────────────────────────────────────────────────────────────
// 4. Kích hoạt chạy workflow (workflow_dispatch)
// ─────────────────────────────────────────────────────────────────

async function triggerWorkflow(repo, account) {
  const workflow = await pickWorkflow(repo, account);
  if (!workflow) return;

  const branch = await ask("  Branch để chạy", "main");
  if (!branch) {
    console.log("  Hủy.");
    return;
  }

  console.log(`\n${LOG} Workflow: ${workflow.name}`);
  console.log(`${LOG} Branch  : ${branch}`);

  const ok = await confirm(`  Xác nhận trigger workflow?`, true);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  const result = spawn("gh", ["workflow", "run", String(workflow.id), "--repo", repo, "--ref", branch], { env: ghEnv(account) });

  if (!result.ok) {
    console.error(`${LOG} ✗ Trigger thất bại: ${result.stderr}`);
    console.error(`${LOG} Gợi ý: Kiểm tra workflow có khai báo trigger on: workflow_dispatch không.`);
    return;
  }

  console.log(`${LOG} ✓ Đã trigger workflow: ${workflow.name} trên branch ${branch}`);

  const watch = await confirm("  Theo dõi run mới ngay bây giờ?", false);
  if (!watch) return;

  // Chờ 3 giây để run kịp xuất hiện
  console.log(`${LOG} Chờ run khởi động...`);
  await new Promise((r) => setTimeout(r, 3000));

  const runsResult = spawn(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      String(workflow.id),
      "--repo",
      repo,
      "--limit",
      "1",
      "--json",
      "databaseId,status,conclusion,headBranch,number,displayTitle",
    ],
    { env: ghEnv(account) },
  );

  if (!runsResult.ok) {
    console.error(`${LOG} Không lấy được run mới: ${runsResult.stderr}`);
    return;
  }

  let latestRuns;
  try {
    latestRuns = JSON.parse(runsResult.stdout);
  } catch {
    return;
  }

  if (!latestRuns || latestRuns.length === 0) {
    console.log(`${LOG} Chưa thấy run mới. Thử kiểm tra lại sau.`);
    return;
  }

  const latest = latestRuns[0];
  console.log(`\n${LOG} Run mới nhất:`);
  console.log(`  Run #${latest.number || latest.databaseId}  ${statusEmoji(latest.status, latest.conclusion)}  ${latest.displayTitle || ""}`);
  console.log(`  https://github.com/${repo}/actions/runs/${latest.databaseId}`);
}

// ─────────────────────────────────────────────────────────────────
// 5. Bật / Tắt workflow
// ─────────────────────────────────────────────────────────────────

async function toggleWorkflow(repo, account) {
  const workflow = await pickWorkflow(repo, account);
  if (!workflow) return;

  const isActive = workflow.state === "active";
  const action = isActive ? "disable" : "enable";
  const actionLabel = isActive ? "🔴 Tắt (disable)" : "🟢 Bật (enable)";

  const ok = await confirm(`  ${actionLabel} workflow "${workflow.name}"?`, false);
  if (!ok) {
    console.log("  Hủy.");
    return;
  }

  const result = spawn("gh", ["workflow", action, String(workflow.id), "--repo", repo], { env: ghEnv(account) });

  if (!result.ok) {
    console.error(`${LOG} ✗ ${action} thất bại: ${result.stderr}`);
    return;
  }

  console.log(`${LOG} ✓ Đã ${action} workflow: ${workflow.name}`);
}

// ─────────────────────────────────────────────────────────────────
// 6. Xem log của một run
// ─────────────────────────────────────────────────────────────────

async function viewRunLog(repo, account) {
  const workflow = await pickWorkflow(repo, account);
  if (!workflow) return;

  const run = await pickRun(repo, account, workflow);
  if (!run) return;

  console.log(`\n${LOG} Đang tải log run #${run.number || run.databaseId}...`);

  const result = spawn("gh", ["run", "view", String(run.databaseId), "--log", "--repo", repo], { env: ghEnv(account) });

  if (!result.ok) {
    console.error(`${LOG} ✗ Không lấy được log: ${result.stderr}`);
    return;
  }

  if (!result.stdout) {
    console.log(`${LOG} Log rỗng hoặc run chưa hoàn thành.`);
    return;
  }

  const lines = result.stdout.split("\n");
  const MAX_LINES = 100;

  if (lines.length > MAX_LINES) {
    console.log(`\n${LOG} Log có ${lines.length} dòng — hiển thị ${MAX_LINES} dòng cuối:\n`);
    console.log(`... (${lines.length - MAX_LINES} dòng đầu bị ẩn)\n`);
    console.log(lines.slice(-MAX_LINES).join("\n"));
  } else {
    console.log(`\n${LOG} Log (${lines.length} dòng):\n`);
    console.log(result.stdout);
  }
}

// ─────────────────────────────────────────────────────────────────
// MENU chính
// ─────────────────────────────────────────────────────────────────

async function run(repo, account) {
  while (true) {
    const idx = await selectMenu(`Actions — ${repo}`, [
      { label: "Xem danh sách workflows" },
      { label: "Xem runs gần nhất của một workflow" },
      { label: "Xem chi tiết một run (jobs + duration)" },
      { label: "Kích hoạt chạy workflow (workflow_dispatch)" },
      { label: "Bật / Tắt workflow" },
      { label: "Xem log của một run" },
    ]);

    if (idx === -1) break;

    if (idx === 0) await listWorkflows(repo, account);
    if (idx === 1) await viewRecentRuns(repo, account);
    if (idx === 2) await viewRunDetail(repo, account);
    if (idx === 3) await triggerWorkflow(repo, account);
    if (idx === 4) await toggleWorkflow(repo, account);
    if (idx === 5) await viewRunLog(repo, account);
  }
}

module.exports = { run };
