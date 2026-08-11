import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 300000,
  expect: {
    timeout: 30000,
  },
  // Los tests de licencia manipulan una BD temporal compartida y corren en serie.
  fullyParallel: false,
  workers: 1,
  webServer: [
    {
      // Fastify local de la app sobre una BD temporal (owner E2ETEST en trial).
      command: 'node --import tsx scripts/start-test-server.mjs',
      url: 'http://127.0.0.1:4173/api/license/status',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        channel: 'chrome',
      },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});