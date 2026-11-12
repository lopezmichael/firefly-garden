// Points git at scripts/hooks so the pre-commit check runs for everyone.
// Runs from `npm install` (prepare); skipped quietly outside a git checkout.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.git')) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', 'scripts/hooks'], { stdio: 'ignore' });
  } catch {
    console.warn('install-hooks: could not set core.hooksPath; run `git config core.hooksPath scripts/hooks` by hand.');
  }
}
