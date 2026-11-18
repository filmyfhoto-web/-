import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUILD_INFO, envLabel } from "@/lib/buildInfo";

const stamp = readFileSync("src/components/common/BuildStamp.tsx", "utf8");
const define = readFileSync("build-info.define.ts", "utf8");
const versionPlugin = readFileSync("vite-plugin-pwa-version.ts", "utf8");
const viteConfig = readFileSync("vite.config.ts", "utf8");
const diagnostics = readFileSync("src/pages/Diagnostics.tsx", "utf8");

describe("build version + environment", () => {
  it("injects an environment at build time", () => {
    expect(define).toContain("__APP_ENV__");
    expect(BUILD_INFO.env.length).toBeGreaterThan(0);
  });

  it("labels every environment in Thai-friendly form", () => {
    expect(envLabel("production")).toBe("Production");
    expect(envLabel("preview")).toBe("Preview");
    expect(envLabel("whatever")).toBe("Development");
  });

  it("shows version, update time and environment on the build stamp", () => {
    expect(stamp).toContain('data-testid="build-stamp-version"');
    expect(stamp).toContain('data-testid="build-stamp-updated"');
    expect(stamp).toContain('data-testid="build-stamp-env"');
    expect(stamp).toContain('data-build-env');
  });

  it("serves /version.json in dev as well as in production builds", () => {
    expect(versionPlugin).toContain("versionEndpoint");
    expect(versionPlugin).toContain('server.middlewares.use("/version.json"');
    expect(viteConfig).toContain("versionEndpoint()");
  });

  it("diagnostics reports live connection health", () => {
    expect(diagnostics).toContain("runSystemHealth");
    for (const id of ["internet", "api", "database", "auth", "realtime"]) {
      expect(readFileSync("src/lib/systemHealth.ts", "utf8")).toContain(`id: "${id}"`);
    }
    expect(diagnostics).toContain('data-testid="diag-routes-link"');
  });
});