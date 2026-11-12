// Fails if the production build exceeds the Poki initial-download budget.
// Run after `npm run build`. The budget is a ratchet: do not raise it.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'apps/game/dist';
const BUDGET_BYTES = 8_000_000; // Poki: under 8 MB initial download

function total(dir) {
  return readdirSync(dir).reduce((sum, name) => {
    const p = join(dir, name);
    const s = statSync(p);
    return sum + (s.isDirectory() ? total(p) : s.size);
  }, 0);
}

let size;
try {
  size = total(DIST);
} catch {
  console.error(`check-bundle-size: ${DIST} not found; run \`npm run build\` first.`);
  process.exit(1);
}
const mb = (b) => (b / 1_000_000).toFixed(2);
if (size > BUDGET_BYTES) {
  console.error(`Bundle is ${mb(size)} MB, over the ${mb(BUDGET_BYTES)} MB budget.`);
  process.exit(1);
}
console.log(`Bundle is ${mb(size)} MB (budget ${mb(BUDGET_BYTES)} MB).`);
