import type { Enforcement } from "@mortal/schema";

/**
 * the one enforcement badge the whole site uses. solid = enforced,
 * outlined = advisory, dashed = roadmap — never restyled per section, and
 * the label text is always the schema's enforcement value, never a
 * hardcoded synonym.
 */
const VARIANT: Record<Enforcement, string> = {
  enforced: "bg-ink text-void border border-ink",
  advisory: "bg-transparent text-ink border border-ink",
  roadmap: "bg-transparent text-mute border border-dashed border-mute",
};

export function Badge({ enforcement }: { enforcement: Enforcement }) {
  return (
    <span
      data-enforcement={enforcement}
      className={`text-[10px] px-2 py-0.5 whitespace-nowrap ${VARIANT[enforcement]}`}
    >
      {enforcement}
    </span>
  );
}
