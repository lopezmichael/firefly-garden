import type { Platform } from './platform.ts';

const PREFIX = 'firefly-garden:';

/**
 * Development stand-in: no ads (they resolve immediately, rewarded ones
 * "succeed"), saves go to localStorage. Storage can be unavailable (private
 * mode, blocked site data), so every access is guarded.
 */
export function createLocalPlatform(): Platform {
  return {
    async init() {},
    gameplayStart() {},
    gameplayStop() {},
    async showMidgame() {},
    async showRewarded() {
      return true;
    },
    async save(key, value) {
      try {
        localStorage.setItem(PREFIX + key, value);
      } catch {
        // Storage unavailable: progress lives only for this session.
      }
    },
    async load(key) {
      try {
        return localStorage.getItem(PREFIX + key);
      } catch {
        return null;
      }
    },
  };
}
