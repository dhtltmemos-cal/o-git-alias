// services/bom/index.js — Subcommand `ocli bom`
// Flow: quét cwd đệ quy → liệt kê file có UTF-16 LE BOM → hỏi xác nhận → ghi lại không BOM

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { confirm } = require("../../lib/prompt");

const LOG = "[bom]";
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "out",
  "coverage",
  ".cache",
  ".turbo",
  ".parcel-cache",
  "__pycache__",
  ".venv",
]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const PROGRESS_EVERY_MS = 1000;

function hasBom(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(2);
    return fs.readSync(fd, buf, 0, 2, 0) === 2 && buf.equals(UTF16_LE_BOM);
  } finally {
    fs.closeSync(fd);
  }
}

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

function rel(rootDir, filePath) {
  return path.relative(rootDir, filePath) || ".";
}

function createProgress(label) {
  const start = Date.now();
  let last = 0;
  return {
    tick(message, force = false) {
      const now = Date.now();
      if (!force && now - last < PROGRESS_EVERY_MS) return;
      last = now;
      console.log(`${LOG} ${label}: ${message} (${((now - start) / 1000).toFixed(1)}s)`);
    },
    done(message) {
      const now = Date.now();
      console.log(`${LOG} ${label}: ${message} (${((now - start) / 1000).toFixed(1)}s)`);
    },
  };
}

function scanBomFiles(rootDir) {
  const found = [];
  const progress = createProgress("walk");
  let dirs = 0;
  let files = 0;

  function walk(dir) {
    dirs++;
    progress.tick(`${dirs} thư mục, ${files} file, đang ở ${rel(rootDir, dir)}`);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const filePath = path.join(dir, entry.name);
        files++;
        try {
          if (hasBom(filePath)) found.push(filePath);
        } catch {
          console.log(`${LOG} Bỏ qua file không đọc được: ${rel(rootDir, filePath)}`);
        }
      }
    }
  }

  walk(rootDir);
  progress.done(`${dirs} thư mục, ${files} file, thấy ${found.length} BOM`);
  return found;
}

function gitCandidateFiles(rootDir) {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: rootDir,
    encoding: "buffer",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((rel) => path.join(rootDir, rel));
}

function findGitRepos(rootDir) {
  const repos = [];
  const progress = createProgress("repo-scan");
  let dirs = 0;

  function walk(dir) {
    dirs++;
    progress.tick(`${dirs} thư mục, thấy ${repos.length} repo, đang ở ${rel(rootDir, dir)}`);

    const isRepo = fs.existsSync(path.join(dir, ".git"));
    if (isRepo) {
      repos.push(dir);
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== ".git" && !shouldSkipDir(entry.name)) walk(path.join(dir, entry.name));
    }
  }

  walk(rootDir);
  progress.done(`${dirs} thư mục, thấy ${repos.length} repo`);
  return repos;
}

function gitReposCandidateFiles(rootDir) {
  const repos = findGitRepos(rootDir);
  if (repos.length === 0) return null;

  const candidates = [];
  const seen = new Set();
  const progress = createProgress("git-list");

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    progress.tick(`[${i + 1}/${repos.length}] ${rel(rootDir, repo)}`, true);
    const files = gitCandidateFiles(repo);
    if (!files) continue;
    for (const file of files) {
      const key = path.resolve(file).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(file);
      }
    }
  }

  progress.done(`${repos.length} repo, ${candidates.length} file candidate`);
  return candidates;
}

function scanBomCandidates(rootDir, files) {
  const found = [];
  const progress = createProgress("bom-check");
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    progress.tick(`[${i + 1}/${files.length}] ${rel(rootDir, filePath)}, thấy ${found.length} BOM`);
    try {
      if (fs.statSync(filePath).isFile() && hasBom(filePath)) found.push(filePath);
    } catch {
      console.log(`${LOG} Bỏ qua file không đọc được: ${rel(rootDir, filePath)}`);
    }
  }
  progress.done(`${files.length} file, thấy ${found.length} BOM`);
  return found;
}

function removeBom(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length >= 2 && data.subarray(0, 2).equals(UTF16_LE_BOM)) {
    fs.writeFileSync(filePath, data.subarray(2));
    return true;
  }
  return false;
}

async function run(args = []) {
  const cwd = process.cwd();
  console.log(`${LOG} Đang quét: ${cwd}`);

  const candidates = args.includes("--walk") ? null : gitReposCandidateFiles(cwd);
  if (candidates) console.log(`${LOG} Dùng git ls-files theo repo (${candidates.length} file candidate).`);
  const files = (candidates ? scanBomCandidates(cwd, candidates) : scanBomFiles(cwd)).sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    console.log(`${LOG} Không tìm thấy file có UTF-16 LE BOM.`);
    return;
  }

  console.log(`${LOG} Tìm thấy ${files.length} file có UTF-16 LE BOM:`);
  for (const file of files) console.log(`  - ${rel(cwd, file)}`);

  if (!(await confirm(`${LOG} Lưu lại các file trên sau khi remove BOM?`, false))) {
    console.log(`${LOG} Đã hủy, chưa ghi file nào.`);
    return;
  }

  let changed = 0;
  for (const file of files) {
    if (removeBom(file)) changed++;
  }
  console.log(`${LOG} Đã remove BOM: ${changed}/${files.length} file.`);
}

module.exports = { run, scanBomFiles, removeBom };
