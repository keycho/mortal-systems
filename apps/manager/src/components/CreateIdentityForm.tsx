import { useState } from "react";
import {
  composeManifest,
  generateIdentityId,
  isValidLifetime,
  type IdentityManifest,
} from "@mortal/schema";

const PALETTE = ["#F59E0B", "#C8FF4D", "#FFB000", "#4DA3FF", "#A78BFA", "#8A8F98"];

export interface CreateIdentityFormProps {
  onCreate: (manifest: IdentityManifest) => Promise<void>;
}

/** minimal day-1 create form: name, color, lifetime. blueprint install is day-5 scope. */
export function CreateIdentityForm({ onCreate }: CreateIdentityFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0] as string);
  const [lifetime, setLifetime] = useState("persistent");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lifetimeOk = lifetime === "persistent" || isValidLifetime(lifetime);

  async function submit() {
    setError(null);
    if (name.trim().length === 0) {
      setError("name is required");
      return;
    }
    if (!lifetimeOk) {
      setError('lifetime must be "persistent" or like 30m / 12h / 7d');
      return;
    }
    setBusy(true);
    try {
      const manifest = composeManifest({
        id: generateIdentityId(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        color,
        lifetime,
      });
      await onCreate(manifest);
      setName("");
      setLifetime("persistent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-line bg-panel p-5 flex flex-col gap-3.5">
      <span className="text-mute text-[11px] tracking-[0.18em] uppercase">new identity</span>
      <input
        aria-label="identity name"
        className="bg-panel-2 border border-line px-3.5 py-2.5 text-[13.5px] outline-none focus:border-line-strong"
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2 items-center">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={`color ${c}`}
            className="w-5 h-5 border"
            style={{ background: c, borderColor: c === color ? "#fff" : "var(--color-line)" }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <input
        aria-label="lifetime"
        className="bg-panel-2 border border-line px-3.5 py-2.5 font-mono text-[13px] outline-none focus:border-line-strong"
        value={lifetime}
        onChange={(e) => setLifetime(e.target.value)}
        placeholder='persistent or "30m" "12h" "7d"'
      />
      {error !== null && <div className="text-[12.5px] text-danger">{error}</div>}
      <button
        className="bg-accent/10 border border-accent/40 text-accent px-3.5 py-2.5 text-[13px] font-medium hover:bg-accent/15 disabled:opacity-50 transition-colors"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "creating…" : "create"}
      </button>
    </div>
  );
}
