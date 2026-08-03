import Link from "next/link";

/** approved landing copy, adapted only for the mortal systems name. brand
 * voice: lowercase, no em dashes, no exclamation marks. */
export default function Landing() {
  return (
    <div className="flex flex-col gap-14">
      <section className="flex flex-col gap-6">
        <h1 className="text-[26px] leading-snug max-w-xl">
          launch private identities that disappear when their work is done.
        </h1>
        <p className="text-mute max-w-xl">
          the internet collapsed every part of your life into one permanent identity. mortal
          systems creates spaces between them.
        </p>
        <p className="text-mute max-w-xl">
          a programmable identity runtime for humans and autonomous agents. give every task its
          own browser, memory, files, permissions and lifetime. use the identity yourself or
          assign it to an autonomous agent. when the work is complete, the identity can expire
          and disappear.
        </p>
        <div className="flex gap-3">
          <Link href="/download" className="border border-ink px-4 py-2 hover:bg-panel">
            download the manager
          </Link>
          <Link href="/guarantees" className="border border-line px-4 py-2 text-mute hover:text-ink hover:bg-panel">
            read the guarantees
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-[12px]">
          what mortal systems separates today: sessions, cookies, storage, extensions, files,
          notes, and ai context. per identity, tested, enforced.
        </p>
        <p className="text-[12px] text-mute max-w-2xl">
          mortal systems separates browser state, files and context. it does not make identities
          anonymous in version one. identities on the same machine share your ip and device
          fingerprint. every guarantee is labeled enforced, advisory, or roadmap. we do not sell
          controls that do not exist.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <span className="text-[10px] tracking-widest uppercase text-mute">
          preview · real functionality requires the desktop manager
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ["space 004", "onchain investigator", "active", "04h 18m remaining", "#C8FF4D"],
              ["space 011", "client acme", "persistent", "", "#F59E0B"],
              ["space 017", "agent research", "task complete", "expiring", "#A78BFA"],
            ] as const
          ).map(([number, name, state, remaining, color]) => (
            <div key={number} className="relative border border-line bg-panel p-4 flex flex-col gap-2">
              <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color }} />
              <span className="text-[10px] tracking-widest uppercase text-mute">{number}</span>
              <span className="text-[13px]">{name}</span>
              <span className="text-[11px] text-mute">{state}</span>
              {remaining && <span className="text-[11px] tabular-nums">{remaining}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
