import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "browser.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  reporter: [
    ["list"],
    ["json", { outputFile: "evidence/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4181",
    channel: "chrome",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "node_modules/.bin/tsx scripts/browser-server.ts",
    url: "http://127.0.0.1:4181/api/health",
    reuseExistingServer: false,
    timeout: 15000,
  },
});
