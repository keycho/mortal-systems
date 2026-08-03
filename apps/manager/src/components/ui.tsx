import { useState } from "react";

/**
 * control hierarchy for the whole manager:
 * primary (amber, one per surface) · secondary (bordered) · danger · ghost.
 * every control gets a visible keyboard focus ring.
 */
const BASE =
  "inline-flex items-center justify-center gap-1.5 transition-colors outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 " +
  "focus-visible:ring-offset-void disabled:opacity-45 disabled:cursor-not-allowed";

const VARIANTS = {
  primary:
    "bg-accent/15 border border-accent/50 text-accent font-medium hover:bg-accent/25",
  secondary: "border border-line-strong bg-panel-2 hover:bg-panel-3 text-ink",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
  ghost: "border border-transparent text-mute hover:text-ink hover:bg-panel-2",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: "sm" | "md" | "lg";
}) {
  const pad =
    size === "sm" ? "px-2.5 py-1 text-[12.5px]" : size === "lg" ? "px-5 py-2.5 text-[14px]" : "px-3.5 py-1.5 text-[13px]";
  return <button className={`${BASE} ${VARIANTS[variant]} ${pad} ${className}`} {...rest} />;
}

/** middle-abbreviated machine path with copy + reveal-in-full controls */
export function PathValue({ path, label }: { path: string; label?: string }) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const abbreviated = abbrevPath(path);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
      <span
        className="font-mono text-[12px] text-mute truncate"
        title={path}
        aria-label={label ?? "path"}
      >
        {full ? path : abbreviated}
      </span>
      <button
        className="text-faint hover:text-ink text-[11px] shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        title={full ? "abbreviate" : "show full path"}
        onClick={() => setFull((v) => !v)}
      >
        {full ? "↤" : "…"}
      </button>
      <button
        className="text-faint hover:text-ink text-[11px] shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        title="copy path"
        onClick={() => {
          void navigator.clipboard?.writeText(path).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

export function abbrevPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}
