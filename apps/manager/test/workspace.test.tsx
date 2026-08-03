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
import { IdentityNavigator } from "../src/components/IdentityNavigator.js";
import {
  FilesInspector,
  IdentityWorkspace,
  ReceiptInspector,
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

function renderWorkspace(d: WorkspaceData, onDestroy: (id: string) => void = noop) {
  return render(
    <IdentityWorkspace
      data={d}
      status={status}
      onLaunch={noop}
      onSuspend={noop}
      onResume={noop}
      onExpireNow={noop}
      onDestroy={onDestroy}
    />
  );
}

describe("identity workspace (three-pane)", () => {
  it("defaults the inspector to the browser tab and stays honest about what rpc cannot show", () => {
    renderWorkspace(data);
    // browser inspector: honest about unavailable url/title/screenshot
    expect(screen.getByText(/active url, page title and screenshots are not exposed/)).toBeTruthy();
    // focus action exists but is disabled, never fake
    const focus = screen.getByRole("button", { name: "focus browser window" });
    expect((focus as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "files" }));
    expect(screen.getByTestId("cannot-read").textContent).toContain(
      "no rpc method exposes their contents"
    );

    fireEvent.click(screen.getByRole("tab", { name: "memory" }));
    expect(screen.getByTestId("cannot-read").textContent).toContain("notes or ai messages");

    fireEvent.click(screen.getByRole("tab", { name: "receipt" }));
    expect(screen.getByTestId("no-receipt").textContent).toContain("has not been destroyed");
  });

  it("requires an explicit confirm before destroy fires", () => {
    let destroyed: string | null = null;
    renderWorkspace(data, (id) => {
      destroyed = id;
    });
    fireEvent.click(screen.getByRole("button", { name: "destroy" }));
    expect(destroyed).toBeNull();
    expect(screen.getByText(/this cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "destroy" })[1] as HTMLElement);
    expect(destroyed).toBe(summary.id);
  });
});

describe("files inspector", () => {
  it("shows the managed partition boundary from the real runtime root", () => {
    render(<FilesInspector data={data} status={status} />);
    expect(screen.getByText("4096 bytes on disk")).toBeTruthy();
    // paths are abbreviated by default; the full path is preserved for copy/title
    expect(screen.getByTitle(`${status.root}/files/${summary.id}`)).toBeTruthy();
    expect(screen.getByTitle(`${status.root}/companion-instances/${summary.id}`)).toBeTruthy();
  });
});

describe("receipt inspector", () => {
  it("renders the receipt with summary, steps, caveats and export actions", () => {
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
      <ReceiptInspector
        data={{ summary: { ...summary, state: "destroyed" }, manifest: null, events }}
      />
    );
    expect(screen.getByTestId("destruction-report")).toBeTruthy();
    expect(screen.getAllByTestId("caveat")).toHaveLength(DESTRUCTION_CAVEATS.length);
    expect(screen.getByText("processes stopped")).toBeTruthy();
    expect(screen.getByText("journal finalized")).toBeTruthy();
    expect(screen.getByRole("button", { name: "copy receipt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "export json" })).toBeTruthy();
  });
});

describe("identity navigator", () => {
  const identities: IdentitySummary[] = [
    { ...summary, id: "idn_run111111111111111111", name: "onchain investigator", state: "running", lifetime: "45m", expiresAt: "2026-08-03T13:00:00.000Z", onExpiry: "destroy" },
    summary,
    { ...summary, id: "idn_ded111111111111111111", name: "old research", state: "destroyed" },
  ];

  it("groups identities and marks running browsers", () => {
    render(
      <IdentityNavigator
        identities={identities}
        status={status}
        view="identities"
        selectedId={null}
        onSelect={noop}
        onNavigate={noop}
        onNewIdentity={noop}
      />
    );
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByText("persistent")).toBeTruthy();
    expect(screen.getByText("destroyed · receipts")).toBeTruthy();
    expect(screen.getByLabelText("browser running")).toBeTruthy();
  });

  it("filters by search and reports selection", () => {
    let selected: string | null = null;
    render(
      <IdentityNavigator
        identities={identities}
        status={status}
        view="identities"
        selectedId={null}
        onSelect={(id) => {
          selected = id;
        }}
        onNavigate={noop}
        onNewIdentity={noop}
      />
    );
    fireEvent.change(screen.getByLabelText("search identities"), {
      target: { value: "onchain" },
    });
    expect(screen.queryByText("client acme")).toBeNull();
    fireEvent.click(screen.getByText("onchain investigator"));
    expect(selected).toBe("idn_run111111111111111111");
  });
});
