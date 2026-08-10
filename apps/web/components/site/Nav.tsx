import Link from "next/link";
import { MACOS_ALPHA_DMG_URL } from "../../lib/site-data";
import { Wordmark } from "../Wordmark";

/**
 * the site nav. on the landing page the links are section anchors; on
 * subpages they point back into the landing page. hidden below 820px
 * (the handoff ships no mobile menu).
 */
export function Nav({ home = false }: { home?: boolean }) {
  // the landing page holds the root again, so a subpage's anchors and
  // wordmark point back at it (the way out to the wall is the footer's
  // "the wall · live" and the hero's watch cta, both at /gate)
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Link href={home ? "#top" : "/"} aria-label="witness.run product page">
        <Wordmark variant="nav" />
      </Link>
      <div className="m-nav" style={{ display: "flex", gap: 34, font: "400 13px var(--font-mono)" }}>
        <a href={anchor("manager")} style={{ color: "rgba(242,239,231,.55)" }}>
          the manager
        </a>
        <a href={anchor("guarantees")} style={{ color: "rgba(242,239,231,.55)" }}>
          guarantees
        </a>
        <a href={anchor("blueprints")} style={{ color: "rgba(242,239,231,.55)" }}>
          blueprints
        </a>
        <a href={anchor("agents")} style={{ color: "rgba(242,239,231,.55)" }}>
          for agents
        </a>
      </div>
      <a
        href={MACOS_ALPHA_DMG_URL}
        style={{
          font: "500 13px var(--font-mono)",
          border: "1px solid rgba(242,239,231,.4)",
          padding: "9px 18px",
          borderRadius: 6,
          background: "rgba(242,239,231,.06)",
          color: "var(--ink)",
        }}
      >
        download
      </a>
    </div>
  );
}
