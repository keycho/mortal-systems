"use client";

import { useState } from "react";
import {
  DOWNLOAD_CTA_LABEL,
  MACOS_ALPHA_DMG_URL,
  POST_DOWNLOAD_NOTE,
} from "../../lib/site-data";

/**
 * a real download button: the anchor starts the browser's download
 * (default behavior, never intercepted) and the same click reveals the
 * disclaimer right beneath it, so the unsigned-build guidance arrives at
 * the exact moment it becomes relevant instead of only living in the
 * static print nearby.
 */
export function DownloadCta({
  href = MACOS_ALPHA_DMG_URL,
  label = DOWNLOAD_CTA_LABEL,
  style,
  dark = false,
}: {
  href?: string;
  label?: string;
  style?: React.CSSProperties;
  /** the closing band is ink; its note reads in bone */
  dark?: boolean;
}) {
  const [clicked, setClicked] = useState(false);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <a href={href} style={style} onClick={() => setClicked(true)}>
        {label}
      </a>
      {clicked ? (
        <span
          role="status"
          style={{
            font: "400 11.5px var(--font-mono)",
            lineHeight: 1.55,
            maxWidth: 320,
            color: dark ? "rgba(242,239,231,.75)" : "rgba(242,239,231,.6)",
          }}
        >
          {POST_DOWNLOAD_NOTE}
        </span>
      ) : null}
    </span>
  );
}
