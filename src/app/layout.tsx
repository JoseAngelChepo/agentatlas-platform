import type { Metadata } from "next"
import { Providers } from "@/app/providers"
import { NEXT_PUBLIC_APP_URL } from "@/config/env"
import { appFont } from "@/config/fonts"
import "./globals.css"

const siteName = "agentatlas"
const defaultTitle = "agentatlas — swarm documentation for coding agents"
const defaultDescription =
  "Canonical skill doc and patterns for multi-agent swarms — graph topologies, workers, sub-agents, tools, and test runs."

export const metadata: Metadata = {
  metadataBase: new URL(NEXT_PUBLIC_APP_URL),
  title: {
    default: defaultTitle,
    template: "%s · agentatlas",
  },
  description: defaultDescription,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName,
    title: defaultTitle,
    description: defaultDescription,
  },
  twitter: {
    card: "summary",
    title: defaultTitle,
    description: defaultDescription,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={appFont.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
