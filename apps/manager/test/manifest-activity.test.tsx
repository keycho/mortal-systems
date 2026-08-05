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
import { PermissionRows } from "../src/components/PermissionRows.js";
import { ActivityLog } from "../src/components/ActivityLog.js";
import { PermissionsTab } from "../src/views/IdentityWorkspace.js";

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
    // text-led but visually unmistakable: ok-colored check / secondary info / muted dashed
    expect(byLevel.get("enforced")).toContain("text-ok");
    expect(byLevel.get("advisory")).toContain("text-sec");
    expect(byLevel.get("advisory")).not.toContain("border-dashed");
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

describe("permission rows (workspace permissions tab)", () => {
  it("renders every permission with its enforcement badge", () => {
    const manifest = composeManifest({
      id: summary.id,
      name: summary.name,
      createdAt: "2026-08-03T12:00:00.000Z",
      color: "#FFB000",
      wallet: "declared",
    });
    render(<PermissionRows manifest={manifest} />);
    const badges = screen.getAllByTestId("enforcement-badge");
    const levels = badges.map((b) => b.getAttribute("data-enforcement"));
    // browser isolation (structural), filesystem, memoryScope, retainHistory
    expect(levels.filter((l) => l === "enforced")).toHaveLength(4);
    expect(levels.filter((l) => l === "advisory")).toHaveLength(2); // wallet, network
    expect(levels.filter((l) => l === "roadmap")).toHaveLength(2); // email, redaction
    // the wallet honesty line is present because the value is not "none"
    expect(screen.getByText("a declaration, not a technical control")).toBeTruthy();
  });

  // the flip must not flatten: the network badge follows THIS identity's
  // manifest, not the table's ceiling.
  it("renders network enforced only for an identity with a route attached", () => {
    const routeless = composeManifest({
      id: summary.id,
      name: summary.name,
      createdAt: "2026-08-05T12:00:00.000Z",
      color: "#FFB000",
    });
    const { unmount } = render(<PermissionRows manifest={routeless} />);
    expect(screen.getByTestId("perm-permissions.network").textContent).toContain("advisory");
    unmount();

    const routed = composeManifest({
      id: summary.id,
      name: summary.name,
      createdAt: "2026-08-05T12:00:00.000Z",
      color: "#FFB000",
      networkRoute: { proxy: "http://127.0.0.1:8080", label: "test-route" },
    });
    render(<PermissionRows manifest={routed} />);
    expect(screen.getByTestId("perm-permissions.network").textContent).toContain("enforced");
  });

  it("renders a tombstone message for destroyed identities", () => {
    render(
      <PermissionsTab
        data={{ summary: { ...summary, state: "destroyed" }, manifest: null, events: [] }}
      />
    );
    expect(screen.getByTestId("tombstone").textContent).toContain("only the tombstone");
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
