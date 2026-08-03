import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Wordmark } from "../components/Wordmark";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

const description =
  "a programmable identity runtime for humans and autonomous agents. launch private identities that disappear when their work is done.";

export const metadata: Metadata = {
  metadataBase: new URL("https://mortal.systems"),
  title: "mortal systems",
  description,
  openGraph: {
    title: "mortal systems",
    description,
    url: "https://mortal.systems",
    siteName: "mortal systems",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "mortal systems",
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrains.variable}>
      <body className="min-h-screen flex flex-col text-[14px]">
        <header className="border-b border-line sticky top-0 bg-void/95 backdrop-blur-sm z-40">
          <nav className="mx-auto max-w-5xl px-5 py-4 flex items-center gap-6">
            <Link href="/" aria-label="mortal systems home" className="text-ink">
              <Wordmark />
            </Link>
            <div className="ml-auto flex items-baseline gap-5 text-[12px]">
              <Link href="/guarantees" className="text-mute hover:text-ink">
                guarantees
              </Link>
              <Link href="/blueprints" className="text-mute hover:text-ink hidden sm:inline">
                blueprints
              </Link>
              <Link href="/docs" className="text-mute hover:text-ink hidden sm:inline">
                docs
              </Link>
              <Link
                href="/download"
                className="border border-line px-3 py-1.5 text-ink hover:bg-panel"
              >
                download
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-8 text-[11px] text-mute flex flex-col gap-2">
            <span>
              every guarantee is labeled enforced, advisory, or roadmap. we do not sell controls
              that do not exist.
            </span>
            <span>
              local-first. no account. no telemetry. your identities never leave your machine.
            </span>
            <span className="pt-2">© mortal systems · the code is public</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
