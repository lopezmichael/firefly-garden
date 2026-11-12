import { createLocalPlatform } from './local.ts';
import type { Platform } from './platform.ts';

export type { Platform } from './platform.ts';

/** Picks the adapter for this build. Portal adapters are added in Phase 3. */
export function createPlatform(): Platform {
  return createLocalPlatform();
}
