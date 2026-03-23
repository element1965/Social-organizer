import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'packages', 'i18n', 'locales');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const keys = ['entryWarningTitle','entryWarningText','entryWarningProceed','entryWarningBack','notEnoughConnectionsTitle','notEnoughConnectionsText','connectionsRemaining','goToNetwork'];

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
  const missing = keys.filter(k => !d.create || !d.create[k]);
  if (missing.length) console.log(`${f}: MISSING ${missing.join(', ')}`);
  else console.log(`${f}: OK`);
}
