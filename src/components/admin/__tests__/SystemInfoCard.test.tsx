import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemInfoCard from "../SystemInfoCard";
import { BUILD_INFO, buildLabel } from "@/lib/buildInfo";

describe("SystemInfoCard", () => {
  it("shows version, Thai last-update time, build id and the latest badge", () => {
    render(<SystemInfoCard />);
    expect(screen.getByTestId("build-version").textContent).toBe(`v${BUILD_INFO.version}`);
    expect(screen.getByTestId("build-id").textContent).toBe(buildLabel());
    expect(screen.getByTestId("build-updated-at").textContent).toMatch(/น\.$/);
    expect(screen.getByTestId("build-latest-badge")).toBeInTheDocument();
  });
});