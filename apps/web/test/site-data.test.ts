import { describe, expect, it } from "vitest";
import { ENFORCEMENT_TABLE, NON_GUARANTEES } from "@mortal/schema";
import {
  ALPHA_INSTALL_NOTE,
  BLUEPRINT_CARDS,
  BLUEPRINT_DISPLAY,
  GUARANTEE_CELLS,
  MACOS_ALPHA_DMG_URL,
  PLATFORMS,
  PROOF_BAND,
  USE_CASES,
} from "../lib/site-data";

/**
 * the landing page's curated cells are handoff copy, but their enforcement
 * claims must be the schema's. these tests make drift a build failure: a
 * test id shown as enforced must be a planned test of an enforced row, the
 * conditional cells must stay conditional, and the stated limits must
 * remain printed non-guarantees.
 */

const enforcedIds = new Set(
  ENFORCEMENT_TABLE.filter((r) => r.enforcement === "enforced").flatMap((r) => r.plannedTests)
);

describe("landing guarantee cells against the schema", () => {
  it("every enforced cell cites a planned test of an enforced control", () => {
    for (const cell of GUARANTEE_CELLS.filter((c) => c.tone === "enforced")) {
      expect(cell.id, cell.name).toBeTruthy();
      expect(enforcedIds.has(cell.id!), `${cell.name} cites ${cell.id}`).toBe(true);
    }
  });

  it("the network cell carries the network row's test id and its conditionality is real", () => {
    const row = ENFORCEMENT_TABLE.find((r) => r.field === "permissions.network");
    const cell = GUARANTEE_CELLS.find((c) => c.name === "network");
    expect(row?.enforcement).toBe("enforced");
    expect(row?.conditional).toBeDefined();
    expect(cell?.id).toBe(row?.plannedTests[0]);
    // the cell's copy must state both sides of the condition
    expect(cell?.desc).toContain("attached route");
    expect(cell?.desc).toContain("share your ip");
  });

  it("device fingerprint stays a stated non-guarantee, never enforced or advisory", () => {
    const cell = GUARANTEE_CELLS.find((c) => c.name === "device fingerprint");
    expect(cell?.tone).toBe("declared");
    expect(cell?.id).toBeNull();
    expect(NON_GUARANTEES.some((line) => line.includes("device fingerprint"))).toBe(true);
  });

  it("no cell invents a label the schema does not use", () => {
    for (const cell of GUARANTEE_CELLS) {
      expect(["enforced", "advisory", "declared"]).toContain(cell.tone);
    }
  });
});

describe("blueprint cards against the schema", () => {
  it("every enforced permission row cites a planned test of an enforced control", () => {
    for (const card of BLUEPRINT_CARDS) {
      for (const row of card.rows.filter((r) => r.tone === "enforced")) {
        expect(row.tid, `${card.name} · ${row.k}`).toBeTruthy();
        expect(enforcedIds.has(row.tid!), `${card.name} · ${row.k} cites ${row.tid}`).toBe(true);
      }
    }
  });

  it("advisory and declared rows never borrow a guarantee's test id", () => {
    for (const card of BLUEPRINT_CARDS) {
      for (const row of card.rows.filter((r) => r.tone !== "enforced")) {
        expect(row.tid, `${card.name} · ${row.k}`).toBeNull();
      }
    }
  });

  it("crypto never leads the gallery", () => {
    expect(BLUEPRINT_CARDS[0]!.name).not.toMatch(/chain|crypto|wallet/i);
  });

  it("landing display copy: crypto never leads, and no em dashes sneak in", () => {
    expect(BLUEPRINT_DISPLAY[0]!.name).not.toMatch(/chain|crypto|wallet/i);
    for (const b of BLUEPRINT_DISPLAY) expect(`${b.name} ${b.region}`).not.toContain("—");
    for (const u of USE_CASES) expect(`${u.label} ${u.body}`).not.toContain("—");
  });
});

describe("download alpha", () => {
  it("the solid macos card points at the stable release asset and admits it is unsigned", () => {
    const mac = PLATFORMS.find((p) => p.name === "macOS" && p.arch === "apple silicon");
    expect(mac?.href).toBe(MACOS_ALPHA_DMG_URL);
    // /releases/latest/download + a stable asset name: the url survives
    // version bumps as long as ci keeps emitting this exact filename
    expect(MACOS_ALPHA_DMG_URL).toBe(
      "https://github.com/keycho/mortal-systems/releases/latest/download/mortal-manager_macos_arm64.dmg"
    );
    expect(mac?.signed).toContain("unsigned");
  });

  it("cards without an artifact stay dashed (never a dead button)", () => {
    for (const p of PLATFORMS.filter((p) => !(p.name === "macOS" && p.arch === "apple silicon"))) {
      expect(p.href, `${p.name} ${p.arch}`).toBeNull();
    }
  });

  it("the install note states the unsigned posture and the right-click escape hatch", () => {
    expect(ALPHA_INSTALL_NOTE).toContain("alpha");
    expect(ALPHA_INSTALL_NOTE).toContain("unsigned");
    expect(ALPHA_INSTALL_NOTE).toContain("right-click");
    expect(ALPHA_INSTALL_NOTE).toContain("Open");
    expect(ALPHA_INSTALL_NOTE).not.toContain("—");
  });
});

describe("proof band", () => {
  it("prints a concrete verified test count, not a rounded claim", () => {
    expect(PROOF_BAND[0]).toMatch(/^\d+ tests$/);
    expect(PROOF_BAND[0]).not.toMatch(/\+|over|more than/);
  });

  it("does not claim shipped signed builds before one exists", () => {
    expect(PROOF_BAND.join(" · ")).not.toMatch(/^signed builds$|· signed builds ·/);
  });
});
