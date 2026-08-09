import { describe, expect, it } from "vitest";
import { NEUTRAL, THEMES, styleFor, themeFor } from "../src/index.js";

/**
 * the homes are on camera. these lock the two properties that make a
 * resting cell readable on the wall: no home is dark, and no two homes
 * are the same page in different words.
 */

const PERSONAS = Object.keys(THEMES);
const ALL = [NEUTRAL, ...Object.values(THEMES)];

/** srgb relative luminance, enough to tell a lit room from a dark one */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const channel = (pair: string): number => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(n.slice(0, 2)) +
    0.7152 * channel(n.slice(2, 4)) +
    0.0722 * channel(n.slice(4, 6))
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** the ground a theme actually paints, house default included */
function groundOf(theme: { vars: Record<string, string> }): string {
  return theme.vars.ground ?? "#f8f6f1";
}

describe("the homes", () => {
  it("covers every identity the cast gives a tenant, and vesper's seat", () => {
    // vesper carries no tenant today; the room exists so that giving her
    // one is configuration rather than a design pass
    expect(PERSONAS.sort()).toEqual(["ash", "marlowe", "odile", "rui", "vesper", "yuki"]);
  });

  it("is a lit room everywhere: no home renders as a dark cell", () => {
    for (const theme of ALL) {
      const ground = groundOf(theme);
      // the regression this whole module exists for: #070708 on a cream
      // wall read as a dead agent. every ground is now near the wall's own.
      expect(luminance(ground), `${theme.key} ground ${ground}`).toBeGreaterThan(0.8);
      expect(styleFor(theme)).toContain("color-scheme: light");
      expect(styleFor(theme)).not.toContain("#070708");
    }
  });

  it("keeps body text and links legible on their own ground", () => {
    for (const theme of ALL) {
      const ground = groundOf(theme);
      const ink = theme.vars.ink ?? "#191713";
      const accent = theme.vars.accent ?? "#a6431f";
      expect(contrast(ink, ground), `${theme.key} ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, ground), `${theme.key} accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("makes a link look like a link in every home", () => {
    // found on the pixels: odile's accent is the ink, so without a rule
    // under it her post titles were body text that happened to navigate.
    // colour alone is not a cue when there is no colour.
    for (const theme of ALL) {
      const ink = theme.vars.ink ?? "#191713";
      const accent = theme.vars.accent ?? "#a6431f";
      const underlined = (theme.vars["link-line"] ?? "none") === "underline";
      expect(
        accent !== ink || underlined,
        `${theme.key}: links share the ink and carry no underline`
      ).toBe(true);
    }
  });

  it("invents no colour the wall does not already use", () => {
    // apps/web/app/wall.css: the page, the ink, the oxide, the ttl orange,
    // the final-hour red. per-home grounds may lift toward white, never hue.
    const wall = new Set(["#191713", "#a6431f", "#c4501f", "#bf3b2b"]);
    for (const theme of Object.values(THEMES)) {
      for (const key of ["ink", "accent"] as const) {
        const value = theme.vars[key];
        if (value) expect(wall, `${theme.key} ${key} ${value}`).toContain(value);
      }
    }
  });

  it("gives each identity a room of its own", () => {
    // the signature is type, measure and rhythm, so two homes may share an
    // accent and still be unmistakable. no two may share the whole hand.
    const hands = Object.values(THEMES).map((t) =>
      JSON.stringify([
        t.vars["font-body"] ?? "",
        t.vars.measure ?? "",
        t.vars.leading ?? "",
        t.vars["para-space"] ?? "",
        groundOf(t),
      ])
    );
    expect(new Set(hands).size).toBe(PERSONAS.length);
  });

  it("stays one house: every home keeps the shared skeleton", () => {
    for (const theme of ALL) {
      const css = styleFor(theme);
      expect(css).toContain("border-radius: 0");
      expect(css).toContain("var(--ground)");
      expect(css).toContain("var(--ink)");
      // the footer line belongs to the house, not to any identity
      expect(css).toContain("footer");
    }
  });

  it("lets a serial incarnation inherit its base member's room", () => {
    expect(themeFor("ash-1").key).toBe("ash");
    expect(themeFor("ash-12").key).toBe("ash");
    expect(themeFor("ash").key).toBe("ash");
  });

  it("gives an unknown address the neutral ground rather than a stranger's room", () => {
    expect(themeFor("nobody").key).toBe("terrarium");
    expect(themeFor(null).key).toBe("terrarium");
    expect(themeFor(undefined).key).toBe("terrarium");
    expect(themeFor("").key).toBe("terrarium");
  });

  it("declares the language each identity's writing actually leads in", () => {
    // yuki writes japanese first and translates below; odile is berlin-based
    // but leads in english and drops into german, so her pages are not de
    expect(THEMES.yuki?.lang).toBe("ja");
    expect(THEMES.odile?.lang).toBe("en");
    expect(THEMES.marlowe?.lang).toBe("en-GB");
    expect(THEMES.rui?.lang).toBe("pt-BR");
  });
});
