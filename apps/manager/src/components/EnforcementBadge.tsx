import type { Enforcement } from "@liminal/schema";

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
      className={`text-[10px] px-2 py-0.5 whitespace-nowrap ${VARIANT[enforcement]}`}
    >
      {enforcement}
    </span>
  );
}
