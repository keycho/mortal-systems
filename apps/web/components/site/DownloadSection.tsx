import { ALPHA_INSTALL_NOTE, PLATFORMS } from "../../lib/site-data";
import { DownloadCta } from "./DownloadCta";
import { SectionHead } from "./SectionHead";
import { SiteFooter } from "./SiteFooter";

/**
 * the download section: platform cards that flip from the dashed "coming"
 * state to a solid button only when a real artifact url lands in
 * PLATFORMS (never a dead solid button). the shipped macos alpha is
 * unsigned and every download surface says so via ALPHA_INSTALL_NOTE.
 */
export function DownloadSection({
  withFooter = true,
  children,
}: {
  withFooter?: boolean;
  /** optional extra content between the repo row and the footer */
  children?: React.ReactNode;
}) {
  return (
    <div data-screen-label="download" id="download" style={{ position: "relative" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px 40px" }}>
        <SectionHead
          eyebrow="DOWNLOAD"
          title={
            <>
              a desktop app, on <em style={{ fontStyle: "italic" }}>purpose</em>.
            </>
          }
          intro="mortal is a desktop app because real isolation needs real processes. the code is public. the alpha ships unsigned; signed and notarized builds come with demonstrated interest. checksums are published with each release."
        />
        <div
          className="m-grid4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 14,
            marginTop: 40,
          }}
        >
          {PLATFORMS.map((pl) => (
            <div
              key={`${pl.name}-${pl.arch}`}
              style={{
                background: "var(--surface)",
                border: "1px solid rgba(242,239,231,.12)",
                borderRadius: "var(--r-card)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ font: "500 15px var(--font-body)" }}>{pl.name}</div>
              <div style={{ font: "400 11.5px var(--font-mono)", color: "rgba(242,239,231,.5)", marginTop: 4 }}>
                {pl.arch}
              </div>
              {pl.href ? (
                <DownloadCta
                  href={pl.href}
                  style={{
                    marginTop: 16,
                    background: "var(--ink)",
                    color: "var(--ground)",
                    textAlign: "center",
                    font: "500 13px var(--font-body)",
                    padding: "12px 0",
                    borderRadius: "var(--r-btn)",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    marginTop: 16,
                    border: "1px dashed rgba(242,239,231,.35)",
                    color: "rgba(242,239,231,.55)",
                    textAlign: "center",
                    font: "500 13px var(--font-body)",
                    padding: "11px 0",
                    borderRadius: "var(--r-btn)",
                  }}
                >
                  coming
                </div>
              )}
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  font: "400 10.5px var(--font-mono)",
                  color: "rgba(242,239,231,.55)",
                }}
              >
                <span style={{ border: "1px dashed rgba(242,239,231,.3)", borderRadius: 5, padding: "6px 9px" }}>
                  {pl.signed}
                </span>
                <span style={{ border: "1px dashed rgba(242,239,231,.3)", borderRadius: 5, padding: "6px 9px" }}>
                  sha256 · published with the release asset
                </span>
              </div>
            </div>
          ))}
        </div>
        <p
          style={{
            font: "400 12.5px/1.65 var(--font-mono)",
            color: "rgba(242,239,231,.55)",
            margin: "18px 0 0",
            maxWidth: "72ch",
          }}
        >
          {ALPHA_INSTALL_NOTE}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 22,
            background: "var(--surface)",
            border: "1px solid rgba(242,239,231,.12)",
            borderRadius: "var(--r-card)",
            padding: "16px 22px",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ font: "400 13px var(--font-mono)", color: "rgba(242,239,231,.7)" }}>
            the wall never sleeps. watch the identities live, follow along.
          </span>
          <a
            href="https://x.com/mortalsystems"
            target="_blank"
            rel="noopener noreferrer"
            style={{ font: "500 13px var(--font-mono)", color: "var(--accent)" }}
          >
            follow → x.com/mortalsystems
          </a>
        </div>
        {children}
        {withFooter && <SiteFooter />}
      </div>
    </div>
  );
}
