import type { Enforcement } from "@mortal/schema";
import { CircleCheck, CircleDashed, Info } from "lucide-react";

/**
 * text-led enforcement labels with a subtle icon treatment.
 * enforced / advisory / roadmap stay visually unmistakable and are never
 * restyled per call site. (class markers text-ok / text-sec / border-dashed
 * are asserted by the badge test.)
 */
const VARIANT: Record<Enforcement, { classes: string; icon: React.ReactNode }> = {
  enforced: {
    classes: "text-ok",
    icon: <CircleCheck size={14} strokeWidth={1.9} aria-hidden />,
  },
  advisory: {
    classes: "text-sec",
    icon: <Info size={14} strokeWidth={1.9} aria-hidden />,
  },
  roadmap: {
    classes: "text-mute border-dashed",
    icon: <CircleDashed size={14} strokeWidth={1.9} aria-hidden />,
  },
};

export function EnforcementBadge({ enforcement }: { enforcement: Enforcement }) {
  const v = VARIANT[enforcement];
  return (
    <span
      data-testid="enforcement-badge"
      data-enforcement={enforcement}
      className={`text-[13.5px] whitespace-nowrap inline-flex items-center gap-1.5 border-transparent ${v.classes}`}
    >
      {v.icon}
      {enforcement}
    </span>
  );
}
