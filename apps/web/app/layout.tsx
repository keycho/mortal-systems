import type { Metadata } from "next";
import "./globals.css";

const description =
  "a programmable identity runtime for humans and autonomous agents. launch isolated identities that disappear when their work is done.";

export const metadata: Metadata = {
  metadataBase: new URL("https://mortal.systems"),
  title: "mortal systems",
  description,
  openGraph: {
    title: "mortal systems",
    description,
    url: "https://mortal.systems",
    siteName: "mortal systems",
    images: [{ url: "/og.png", width: 1200, height: 675 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@mortalsystems",
    title: "mortal systems",
    description,
    images: ["/og.png"],
  },
};

/**
 * pages own their chrome (the landing page's nav and footer are part of
 * the design; the manifesto deliberately has neither). the layout only
 * carries fonts, metadata and the base canvas.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {[
          "/fonts/InstrumentSerif-Regular.woff2",
          "/fonts/InstrumentSerif-Italic.woff2",
          "/fonts/IBMPlexMono-Regular.woff2",
          "/fonts/IBMPlexMono-Medium.woff2",
        ].map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
