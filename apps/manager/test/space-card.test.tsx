// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { IdentitySummary } from "@mortal/schema";
import { SpaceCard, spaceLabel } from "../src/components/SpaceCard.js";

afterEach(cleanup);

const base: IdentitySummary = {
  id: "idn_abc123def456ghi789jkl",
  name: "client acme",
  state: "created",
  color: "#F59E0B",
  lifetime: "persistent",
  expiresAt: null,
  onExpiry: "archive",
  blueprint: null,
  lastLaunchedAt: null,
  storageBytes: 0,
  spaceNumber: 4,
};

describe("space card", () => {
  it("renders the numbered space label, name, and state", () => {
    render(<SpaceCard summary={base} />);
    expect(screen.getByText("space 004")).toBeTruthy();
    expect(screen.getByText("client acme")).toBeTruthy();
    expect(screen.getByTestId("state-pill").textContent).toBe("prepared");
    expect(screen.queryByTestId("countdown")).toBeNull();
  });

  it("shows a live countdown for finite lifetimes", () => {
    const now = Date.parse("2026-08-03T12:00:00.000Z");
    const summary: IdentitySummary = {
      ...base,
      id: "idn_xyz123def456ghi789jkl",
      name: "onchain investigator",
      lifetime: "5m",
      onExpiry: "destroy",
      state: "running",
      expiresAt: "2026-08-03T12:04:18.000Z",
      spaceNumber: 11,
    };
    render(<SpaceCard summary={summary} now={now} />);
    expect(screen.getByText("space 011")).toBeTruthy();
    expect(screen.getByTestId("countdown").textContent).toBe("04m 18s remaining");
    expect(screen.getByTestId("state-pill").textContent).toBe("active");
  });

  it("renders destroyed identities as closed, with no actions", () => {
    const summary: IdentitySummary = {
      ...base,
      id: "idn_ded123def456ghi789jkl",
      state: "destroyed",
      lifetime: "-",
    };
    render(<SpaceCard summary={summary} />);
    expect(screen.getByTestId("countdown").textContent).toBe("closed");
    expect(screen.queryByText("launch")).toBeNull();
    expect(screen.queryByText("destroy")).toBeNull();
  });

  it("pads space labels to three digits", () => {
    expect(spaceLabel(4)).toBe("space 004");
    expect(spaceLabel(17)).toBe("space 017");
    expect(spaceLabel(123)).toBe("space 123");
  });
});
