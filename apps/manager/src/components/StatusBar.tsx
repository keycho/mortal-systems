import type { RuntimeStatus } from "@mortal/schema";

export function StatusBar({ status, error }: { status: RuntimeStatus | null; error: string | null }) {
  return (
    <div className="border-t border-line px-4 py-2 flex items-center gap-4 text-[11px] text-mute">
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: status !== null ? "#22C55E" : "#FF6B6B" }}
        aria-label={status !== null ? "runtime connected" : "runtime unreachable"}
      />
      {status !== null ? (
        <>
          <span>runtime {status.version}</span>
          <span>{status.identitiesRunning} running</span>
          <span className="truncate">
            {status.defaultBrowser !== null
              ? `${status.defaultBrowser.kind} ${status.defaultBrowser.version ?? ""}`
              : "no browser detected yet"}
          </span>
          {status.warnings.map((w) => (
            <span key={w} className="text-[#F59E0B]">
              {w}
            </span>
          ))}
        </>
      ) : (
        <span>{error ?? "connecting to runtime…"}</span>
      )}
    </div>
  );
}
