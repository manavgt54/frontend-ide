import { defineConfig, devices } from '@playwright/test';

// Declare process for Node.js environment
declare const process: any;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests sequentially initially */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Single worker initially */
  workers: 1,
  /* Global timeout for all tests */
  timeout: 1200000, // 20 minutes
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['line']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
    /* Increase timeout for manual testing */
    actionTimeout: 60000,
    navigationTimeout: 120000,
    /* Allow localStorage access */
    permissions: ['clipboard-read', 'clipboard-write'],
    /* Disable security restrictions */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers - use Chrome for logged-in session */
  projects: [
    {
      name: 'chrome',
      use: { 
        ...devices['Desktop Chrome'],
        /* Enable developer tools and network monitoring */
        launchOptions: {
          devtools: true,
          headless: false, // Run in headed mode to see browser
          args: [
            '--enable-logging',
            '--v=1',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--enable-network-service-logging',
            '--log-level=0',
            '--enable-logging=stderr',
            '--vmodule=network_service=1',
            '--enable-network-service-logging',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--auto-open-devtools-for-tabs'
          ]
        }
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true, // Always reuse if available
    timeout: 60000, // Longer timeout for dev server
    ignoreHTTPSErrors: true,
  },

  /* Global setup to check backend availability */
  globalSetup: './tests/global-setup.js',
});
