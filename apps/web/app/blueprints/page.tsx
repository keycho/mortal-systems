/**
 * blueprint previews. content is deliberately duplicated here rather than
 * imported from @mortal/blueprints: the site may import types from
 * @mortal/schema only (architecture rule), and these cards are previews,
 * not the installable artifacts.
 */
const PREVIEWS = [
  {
    name: "onchain investigator",
    theme: "#C8FF4D",
    lifetime: "12h · destroys itself",
    description:
      "an isolated, time-limited environment for onchain research. history is not retained (enforced). expires and destroys itself when the work is done.",
    permissions: ["wallet none · advisory", "history off · enforced"],
  },
  {
    name: "client operations",
    theme: "#F59E0B",
    lifetime: "persistent · archives",
    description:
      "a persistent space scoped to a single client engagement. notes, links and ai context never bleed into other clients.",
    permissions: ["memory identity-only · enforced"],
  },
  {
    name: "crypto operations",
    theme: "#FFB000",
    lifetime: "persistent",
    description:
      "a persistent space for wallet and explorer work. wallet: declared is a declaration, not a technical control. recommended extensions are installed by you, never automatically.",
    permissions: ["wallet declared · advisory"],
  },
];

export default function Blueprints() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-[20px]">first-party blueprints</h1>
        <p className="text-mute text-[12px] max-w-2xl">
          blueprints are configuration only: bookmarks, ai instructions, permissions with
          enforcement labels, and a lifetime. no cookies, no sessions, no credentials, no
          executable code; the schema makes those unrepresentable. install happens in the
          desktop manager with a full preview and explicit confirm.
        </p>
        <span className="text-[10px] tracking-widest uppercase text-mute">
          preview · installing requires the desktop manager
        </span>
      </section>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PREVIEWS.map((bp) => (
          <div key={bp.name} className="relative border border-line bg-panel p-4 flex flex-col gap-2">
            <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: bp.theme }} />
            <span className="text-[13px]">{bp.name}</span>
            <span className="text-[11px] text-mute">{bp.lifetime}</span>
            <p className="text-[11px] text-mute">{bp.description}</p>
            <div className="flex flex-col gap-1 pt-1">
              {bp.permissions.map((p) => (
                <span key={p} className="text-[10px] text-mute">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
