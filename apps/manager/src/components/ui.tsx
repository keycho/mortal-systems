import { useEffect, useRef, useState } from "react";

/**
 * control hierarchy for the whole manager:
 * primary (light filled, dark text) · secondary (elevated neutral) ·
 * tertiary/ghost (quiet text) · danger (muted red, confirmed flows only).
 * every control gets a visible keyboard focus ring and a consistent height.
 */
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg outline-none select-none " +
  "focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-45 disabled:cursor-not-allowed";

const VARIANTS = {
  primary: "bg-ink text-app font-medium hover:bg-white",
  secondary: "bg-elevated border border-line text-ink hover:bg-surface-hover",
  ghost: "text-sec hover:text-ink hover:bg-surface-hover",
  danger: "bg-danger/15 border border-danger/40 text-danger hover:bg-danger/25",
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
    size === "sm"
      ? "h-8 px-3 text-[13px]"
      : size === "lg"
        ? "h-10 px-5 text-[14px]"
        : "h-9 px-4 text-[13.5px]";
  return <button className={`${BASE} ${VARIANTS[variant]} ${pad} ${className}`} {...rest} />;
}

/** ⋯ menu for secondary and destructive actions; closes on outside click / escape */
export function Menu({
  label,
  items,
}: {
  label: React.ReactNode;
  items: Array<{ label: string; danger?: boolean; onSelect: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="more actions"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 min-w-44 bg-elevated border border-line-strong rounded-xl shadow-xl shadow-black/40 py-1.5 z-50"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`w-full text-left px-3.5 py-2 text-[13.5px] outline-none focus-visible:bg-surface-hover hover:bg-surface-hover ${
                item.danger ? "text-danger" : "text-ink"
              }`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** centered modal on a scrim; used for confirmations and the create flow */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-elevated border border-line-strong rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md p-6 flex flex-col gap-4"
      >
        <h2 className="text-[17px] font-medium">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** bottom-right toast stack; call push from App, items expire themselves */
export interface ToastItem {
  id: number;
  message: string;
}

export function Toasts({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className="bg-elevated border border-line-strong rounded-xl shadow-lg shadow-black/40 px-4 py-2.5 text-[13.5px]"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** relative time with the exact timestamp in a tooltip */
export function RelativeTime({ iso }: { iso: string }) {
  const then = Date.parse(iso);
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  const label =
    s < 10
      ? "just now"
      : s < 60
        ? `${s}s ago`
        : s < 3600
          ? `${Math.floor(s / 60)}m ago`
          : s < 86400
            ? `${Math.floor(s / 3600)}h ago`
            : `${Math.floor(s / 86400)}d ago`;
  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString()}
      className="font-mono tabular-nums text-[12px] text-mute"
    >
      {label}
    </time>
  );
}

/** middle-abbreviated machine path with copy + reveal controls */
export function PathValue({ path, label }: { path: string; label?: string }) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
      <span className="font-mono text-[12.5px] text-sec truncate" title={path} aria-label={label ?? "path"}>
        {full ? path : abbrevPath(path)}
      </span>
      <button
        className="text-mute hover:text-ink text-[12px] shrink-0 outline-none rounded focus-visible:ring-2 focus-visible:ring-white/40"
        title={full ? "abbreviate" : "show full path"}
        onClick={() => setFull((v) => !v)}
      >
        {full ? "less" : "more"}
      </button>
      <button
        className="text-mute hover:text-ink text-[12px] shrink-0 outline-none rounded focus-visible:ring-2 focus-visible:ring-white/40"
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
