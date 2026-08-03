// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlueprintManifest, BlueprintSummary } from "@mortal/schema";
import { BlueprintsPanel } from "../src/components/BlueprintsPanel.js";

afterEach(cleanup);

const summary: BlueprintSummary = {
  id: "bpt_abc123def456ghi789jkl",
  name: "Crypto Operations",
  version: "1.0.0",
  description: "wallet: declared is a declaration, not a technical control.",
  category: "crypto",
  recommendedLifetime: "persistent",
  theme: "#FFB000",
  publisher: "mortal.first-party",
  reviewTier: "standard",
  source: "first-party:crypto-operations",
  signed: false,
  installedAt: "2026-08-03T12:00:00.000Z",
};

const manifest: BlueprintManifest = {
  schemaVersion: "2.0",
  blueprintVersion: "1.0.0",
  name: "Crypto Operations",
  description: "wallet: declared is a declaration, not a technical control.",
  category: "crypto",
  recommendedLifetime: "persistent",
  theme: "#FFB000",
  bookmarks: [
    { title: "Etherscan", url: "https://etherscan.io" },
    { title: "Sketchy", url: "https://xn--pple-43d.com/x" },
  ],
  recommendedExtensions: [{ id: "nkbihfbeogaeaoehlefnkodbefgpgknn", name: "MetaMask" }],
  ai: { systemInstructions: "never ask for seed phrases." },
  permissions: {
    wallet: { value: "declared", enforcement: "advisory" },
    email: { value: "none", enforcement: "roadmap" },
  },
  privacy: { retainHistory: { value: true, enforcement: "enforced" } },
  publisher: { id: "mortal.first-party", reviewTier: "standard" },
};

describe("blueprint install preview + consent", () => {
  it("renders the full preview: badges, unsigned marker, punycode warning, consent boxes", async () => {
    render(
      <BlueprintsPanel
        blueprints={[summary]}
        onLoadManifest={async () => manifest}
        onCreate={async () => {}}
      />
    );
    screen.getByText("preview + install").click();
    await waitFor(() => expect(screen.getByTestId("blueprint-preview")).toBeTruthy());

    expect(screen.getAllByTestId("unsigned-badge").length).toBeGreaterThan(0);
    const badges = screen.getAllByTestId("enforcement-badge").map((b) => b.getAttribute("data-enforcement"));
    expect(badges).toContain("advisory");
    expect(badges).toContain("roadmap");
    expect(badges).toContain("enforced");
    expect(screen.getByText("a declaration, not a technical control")).toBeTruthy();
    expect(screen.getByTestId("punycode-warning")).toBeTruthy();
    expect(screen.getByTestId("consent-nkbihfbeogaeaoehlefnkodbefgpgknn")).toBeTruthy();
    expect(screen.getByText("confirm: create this space")).toBeTruthy();
  });

  it("passes only checked extensions and the lifetime override through the explicit confirm", async () => {
    const onCreate = vi.fn(async () => {});
    render(
      <BlueprintsPanel blueprints={[summary]} onLoadManifest={async () => manifest} onCreate={onCreate} />
    );
    screen.getByText("preview + install").click();
    await waitFor(() => screen.getByTestId("blueprint-preview"));

    (screen.getByTestId("consent-nkbihfbeogaeaoehlefnkodbefgpgknn") as HTMLInputElement).click();
    fireEvent.change(screen.getByLabelText("lifetime override"), { target: { value: "5m" } });
    screen.getByText("confirm: create this space").click();

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({
      blueprintId: summary.id,
      lifetime: "5m",
      consentedExtensionIds: ["nkbihfbeogaeaoehlefnkodbefgpgknn"],
    });
  });
});
