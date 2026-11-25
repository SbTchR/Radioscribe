import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  timeout: 50000,
  workers: 1,
  use: {
    baseURL: process.env.RADIO_TEST_URL || "http://127.0.0.1:4182",
    channel: process.env.CI ? "chromium" : "chrome",
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.RADIO_TEST_URL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4182",
        url: "http://127.0.0.1:4182",
        reuseExistingServer: true,
      },
});
