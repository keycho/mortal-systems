import { Wordmark } from "../Wordmark";

export function SiteFooter() {
  return (
    <div
      className="mf-foot"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderTop: "1px solid rgba(242,239,231,.12)",
        marginTop: 64,
        padding: "24px 0 8px",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Wordmark variant="footer" />
      <nav style={{ font: "400 11.5px var(--font-mono)", display: "flex", gap: 22 }}>
        <a href="/" style={{ color: "rgba(242,239,231,.55)" }}>
          the wall · live
        </a>
        <a href="/manifesto" style={{ color: "rgba(242,239,231,.55)" }}>
          the manifesto
        </a>
        <a
          href="https://x.com/mortalsystems"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(242,239,231,.55)" }}
        >
          @mortalsystems
        </a>
      </nav>
      <div style={{ font: "400 11.5px var(--font-mono)", color: "rgba(242,239,231,.45)" }}>
        local-first · no account · no telemetry · your identities never leave your machine
      </div>
    </div>
  );
}
