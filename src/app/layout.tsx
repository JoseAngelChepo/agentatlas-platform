import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { Providers } from "@/app/providers"
import { StyledJsxRegistry } from "@/app/styled-jsx-registry"
import { NEXT_PUBLIC_APP_URL } from "@/config/env"
import { appFont } from "@/config/fonts"
import { LOCALE_COOKIE, resolveServerLocale } from "@/i18n/locale"
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
  alternates: {
    types: {
      "text/plain": [{ url: "/llm.txt", title: "LLM site summary" }],
    },
  },
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const initialLocale = resolveServerLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  )

  return (
    <html lang={initialLocale}>
      <body className={appFont.variable}>
        <StyledJsxRegistry>
          <Providers initialLocale={initialLocale}>{children}</Providers>
        </StyledJsxRegistry>
      </body>
    </html>
  )
}
