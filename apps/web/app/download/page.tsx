import type { Metadata } from "next";
import { DownloadSection } from "../../components/site/DownloadSection";
import { Nav } from "../../components/site/Nav";

export const metadata: Metadata = {
  title: "download · mortal systems",
  description: "a desktop app, on purpose. signed builds with printed checksums, when they ship.",
};

export default function Download() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "36px 40px 0" }}>
        <Nav />
      </div>
      <DownloadSection>
        <div
          style={{
            marginTop: 22,
            background: "var(--surface)",
            border: "1px solid rgba(25,23,19,.12)",
            borderRadius: "var(--r-card)",
            padding: "16px 22px",
            font: "400 13px/1.75 var(--font-body)",
            color: "rgba(25,23,19,.7)",
          }}
        >
          today the alpha runs from source: clone the repository, then{" "}
          <code style={{ font: "400 12px var(--font-mono)", color: "var(--ink)" }}>pnpm install</code>{" "}
          and follow the dev flow in the readme. the runtime, your identities, and their
          destruction all happen locally on your machine; this site never touches them.
        </div>
      </DownloadSection>
    </div>
  );
}
