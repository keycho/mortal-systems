import type { Enforcement } from "@mortal/schema";

/** solid = enforced, outlined = advisory, dashed = roadmap. never restyled per call site. */
const VARIANT: Record<Enforcement, string> = {
  enforced: "bg-ink text-void border border-ink",
  advisory: "bg-transparent text-ink border border-ink",
  roadmap: "bg-transparent text-mute border border-dashed border-mute",
};

export function EnforcementBadge({ enforcement }: { enforcement: Enforcement }) {
  return (
    <span
      data-testid="enforcement-badge"
      data-enforcement={enforcement}
      className={`font-mono text-[11px] px-2 py-0.5 whitespace-nowrap rounded-sm ${VARIANT[enforcement]}`}
    >
      {enforcement}
    </span>
  );
}
