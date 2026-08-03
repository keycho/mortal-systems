// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeManifest,
  DESTRUCTION_CAVEATS,
  type ActivityEvent,
  type DestructionReport,
  type IdentitySummary,
} from "@mortal/schema";
import { EnforcementBadge } from "../src/components/EnforcementBadge.js";
import { ManifestView } from "../src/components/ManifestView.js";
import { ActivityLog } from "../src/components/ActivityLog.js";

afterEach(cleanup);

/**
 * BADGE-1 (manager half): the three enforcement levels render visually
 * distinct — solid, outlined, dashed — and cannot silently drift.
 */
describe("enforcement badge (manager)", () => {
  it("renders solid / outlined / dashed variants", () => {
    render(
      <>
        <EnforcementBadge enforcement="enforced" />
        <EnforcementBadge enforcement="advisory" />
        <EnforcementBadge enforcement="roadmap" />
      </>
    );
    const badges = screen.getAllByTestId("enforcement-badge");
    expect(badges).toHaveLength(3);
    const byLevel = new Map(badges.map((b) => [b.getAttribute("data-enforcement"), b.className]));
    expect(byLevel.get("enforced")).toContain("bg-ink");
    expect(byLevel.get("advisory")).toContain("border-ink");
    expect(byLevel.get("advisory")).not.toContain("bg-ink ");
    expect(byLevel.get("roadmap")).toContain("border-dashed");
  });
});

const summary: IdentitySummary = {
  id: "idn_abc123def456ghi789jkl",
  name: "crypto operations",
  state: "ready",
  color: "#FFB000",
  lifetime: "persistent",
  expiresAt: null,
  onExpiry: "archive",
  blueprint: null,
  lastLaunchedAt: null,
  storageBytes: 0,
  spaceNumber: 7,
};

describe("manifest view", () => {
  it("renders every permission with its enforcement badge", () => {
    const manifest = composeManifest({
      id: summary.id,
      name: summary.name,
      createdAt: "2026-08-03T12:00:00.000Z",
      color: "#FFB000",
      wallet: "declared",
    });
    render(<ManifestView summary={summary} manifest={manifest} />);
    const badges = screen.getAllByTestId("enforcement-badge");
    const levels = badges.map((b) => b.getAttribute("data-enforcement"));
    expect(levels.filter((l) => l === "enforced")).toHaveLength(3); // filesystem, memoryScope, retainHistory
    expect(levels.filter((l) => l === "advisory")).toHaveLength(2); // wallet, network
    expect(levels.filter((l) => l === "roadmap")).toHaveLength(2); // email, redaction
    // the wallet honesty line is present because the value is not "none"
    expect(screen.getByText("a declaration, not a technical control")).toBeTruthy();
  });

  it("renders a tombstone message for destroyed identities", () => {
    render(<ManifestView summary={{ ...summary, state: "destroyed" }} manifest={null} />);
    expect(screen.getByTestId("manifest-view").textContent).toContain("only the tombstone");
  });
});

describe("activity log", () => {
  it("renders the destruction report with all steps and caveats", () => {
    const report: DestructionReport = {
      identityId: summary.id,
      startedAt: "2026-08-03T12:00:00.000Z",
      completedAt: "2026-08-03T12:00:02.000Z",
      resumed: true,
      steps: (["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const).map((step) => ({
        step,
        ok: true,
        detail: `${step} done`,
      })),
      caveats: [...DESTRUCTION_CAVEATS],
    };
    const events: ActivityEvent[] = [
      {
        id: 2,
        identityId: summary.id,
        event: "destroyed",
        detail: { report: report as unknown as Record<string, unknown> } as never,
        createdAt: "2026-08-03T12:00:02.000Z",
      },
      {
        id: 1,
        identityId: summary.id,
        event: "created",
        detail: null,
        createdAt: "2026-08-03T11:00:00.000Z",
      },
    ];
    render(<ActivityLog events={events} />);
    expect(screen.getByTestId("destruction-report")).toBeTruthy();
    for (const step of ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"]) {
      expect(screen.getByTestId(`destroy-step-${step}`)).toBeTruthy();
    }
    expect(screen.getAllByTestId("caveat")).toHaveLength(DESTRUCTION_CAVEATS.length);
    expect(screen.getByTestId("destruction-report").textContent).toContain("resumed after interruption");
    expect(screen.getByTestId("event-created")).toBeTruthy();
  });

  it("renders scheduled expiry lines", () => {
    const events: ActivityEvent[] = [
      {
        id: 1,
        identityId: summary.id,
        event: "expiry_scheduled",
        detail: { fireAt: "2026-08-03T12:05:00.000Z", action: "destroy" },
        createdAt: "2026-08-03T12:00:00.000Z",
      },
    ];
    render(<ActivityLog events={events} />);
    expect(screen.getByTestId("event-expiry_scheduled").textContent).toContain("destroy");
  });
});
