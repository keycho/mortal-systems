import { describe, expect, it } from "vitest";
import { ENFORCEMENT_TABLE, NON_GUARANTEES } from "@mortal/schema";
import { BLUEPRINT_CARDS, GUARANTEE_CELLS, PROOF_BAND } from "../lib/site-data";

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
