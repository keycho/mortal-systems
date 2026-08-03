import {
  DESTROYED_MEANS,
  ENFORCEMENT_TABLE,
  NON_GUARANTEES,
} from "@mortal/schema";

const BADGE_STYLE: Record<string, string> = {
  enforced: "bg-ink text-void border border-ink",
  advisory: "bg-transparent text-ink border border-ink",
  roadmap: "bg-transparent text-mute border border-dashed border-mute",
};

/** generated from the same enforcement table the runtime and both uis read.
 * every "enforced" row maps to at least one automated test or the build fails. */
export default function Guarantees() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-[20px]">the guarantees, labeled honestly</h1>
        <p className="text-mute text-[12px] max-w-2xl">
          every control carries exactly one label. enforced means a passing automated test backs
          it, and the build fails if that mapping breaks. advisory means a declaration shown in
          the ui, not a technical control. roadmap means not built, and the product says so.
        </p>
      </section>

      <section className="flex flex-col gap-2 overflow-x-auto">
        <table className="text-[12px] w-full border-collapse min-w-[600px]">
          <thead>
            <tr className="text-left text-mute text-[10px] uppercase tracking-widest">
              <th className="py-2 pr-4 font-normal">control</th>
              <th className="py-2 pr-4 font-normal">value</th>
              <th className="py-2 pr-4 font-normal">label</th>
              <th className="py-2 font-normal">tests</th>
            </tr>
          </thead>
          <tbody>
            {ENFORCEMENT_TABLE.map((row) => (
              <tr key={row.field} className="border-t border-line align-top">
                <td className="py-3 pr-4">
                  <div>{row.label}</div>
                  <div className="text-mute text-[11px] max-w-sm">{row.description}</div>
                </td>
                <td className="py-3 pr-4 text-mute">{row.value}</td>
                <td className="py-3 pr-4">
                  <span className={`text-[10px] px-2 py-0.5 whitespace-nowrap ${BADGE_STYLE[row.enforcement]}`}>
                    {row.enforcement}
                  </span>
                </td>
                <td className="py-3 text-mute text-[11px]">{row.plannedTests.join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[14px]">what mortal systems does not guarantee</h2>
        <ul className="flex flex-col gap-1 text-[12px] text-mute">
          {NON_GUARANTEES.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[14px]">what destroyed means</h2>
        <p className="text-[12px] text-mute max-w-2xl border border-line p-4">{DESTROYED_MEANS}</p>
      </section>
    </div>
  );
}
