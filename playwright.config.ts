import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60000,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: 'chrome', viewport: { width: 1100, height: 820 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: `npm run preview -- --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI },
});
