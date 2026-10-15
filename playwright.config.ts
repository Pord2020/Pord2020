import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const port = 3100;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    actionTimeout: 10000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `node --import tsx scripts/start.ts --port ${port}`,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      APP_URL: `http://localhost:${port}`,
      APP_MODE: 'sandbox',
      DATABASE_MODE: 'embedded',
      LOCAL_DATABASE_PATH: `/tmp/pilotlane-e2e-${Date.now()}`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
