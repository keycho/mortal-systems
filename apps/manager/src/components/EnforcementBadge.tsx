import type { Enforcement } from "@mortal/schema";
import { CircleCheck, CircleDashed, Info } from "lucide-react";

/**
 * refined enforcement tags — filled = enforced, outlined = advisory,
 * dashed = roadmap. the three levels stay visually unmistakable and are
 * never restyled per call site.
 */
const VARIANT: Record<Enforcement, { classes: string; icon: React.ReactNode }> = {
  enforced: {
    classes: "bg-ok/15 text-ok",
    icon: <CircleCheck size={12.5} strokeWidth={2} aria-hidden />,
  },
  advisory: {
    classes: "bg-transparent text-sec border border-line-strong",
    icon: <Info size={12.5} strokeWidth={2} aria-hidden />,
  },
  roadmap: {
    classes: "bg-transparent text-mute border border-dashed border-line-strong",
    icon: <CircleDashed size={12.5} strokeWidth={2} aria-hidden />,
  },
};

export function EnforcementBadge({ enforcement }: { enforcement: Enforcement }) {
  const v = VARIANT[enforcement];
  return (
    <span
      data-testid="enforcement-badge"
      data-enforcement={enforcement}
      className={`text-[12px] pl-2 pr-2.5 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${v.classes}`}
    >
      {v.icon}
      {enforcement}
    </span>
  );
}
