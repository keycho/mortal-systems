import { Wordmark } from "../Wordmark";

export function SiteFooter() {
  return (
    <div
      className="mf-foot"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderTop: "1px solid rgba(25,23,19,.12)",
        marginTop: 64,
        padding: "24px 0 8px",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Wordmark variant="footer" />
      <div style={{ font: "400 11.5px var(--font-mono)", color: "rgba(25,23,19,.45)" }}>
        local-first · no account · no telemetry · your identities never leave your machine
      </div>
    </div>
  );
}
