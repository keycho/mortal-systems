import { useCallback, useEffect, useState } from "react";
import {
  isPackagedApp,
  restartRuntime,
  runtimeDiagnostics,
  type RuntimeDiagnostics,
} from "../lib/client.js";
import { Button } from "./ui.js";

/**
 * shown when the manager cannot reach the runtime.
 *
 * the packaged app ships the runtime and starts it itself, so a user who
 * downloaded a .dmg must never be told to run a repo command — they have no
 * repo. this panel asks the shell what actually happened to the process it
 * spawned and prints that, with a restart button and the log path. the
 * `pnpm dev:runtime` advice survives only for browser dev mode, where it is
 * the truth.
 */
export function RuntimeUnreachable({
  error,
  onRetry,
  // injectable so the shipping rule below can be tested directly, without
  // mocking the tauri bridge; production always uses the real client
  packaged = isPackagedApp(),
  loadDiagnostics = runtimeDiagnostics,
  onRestart = restartRuntime,
}: {
  error: string | null;
  onRetry: () => void;
  packaged?: boolean;
  loadDiagnostics?: () => Promise<RuntimeDiagnostics | null>;
  onRestart?: () => Promise<RuntimeDiagnostics | null>;
}) {
  const [diag, setDiag] = useState<RuntimeDiagnostics | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    void loadDiagnostics()
      .then(setDiag)
      .catch(() => setDiag(null));
  }, [loadDiagnostics]);

  const restart = useCallback(async () => {
    setRestarting(true);
    try {
      setDiag(await onRestart());
    } catch {
      /* the diagnostic line below still reports the previous state */
    } finally {
      setRestarting(false);
      onRetry();
    }
  }, [onRestart, onRetry]);

  // the process started and then died, or never started at all
  const failed =
    diag !== null && (diag.spawnError !== null || diag.exited !== null);

  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="rounded-2xl bg-surface px-8 py-10 max-w-md flex flex-col items-center gap-3 text-center">
        <span className="text-[17px] font-medium">
          {packaged ? "the runtime did not start" : "the runtime is unreachable"}
        </span>

        {packaged ? (
          <p className="text-[13.5px] text-sec leading-relaxed">
            mortal runs a local runtime alongside this window and starts it for
            you. it is not running right now.
            {failed ? " restarting it usually clears this." : " it may still be starting."}
          </p>
        ) : (
          <p className="text-[13.5px] text-sec leading-relaxed">
            the manager talks to the local mortal runtime over loopback. start it
            with <span className="font-mono text-[12.5px]">pnpm dev:runtime</span>{" "}
            and it will reconnect automatically.
          </p>
        )}

        {packaged && diag !== null && (
          <div className="w-full flex flex-col gap-1 text-left">
            {diag.spawnError !== null && (
              <p className="font-mono text-[12px] text-mute break-all">
                {diag.spawnError}
              </p>
            )}
            {diag.exited !== null && (
              <p className="font-mono text-[12px] text-mute break-all">
                runtime exited: {diag.exited}
              </p>
            )}
            {diag.quarantineCleared && (
              <p className="text-[12px] text-sec">
                cleared macOS quarantine on the bundled runtime and retried.
              </p>
            )}
            {diag.log !== null && (
              <p className="font-mono text-[11.5px] text-mute break-all">
                log: {diag.log}
              </p>
            )}
          </div>
        )}

        {error !== null && (
          <p className="font-mono text-[12px] text-mute break-all">{error}</p>
        )}

        <div className="flex items-center gap-2 mt-1">
          {packaged && (
            <Button variant="primary" disabled={restarting} onClick={() => void restart()}>
              {restarting ? "restarting…" : "restart the runtime"}
            </Button>
          )}
          <Button variant={packaged ? "secondary" : "primary"} onClick={onRetry}>
            retry now
          </Button>
        </div>
      </div>
    </div>
  );
}
