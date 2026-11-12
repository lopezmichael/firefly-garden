import { createLocalPlatform } from './local.ts';
import type { Platform } from './platform.ts';
import { createTestPlatform } from './test.ts';

export type { Platform } from './platform.ts';
export type { AdOutcome, TestPlatform } from './test.ts';

/**
 * Picks the adapter for this build. Portal adapters are added in Phase 3. The
 * end-to-end build (`vite build --mode e2e`) gets the scriptable test adapter;
 * the mode is a build-time constant, so production bundles drop that branch.
 */
export function createPlatform(): Platform {
  if (import.meta.env.MODE === 'e2e') return createTestPlatform();
  return createLocalPlatform();
}
