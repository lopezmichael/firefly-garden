// Claude Code PostToolUse hook: after an Edit/Write to a TypeScript file,
// typecheck the project that owns it. Exit code 2 sends the errors back to
// Claude so they get fixed in the same turn.
import { execFileSync } from 'node:child_process';
import { join, sep } from 'node:path';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

let file = '';
try {
  file = JSON.parse(input)?.tool_input?.file_path ?? '';
} catch {
  process.exit(0);
}
if (!/\.(ts|tsx|mts|cts)$/.test(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const project = file.includes(`${sep}packages${sep}core${sep}src${sep}`)
  ? 'packages/core/tsconfig.json'
  : file.includes(`${sep}apps${sep}game${sep}src${sep}`)
    ? 'apps/game/tsconfig.json'
    : 'tsconfig.tools.json';

try {
  execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', join(root, project)], { cwd: root, stdio: 'pipe' });
} catch (e) {
  process.stderr.write(`Typecheck failed (${project}):\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
  process.exit(2);
}
