import { describe, expect, it } from "vitest";
import { browserCandidates } from "../src/launcher/discover.js";

/**
 * the portability property, at the unit level: every location the launcher
 * will look in must be a path on the USER's machine. a downloaded build
 * resolves the browser on the machine it runs on — nothing about the
 * machine that produced the artifact may leak into this list.
 *
 * (the release build enforces the same property over the assembled
 * bundle; this test states it where the paths are actually written.)
 */

const BUILD_MACHINE_SHAPES = [
  /pw-browsers/i, // playwright's cache — ci/test only, must never ship
  /ms-playwright/i,
  /hostedtoolcache/i, // github runner tool cache
  /^\/Users\/runner\b/, // github macos runner home
  /^\/home\/runner\b/,
  /^\/root\b/, // container builds
  /^\/tmp\b/,
  /^\/private\/var\/folders\b/, // macos per-build temp
];

describe("browser discovery is portable across machines", () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    it(`${platform}: every candidate path is a user-machine location`, () => {
      const paths = browserCandidates(platform, "/Users/someone").flatMap((c) => c.paths);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        for (const shape of BUILD_MACHINE_SHAPES) {
          // /Users/someone is this test's injected HOME, not a runner path
          if (shape.source.includes("Users") && p.startsWith("/Users/someone")) continue;
          expect(shape.test(p), `${platform} candidate ${p} looks build-machine-specific`).toBe(
            false
          );
        }
      }
    });
  }

  it("macos looks in both /Applications and the user's own ~/Applications", () => {
    const chrome = browserCandidates("darwin", "/Users/someone").find((c) => c.kind === "chrome");
    expect(chrome?.paths).toContain("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(chrome?.paths).toContain(
      "/Users/someone/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    );
  });

  it("preference order stays chrome, then chromium, then brave", () => {
    expect(browserCandidates("darwin", "/Users/someone").map((c) => c.kind)).toEqual([
      "chrome",
      "chromium",
      "brave",
    ]);
  });
});
