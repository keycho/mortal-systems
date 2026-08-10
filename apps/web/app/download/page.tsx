import type { Metadata } from "next";
import { DownloadSection } from "../../components/site/DownloadSection";
import { Nav } from "../../components/site/Nav";

export const metadata: Metadata = {
  title: "download · mortal systems",
  description:
    "a desktop app, on purpose. an unsigned macos alpha you can download today; signed builds come with demonstrated interest.",
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
            border: "1px solid rgba(242,239,231,.12)",
            borderRadius: "var(--r-card)",
            padding: "16px 22px",
            font: "400 13px/1.75 var(--font-body)",
            color: "rgba(242,239,231,.7)",
          }}
        >
          prefer source? the alpha also runs from a clone: {" "}
          <code style={{ font: "400 12px var(--font-mono)", color: "var(--ink)" }}>pnpm install</code>{" "}
          and follow the dev flow in the readme. either way the runtime, your identities, and
          their destruction all happen locally on your machine; this site never touches them.
        </div>
      </DownloadSection>
    </div>
  );
}
