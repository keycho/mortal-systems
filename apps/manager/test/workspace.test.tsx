// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeManifest,
  DESTRUCTION_CAVEATS,
  type ActivityEvent,
  type DestructionReport,
  type IdentitySummary,
  type RuntimeStatus,
} from "@mortal/schema";
import { Sidebar } from "../src/components/Sidebar.js";
import {
  FilesTab,
  IdentityWorkspace,
  ReceiptTab,
  type WorkspaceData,
} from "../src/views/IdentityWorkspace.js";

afterEach(cleanup);

const summary: IdentitySummary = {
  id: "idn_abc123def456ghi789jkl",
  name: "client acme",
  state: "ready",
  color: "#F59E0B",
  lifetime: "persistent",
  expiresAt: null,
  onExpiry: "archive",
  blueprint: null,
  lastLaunchedAt: null,
  storageBytes: 4096,
  spaceNumber: 4,
};

const manifest = composeManifest({
  id: summary.id,
  name: summary.name,
  createdAt: "2026-08-03T12:00:00.000Z",
  color: "#F59E0B",
});

const data: WorkspaceData = { summary, manifest, events: [] };

const status: RuntimeStatus = {
  version: "0.1.0",
  root: "/home/user/.mortal",
  port: 4923,
  pid: 1234,
  startedAt: "2026-08-03T12:00:00.000Z",
  browsers: [],
  defaultBrowser: null,
  identitiesRunning: 0,
  warnings: [],
};

const noop = () => {};

describe("identity workspace", () => {
  it("switches tabs and keeps every tab honest about unreadable data", () => {
    render(
      <IdentityWorkspace
        data={data}
        status={status}
        onBack={noop}
        onLaunch={noop}
        onSuspend={noop}
        onResume={noop}
        onExpireNow={noop}
        onDestroy={noop}
      />
    );
    // overview is the default tab
    expect(screen.getByText("show manifest json")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "files" }));
    expect(screen.getByText(`${status.root}/profiles/${summary.id}`)).toBeTruthy();
    expect(screen.getByTestId("cannot-read").textContent).toContain(
      "no rpc method exposes their contents"
    );

    fireEvent.click(screen.getByRole("tab", { name: "memory" }));
    expect(screen.getByTestId("cannot-read").textContent).toContain("notes or ai messages");

    fireEvent.click(screen.getByRole("tab", { name: "destruction receipt" }));
    expect(screen.getByTestId("no-receipt").textContent).toContain("has not been destroyed");
  });

  it("requires an explicit confirm before destroy fires", () => {
    let destroyed: string | null = null;
    render(
      <IdentityWorkspace
        data={data}
        status={status}
        onBack={noop}
        onLaunch={noop}
        onSuspend={noop}
        onResume={noop}
        onExpireNow={noop}
        onDestroy={(id) => {
          destroyed = id;
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "destroy" }));
    expect(destroyed).toBeNull();
    expect(screen.getByText(/this cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "destroy" })[1] as HTMLElement);
    expect(destroyed).toBe(summary.id);
  });
});

describe("files tab", () => {
  it("renders the partition paths from the real runtime root", () => {
    render(<FilesTab data={data} status={status} />);
    expect(screen.getByText(`${status.root}/files/${summary.id}`)).toBeTruthy();
    expect(screen.getByText(`${status.root}/companion-instances/${summary.id}`)).toBeTruthy();
    expect(screen.getByText("4096 bytes on disk")).toBeTruthy();
  });
});

describe("receipt tab", () => {
  it("renders the destruction report when the identity was destroyed", () => {
    const report: DestructionReport = {
      identityId: summary.id,
      startedAt: "2026-08-03T12:00:00.000Z",
      completedAt: "2026-08-03T12:00:02.000Z",
      resumed: false,
      steps: (["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const).map((step) => ({
        step,
        ok: true,
        detail: `${step} done`,
      })),
      caveats: [...DESTRUCTION_CAVEATS],
    };
    const events: ActivityEvent[] = [
      {
        id: 1,
        identityId: summary.id,
        event: "destroyed",
        detail: { report: report as unknown as Record<string, unknown> } as never,
        createdAt: "2026-08-03T12:00:02.000Z",
      },
    ];
    render(
      <ReceiptTab data={{ summary: { ...summary, state: "destroyed" }, manifest: null, events }} />
    );
    expect(screen.getByTestId("destruction-report")).toBeTruthy();
    expect(screen.getAllByTestId("caveat")).toHaveLength(DESTRUCTION_CAVEATS.length);
  });
});

describe("sidebar", () => {
  it("navigates between views and marks the current one", () => {
    let current = "overview";
    const { rerender } = render(
      <Sidebar view="overview" status={status} onNavigate={(v) => (current = v)} />
    );
    fireEvent.click(screen.getByRole("button", { name: "identities" }));
    expect(current).toBe("identities");
    rerender(<Sidebar view="identities" status={status} onNavigate={noop} />);
    expect(
      screen.getByRole("button", { name: "identities" }).getAttribute("aria-current")
    ).toBe("page");
  });
});
