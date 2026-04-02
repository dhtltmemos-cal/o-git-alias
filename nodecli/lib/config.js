// lib/config.js — Parse .git-o-config (INI-style)
// Không có dependency ngoài, chỉ dùng Node built-ins.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Tìm .git-o-config theo thứ tự:
//   1. Cùng thư mục với nodecli/ (tức là thư mục cha của nodecli/)
//   2. Thư mục home
function resolveConfigPath() {
  // nodecli/ nằm trong thư mục gốc của o-alias repo
  const repoRoot = path.resolve(__dirname, '..', '..');
  const candidate = path.join(repoRoot, '.git-o-config');
  if (fs.existsSync(candidate)) return candidate;

  const homeCand = path.join(os.homedir(), '.git-o-config');
  if (fs.existsSync(homeCand)) return homeCand;

  return null;
}

/**
 * Parse .git-o-config → trả về mảng sections:
 * [{ section: 'github.com/myorg', token, user, header }]
 */
function parseConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const sections = [];
  let cur = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      cur = { section: sectionMatch[1], token: '', user: '', header: '' };
      sections.push(cur);
      continue;
    }

    if (!cur) continue;

    const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!kv) continue;

    const [, key, val] = kv;
    if (key === 'token')  cur.token  = val.trim();
    if (key === 'user')   cur.user   = val.trim();
    if (key === 'header') cur.header = val.trim();
  }

  return sections;
}

/**
 * Trả về toàn bộ sections từ config file.
 * Throw nếu không tìm thấy file.
 */
function loadSections() {
  const cfgPath = resolveConfigPath();
  if (!cfgPath) {
    throw new Error(
      '[config] Không tìm thấy .git-o-config.\n' +
      '  Tạo từ mẫu: cp .git-o-config.example .git-o-config'
    );
  }
  return { sections: parseConfig(cfgPath), filePath: cfgPath };
}

/**
 * Lọc các section thuộc một provider (theo hostname).
 * provider: 'github.com' | 'dev.azure.com' | ...
 */
function filterByProvider(sections, providerHost) {
  return sections.filter((s) => s.section.startsWith(providerHost));
}

/**
 * Trả về { host, owner, extra } từ section string.
 * VD: 'github.com/myorg'      → { host: 'github.com', owner: 'myorg', extra: '' }
 *     'dev.azure.com/org/proj' → { host: 'dev.azure.com', owner: 'org', extra: 'proj' }
 */
function parseSection(section) {
  const parts = section.split('/');
  return {
    host:  parts[0] || '',
    owner: parts[1] || '',
    extra: parts.slice(2).join('/'),
  };
}

module.exports = { loadSections, filterByProvider, parseSection, resolveConfigPath };
