import Link from "next/link";
import { LiveWall } from "../components/wall/LiveWall";
import { Simulator } from "../components/simulator/Simulator";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* hero */}
      <section className="mx-auto max-w-5xl w-full px-5 pt-16 pb-12 flex flex-col gap-8">
        <h1 className="text-[clamp(24px,4.5vw,40px)] leading-snug max-w-2xl font-medium">
          launch private identities that disappear when their work is done.
        </h1>
        <div className="flex flex-col gap-4 max-w-xl text-[13px] text-mute">
          <p>
            the internet collapsed every part of your life into one permanent identity. mortal
            systems creates spaces between them.
          </p>
          <p>
            a programmable identity runtime for humans and autonomous agents. give every task its
            own browser, memory, files, permissions and lifetime. when the work is complete, the
            identity can expire and disappear.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/download" className="border border-ink px-4 py-2 hover:bg-panel">
            download the manager
          </Link>
          <Link
            href="/guarantees"
            className="border border-line px-4 py-2 text-mute hover:text-ink hover:bg-panel"
          >
            read the guarantees
          </Link>
        </div>
      </section>

      {/* hero artifact: the live wall */}
      <section className="mx-auto max-w-5xl w-full px-5 pb-16">
        <LiveWall />
      </section>

      {/* the honesty block stays first-class, above the fold's fold */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-5xl px-5 py-8">
          <p className="text-[12px] text-mute max-w-2xl leading-relaxed">
            mortal systems separates browser state, files and context. it does not make identities
            anonymous in version one. identities on one machine share your ip and device
            fingerprint. every guarantee is labeled enforced, advisory, or roadmap.{" "}
            <span className="text-ink">we do not sell controls that do not exist.</span>
          </p>
        </div>
      </section>

      {/* the simulator */}
      <section className="mx-auto max-w-5xl w-full px-5 py-16 flex flex-col gap-6" id="try">
        <div className="flex flex-col gap-2 max-w-xl">
          <span className="text-[10px] tracking-widest uppercase text-mute">try the manager</span>
          <h2 className="text-[20px] font-medium">run one full identity lifecycle, right here.</h2>
          <p className="text-[12px] text-mute">
            create an identity or install a blueprint, launch it, work in it, and watch the
            deletion contract take it apart. the grammar, manifests, states and badges below come
            from the product&apos;s real schema package.
          </p>
        </div>
        <Simulator />
      </section>
    </div>
  );
}
