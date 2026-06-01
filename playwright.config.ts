import { defineConfig, devices } from "@playwright/test";

const browserSimulationEnabled = process.env.PRAXIS_RUN_BROWSER_SIMULATION === "1";
const browserSimulationPort = Number(process.env.PRAXIS_STUDENT_SIM_BROWSER_PORT ?? 4177);
const browserSimulationUrl = `http://127.0.0.1:${browserSimulationPort}`;
const browserSimulationAppUrl = `${browserSimulationUrl}/browser-app.html`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /student-simulation-browser\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: browserSimulationUrl,
    ...devices["Desktop Chrome"],
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: browserSimulationEnabled
    ? {
        command: `pnpm --filter @praxis/ui exec vite --host 127.0.0.1 --port ${browserSimulationPort} ../../tests/student-simulation`,
        url: browserSimulationAppUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
});
