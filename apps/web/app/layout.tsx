import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "mortal.systems",
  description:
    "a programmable identity runtime for humans and autonomous agents. launch private identities that disappear when their work is done.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col text-[14px]">
        <header className="border-b border-line">
          <nav className="mx-auto max-w-4xl px-5 py-4 flex items-baseline gap-6">
            <Link href="/" className="tracking-widest text-[15px]">
              mortal systems
            </Link>
            <Link href="/guarantees" className="text-mute text-[12px] hover:text-ink">
              guarantees
            </Link>
            <Link href="/blueprints" className="text-mute text-[12px] hover:text-ink">
              blueprints
            </Link>
            <Link href="/download" className="text-mute text-[12px] hover:text-ink">
              download
            </Link>
          </nav>
        </header>
        <main className="flex-1 mx-auto max-w-4xl w-full px-5 py-12">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-4xl px-5 py-6 text-[11px] text-mute flex flex-col gap-1">
            <span>
              every guarantee is labeled enforced, advisory, or roadmap. we do not sell controls
              that do not exist.
            </span>
            <span>
              this site hosts none of the product. identities run only in the local mortal runtime
              on your machine.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
