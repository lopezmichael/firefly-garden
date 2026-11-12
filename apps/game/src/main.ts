import { buildBoard, parseLevel, solve } from '@firefly/core';
import { createPlatform } from './platform/index.ts';
import './theme.css';

// Phase 0 placeholder: proves the app builds against the core package and the
// platform adapter. The real board renderer arrives in Phase 2.
const SAMPLE = {
  id: 'phase0-sample', w: 4, h: 4, mask: ['####', '####', '####', '####'],
  bushes: [[1, 1, 3], [2, 2, 3]], twists: { lanterns: [[0, 0]] },
};

async function start(): Promise<void> {
  const platform = createPlatform();
  await platform.init();

  const board = buildBoard(parseLevel(SAMPLE));
  const result = solve(board);
  const root = document.getElementById('app');
  if (!root) return;

  const title = document.createElement('h1');
  title.textContent = 'Firefly Garden';
  const status = document.createElement('p');
  status.textContent = `Core loaded. Sample garden has ${result.count === 1 ? 'exactly one solution' : `${result.count}+ solutions`}.`;
  root.replaceChildren(title, status);
}

void start();
