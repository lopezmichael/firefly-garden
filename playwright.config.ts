import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke test for the game (Phase 2 plan, decision 6). Runs against the
 * e2e build (`vite build --mode e2e`): the scriptable test platform adapter and
 * the `window.__ff` hooks exist only there, never in production.
 */
export default defineConfig({
  testDir: 'apps/game/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run build:e2e -w @firefly/game && npm run preview:e2e -w @firefly/game',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
