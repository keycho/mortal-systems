// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fieldLabel, renderBadge, renderPermissionRow } from "../src/sidepanel/ui.js";

/**
 * BADGE-1 (companion half): advisory and roadmap fields render visually
 * distinct enforcement badges — solid, outlined, dashed — so labels cannot
 * silently drift in the ui.
 */
describe("enforcement badges (companion)", () => {
  it("renders the three visually distinct variants", () => {
    for (const enforcement of ["enforced", "advisory", "roadmap"] as const) {
      const badge = renderBadge(enforcement);
      expect(badge.textContent).toBe(enforcement);
      expect(badge.className).toContain(`badge-${enforcement}`);
      expect(badge.dataset.enforcement).toBe(enforcement);
    }
  });

  it("renders permission rows with the field's own badge", () => {
    const row = renderPermissionRow({
      field: "permissions.email",
      value: "none",
      enforcement: "roadmap",
      description: "email aliasing is not built.",
    });
    const badge = row.querySelector('[data-testid="enforcement-badge"]');
    expect(badge?.className).toContain("badge-roadmap");
    expect(row.getAttribute("title")).toContain("not built");
  });

  it("adds the declaration disclaimer to non-none wallet rows", () => {
    const declared = renderPermissionRow({
      field: "permissions.wallet",
      value: "declared",
      enforcement: "advisory",
      description: "",
    });
    expect(declared.textContent).toContain("a declaration, not a technical control");
    const none = renderPermissionRow({
      field: "permissions.wallet",
      value: "none",
      enforcement: "advisory",
      description: "",
    });
    expect(none.textContent).not.toContain("a declaration");
  });

  it("shortens field labels for display", () => {
    expect(fieldLabel("permissions.memoryScope")).toBe("memoryScope");
    expect(fieldLabel("privacy.retainHistory")).toBe("retainHistory");
  });
});
