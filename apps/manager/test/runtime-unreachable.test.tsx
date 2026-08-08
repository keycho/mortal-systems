import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { RuntimeUnreachable } from "../src/components/RuntimeUnreachable.js";
import type { RuntimeDiagnostics } from "../src/lib/client.js";

/**
 * the shipping rule this file exists to enforce: a downloaded .dmg has no
 * repo and no pnpm, so the packaged app must never answer a missing runtime
 * with a dev command. it must say what happened to the process it started.
 */

const diag: RuntimeDiagnostics = {
  mode: "bundled",
  node: "/Applications/mortal manager.app/Contents/Resources/sidecar/node",
  cli: "/Applications/mortal manager.app/Contents/Resources/sidecar/runtime/dist/cli.js",
  log: "/Users/someone/.mortal/sidecar.log",
  spawnError: "Operation not permitted (os error 1)",
  quarantineCleared: true,
  exited: null,
};

const load = (d: RuntimeDiagnostics | null) => () => Promise.resolve(d);

afterEach(cleanup);

describe("runtime unreachable panel", () => {
  it("packaged app: never prints a dev command, and names the real failure", async () => {
    render(
      <RuntimeUnreachable
        error={null}
        onRetry={() => {}}
        packaged
        loadDiagnostics={load(diag)}
        onRestart={load(diag)}
      />
    );

    await waitFor(() => expect(screen.getByText(/Operation not permitted/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("pnpm");
    expect(screen.getByText(/the runtime did not start/)).toBeTruthy();
    // the log path is what turns an unreproducible report into a fixable one
    expect(document.body.textContent).toContain("/Users/someone/.mortal/sidecar.log");
    expect(screen.getByRole("button", { name: /restart the runtime/ })).toBeTruthy();
  });

  it("packaged app: reports a runtime that started and then died", async () => {
    render(
      <RuntimeUnreachable
        error={null}
        onRetry={() => {}}
        packaged
        loadDiagnostics={load({ ...diag, spawnError: null, exited: "signal: 9 (SIGKILL)" })}
        onRestart={load(diag)}
      />
    );

    await waitFor(() => expect(screen.getByText(/runtime exited/)).toBeTruthy());
    expect(document.body.textContent).toContain("SIGKILL");
    expect(document.body.textContent).not.toContain("pnpm");
  });

  it("packaged app: says the quarantine recovery ran when it did", async () => {
    render(
      <RuntimeUnreachable
        error={null}
        onRetry={() => {}}
        packaged
        loadDiagnostics={load(diag)}
        onRestart={load(diag)}
      />
    );

    await waitFor(() => expect(screen.getByText(/cleared macOS quarantine/)).toBeTruthy());
  });

  it("browser dev mode: keeps the dev command, because there it is the truth", async () => {
    render(
      <RuntimeUnreachable
        error={null}
        onRetry={() => {}}
        packaged={false}
        loadDiagnostics={load(null)}
        onRestart={load(null)}
      />
    );

    await waitFor(() => expect(screen.getByText(/pnpm dev:runtime/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /restart the runtime/ })).toBeNull();
  });
});
