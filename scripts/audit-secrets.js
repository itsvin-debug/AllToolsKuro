import fs from 'fs';
import path from 'path';

// Direktori & file yang diabaikan dalam pemindaian kode sumber publik
const ignoreDirs = ['.git', 'node_modules', 'dist', '.kilo', '.gemini', 'brain', 'scratch'];
const patterns = [
  { name: 'Gemini Key pattern', regex: /AQ\.Ab[a-zA-Z0-9_\-]{15,}/i },
  { name: 'Nexadev Key assignment', regex: /NEXADEV_API_KEY\s*=\s*['"][^'"]+['"]/i },
  { name: 'Admin Password hardcoded', regex: /(?:ADMIN_PASSWORD|VITE_ADMIN_PASSWORD)\s*[:=]\s*['"][a-zA-Z0-9_\-\.\*\!]{4,}['"]/i },
  { name: 'Plaintext Hardcoded Password', regex: /['"]VINZ6767['"]/i },
  { name: 'Generic Secret assignment', regex: /(?:jwt_secret|kuro_secret|master_key)\s*[:=]\s*['"][a-zA-Z0-9_\-\.\*\!]{8,}['"]/i }
];

let alertCount = 0;

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name)) {
        scan(full);
      }
    } else if (entry.isFile()) {
      // Abaikan file .env lokal (rahasia lokal memang disimpan di .env yang di-git ignore)
      if (entry.name.startsWith('.env') && !entry.name.endsWith('.example')) {
        continue;
      }
      if (entry.name === 'audit-secrets.js' || entry.name === 'scan_secrets.py') {
        continue;
      }
      if (/\.(js|jsx|ts|tsx|py|json|html|md|yml|yaml)$/.test(entry.name) && !entry.name.endsWith('package-lock.json')) {
        const content = fs.readFileSync(full, 'utf8');
        for (const p of patterns) {
          if (p.regex.test(content)) {
            console.log(`[ALERT] ${p.name} -> ${full}`);
            alertCount++;
          }
        }
      }
    }
  }
}

console.log('--- Starting Codebase Secret Scan ---');
scan('.');
console.log(`--- Scan Finished: ${alertCount} alerts found ---`);
process.exit(alertCount > 0 ? 1 : 0);
