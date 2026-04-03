// services/clip/index.js — Subcommand `ocli clip`
// Flow: đọc clipboard (Windows) → parse định dạng khối code có path → ghi file theo cwd

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, commandExists } = require('../../lib/shell');
const { selectMenu, confirm } = require('../../lib/prompt');

const LOG = '[clip]';

function readClipboardText() {
  if (process.platform === 'win32') {
    const ps = spawn('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw']);
    if (!ps.ok) {
      throw new Error(`${LOG} Không đọc được clipboard bằng PowerShell: ${ps.stderr}`);
    }
    return ps.stdout;
  }

  if (commandExists('pbpaste')) {
    const r = spawn('pbpaste', []);
    if (!r.ok) throw new Error(`${LOG} Không đọc được clipboard bằng pbpaste: ${r.stderr}`);
    return r.stdout;
  }

  if (commandExists('xclip')) {
    const r = spawn('xclip', ['-selection', 'clipboard', '-o']);
    if (!r.ok) throw new Error(`${LOG} Không đọc được clipboard bằng xclip: ${r.stderr}`);
    return r.stdout;
  }

  if (commandExists('xsel')) {
    const r = spawn('xsel', ['--clipboard', '--output']);
    if (!r.ok) throw new Error(`${LOG} Không đọc được clipboard bằng xsel: ${r.stderr}`);
    return r.stdout;
  }

  throw new Error(`${LOG} Hệ điều hành hiện tại không có công cụ đọc clipboard phù hợp.`);
}

function stripCodeFence(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines.length === 0) return '';

  if (lines[0].trim().startsWith('```')) lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim() === '```') lines.pop();

  return lines.join('\n').trim();
}

function collectPathCandidates(lines) {
  const candidates = [];
  for (const line of lines) {
    const m1 = line.match(/^\s*\/\/\s*(?:path|file)\s*:\s*(.+?)\s*$/i);
    if (m1 && m1[1]) {
      candidates.push(m1[1]);
      continue;
    }

    const m2 = line.match(/^\s*\/\/\s*([A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]+)\s*$/);
    if (m2 && m2[1]) {
      candidates.push(m2[1]);
    }
  }

  return [...new Set(candidates)];
}

function normalizePathInput(p) {
  const cleaned = p.trim().replace(/^['"]|['"]$/g, '');
  return cleaned.replace(/\\/g, path.sep).replace(/\//g, path.sep);
}

function extractPayload(clipboardText) {
  const normalized = stripCodeFence(clipboardText);
  if (!normalized) return null;

  const lines = normalized.split('\n');
  const first3 = lines.slice(0, 3);
  const candidates = collectPathCandidates(first3);

  if (candidates.length === 0) return null;

  return { lines, candidates };
}

async function choosePath(candidates) {
  if (candidates.length === 1) return candidates[0];

  const idx = await selectMenu(
    'Phát hiện nhiều path trong 3 dòng đầu, chọn nghiệp vụ ghi file',
    candidates.map((p) => ({ label: p }))
  );

  if (idx === -1) return null;
  return candidates[idx];
}

function removePathHeader(lines, selectedPath) {
  if (lines.length === 0) return lines;

  const firstLine = lines[0];
  const m = firstLine.match(/^\s*\/\/\s*(?:path|file)\s*:\s*(.+?)\s*$/i);
  if (!m) return lines;
  if (m[1].trim() !== selectedPath.trim()) return lines;

  return lines.slice(1);
}

function writeFileFromClipboard(selectedPath, lines) {
  const relativePath = normalizePathInput(selectedPath);
  const outPath = path.resolve(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const content = `${lines.join('\n').replace(/\s+$/g, '')}\n`;
  fs.writeFileSync(outPath, content, 'utf8');
  return outPath;
}

async function run() {
  while (true) {
    let clip;
    try {
      clip = readClipboardText();
    } catch (e) {
      console.error(e.message);
      return;
    }

    const payload = extractPayload(clip);
    if (!payload) {
      console.log(`${LOG} Clipboard không đúng định dạng nghiệp vụ (không tìm thấy path ở 3 dòng đầu).`);
    } else {
      const selectedPath = await choosePath(payload.candidates);
      if (selectedPath) {
        const bodyLines = removePathHeader(payload.lines, selectedPath);
        const outPath = writeFileFromClipboard(selectedPath, bodyLines);
        console.log(`${LOG} Đã ghi nội dung clipboard vào: ${outPath}`);
      } else {
        console.log(`${LOG} Hủy thao tác ghi file.`);
      }
    }

    const shouldContinue = await confirm('Bạn có muốn tiếp tục chạy nghiệp vụ ocli clip không?', true);
    if (!shouldContinue) break;
  }
}

module.exports = { run };
