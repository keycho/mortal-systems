import { useState } from "react";
import {
  composeManifest,
  generateIdentityId,
  isValidLifetime,
  type IdentityManifest,
} from "@mortal/schema";
import { Button } from "./ui.js";

const PALETTE = ["#F59E0B", "#C8FF4D", "#FFB000", "#4DA3FF", "#A78BFA", "#8A8F98"];
const LIFETIME_PRESETS = ["persistent", "1h", "12h", "7d"] as const;

export interface CreateIdentityFormProps {
  onCreate: (manifest: IdentityManifest) => Promise<void>;
  /** prefills from the home prompt ("what needs its own identity?") */
  initialName?: string;
  initialLifetime?: string;
}

export function CreateIdentityForm({ onCreate, initialName, initialLifetime }: CreateIdentityFormProps) {
  const [name, setName] = useState(initialName ?? "");
  const [color, setColor] = useState(PALETTE[0] as string);
  const [lifetime, setLifetime] = useState<string>(initialLifetime ?? "persistent");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effective = custom.trim() !== "" ? custom.trim() : lifetime;
  const lifetimeOk = effective === "persistent" || isValidLifetime(effective);

  async function submit() {
    setError(null);
    if (name.trim().length === 0) {
      setError("name is required");
      return;
    }
    if (!lifetimeOk) {
      setError('lifetime must be "persistent" or a duration like 30m, 12h, 7d');
      return;
    }
    setBusy(true);
    try {
      const manifest = composeManifest({
        id: generateIdentityId(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        color,
        lifetime: effective,
      });
      await onCreate(manifest);
      setName("");
      setLifetime("persistent");
      setCustom("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-sec">name</span>
        <input
          aria-label="identity name"
          className="h-10 bg-input rounded-lg px-3.5 text-[14px] placeholder:text-mute outline-none border border-transparent focus:border-line-strong focus-visible:ring-2 focus-visible:ring-white/25"
          placeholder="e.g. client acme"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-sec">color</span>
        <div className="flex gap-2.5 items-center">
          {PALETTE.map((c) => (
            <button
              key={c}
              aria-label={`color ${c}`}
              className="w-6 h-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              style={{
                background: c,
                boxShadow: c === color ? "0 0 0 2px var(--bg-elevated), 0 0 0 3.5px #fff" : "none",
              }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-sec">lifetime</span>
        <div className="flex gap-2 flex-wrap items-center">
          {LIFETIME_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`h-9 px-3.5 rounded-lg text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                lifetime === preset && custom.trim() === ""
                  ? "bg-elevated text-ink"
                  : "bg-input text-sec hover:text-ink"
              }`}
              onClick={() => {
                setLifetime(preset);
                setCustom("");
              }}
            >
              {preset}
            </button>
          ))}
          <input
            aria-label="custom lifetime"
            className="h-9 w-24 bg-input rounded-lg px-3 font-mono text-[13px] placeholder:text-mute outline-none border border-transparent focus:border-line-strong focus-visible:ring-2 focus-visible:ring-white/25"
            placeholder="custom"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        <span className="text-[12.5px] text-mute">
          a finite identity expires on schedule; what happens then (destroy, suspend, archive) is
          set by its manifest.
        </span>
      </div>

      {error !== null && <div className="text-[13px] text-danger">{error}</div>}
      <Button variant="primary" size="lg" disabled={busy} onClick={() => void submit()} className="self-start">
        {busy ? "creating…" : "create identity"}
      </Button>
    </div>
  );
}
