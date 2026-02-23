import { defineConfig, devices } from '@playwright/test';

const e2eEnv = process.env.E2E_ENV === 'prod' ? 'prod' : 'dev';
const e2ePort = process.env.E2E_PORT ?? (e2eEnv === 'prod' ? '4175' : '4174');
const webServerCommand =
  e2eEnv === 'prod'
    ? `npm run build && npm run preview -- --host 127.0.0.1 --port ${e2ePort}`
    : `npm run dev -- --host 127.0.0.1 --port ${e2ePort}`;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
    headless: true
  },
  webServer: {
    command: webServerCommand,
    url: e2eBaseUrl,
    timeout: 180000,
    reuseExistingServer: false
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
