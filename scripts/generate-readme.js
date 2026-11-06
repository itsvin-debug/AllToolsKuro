/**
 * scripts/generate-readme.js
 * Generator otomatis dokumentasi README.md Kuro Studio.
 * Memindai katalog fitur, pohon direktori, dan commit history terbaru.
 * Kebijakan Ketat: Zero Emoji Policy.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const CATALOG_PATH = path.join(ROOT_DIR, 'frontend', 'src', 'components', 'AiKuroWidget.jsx');

// Filter direktori yang diabaikan pada tree scanner
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.vercel',
  'dist',
  'build',
  'stitch_designs',
  '.gemini',
  'coverage',
  '.system_generated'
]);

// Ekstraksi katalog fitur dari AiKuroWidget.jsx
function parseFeaturesCatalog() {
  try {
    const content = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalogMatch = content.match(/const KURO_TOOLS_CATALOG = (\[[\s\S]*?\]);/);
    if (!catalogMatch) return [];
    
    // Evaluasi array JSON-like secara aman
    const rawArray = catalogMatch[1];
    const items = [];
    const blockRegex = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*tag:\s*'([^']+)',\s*desc:\s*'([^']+)'\s*\}/g;
    let match;
    while ((match = blockRegex.exec(rawArray)) !== null) {
      items.push({
        id: match[1],
        name: match[2],
        tag: match[3],
        desc: match[4]
      });
    }
    return items;
  } catch (err) {
    console.error('Gagal membaca katalog fitur:', err.message);
    return [];
  }
}

// Generate tabel markdown fitur
function generateFeaturesTable(items) {
  const headers = [
    '| ID Fitur | Nama Alat | Kategori | Ringkasan Fungsi Teknis | Status Mesin |',
    '|:---|:---|:---|:---|:---:|'
  ];

  const rows = items.map((item) => {
    return `| \`${item.id}\` | **${item.name}** | ${item.tag} | ${item.desc} | Aktif |`;
  });

  return [...headers, ...rows].join('\n');
}

// Generate pohon direktori
function generateDirectoryTree(dir, prefix = '', depth = 0, maxDepth = 2) {
  if (depth > maxDepth) return '';

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.env') && !e.name.startsWith('.DS_Store'))
      .sort((a, b) => {
        if (a.isDirectory() === b.isDirectory()) {
          return a.name.localeCompare(b.name);
        }
        return a.isDirectory() ? -1 : 1;
      });
  } catch {
    return '';
  }

  let lines = [];
  entries.forEach((entry, idx) => {
    const isLast = idx === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? '/' : ''}`);

    if (entry.isDirectory()) {
      const subTree = generateDirectoryTree(
        path.join(dir, entry.name),
        `${prefix}${childPrefix}`,
        depth + 1,
        maxDepth
      );
      if (subTree) lines.push(subTree);
    }
  });

  return lines.join('\n');
}

// Ekstraksi 5 commit git terbaru
function getGitChangelog() {
  try {
    const log = execSync('git log -n 5 --pretty=format:"- [%h] %s (%cd)" --date=short', {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    });
    return log.trim();
  } catch {
    return '- [initial] Setup awal repositori Kuro Studio';
  }
}

// Penggantian penanda dinamis pada berkas
function replaceMarker(content, markerName, replacement) {
  const startTag = `<!-- AUTO-${markerName}-START -->`;
  const endTag = `<!-- AUTO-${markerName}-END -->`;
  const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');
  return content.replace(regex, `${startTag}\n${replacement}\n${endTag}`);
}

// Eksekusi pembaruan
function run() {
  console.log('Memindai konfigurasi workspace Kuro Studio...');
  if (!fs.existsSync(README_PATH)) {
    console.error('File README.md tidak ditemukan.');
    process.exit(1);
  }

  let readme = fs.readFileSync(README_PATH, 'utf8');

  // 1. Fitur
  const features = parseFeaturesCatalog();
  const featuresTable = generateFeaturesTable(features);
  readme = replaceMarker(readme, 'FEATURES', featuresTable);

  // 2. Tree direktori
  const rawTree = generateDirectoryTree(ROOT_DIR, '', 0, 2);
  const treeBlock = `\`\`\`text\nAllToolsKuro/\n${rawTree}\n\`\`\``;
  readme = replaceMarker(readme, 'TREE', treeBlock);

  // 3. Changelog
  const changelog = getGitChangelog();
  readme = replaceMarker(readme, 'CHANGELOG', changelog);

  fs.writeFileSync(README_PATH, readme, 'utf8');
  console.log('Sinkronisasi README.md berhasil (Zero Emoji Policy diterapkan).');
}

run();
