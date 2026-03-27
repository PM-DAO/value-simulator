import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        "cd ../backend && PYTHONPATH=src uv run uvicorn simulator.api:app --port 8000",
      port: 8000,
      timeout: 60_000,
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- -p 3000",
      url: "http://localhost:3000",
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
});
