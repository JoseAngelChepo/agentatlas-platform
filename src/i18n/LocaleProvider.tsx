"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import en from "@/messages/en.json"
import es from "@/messages/es.json"
import {
  type Locale,
  detectLocaleFromLocation,
  readLocaleFromCookie,
  writeLocaleCookie,
} from "@/i18n/locale"

export type Messages = typeof en

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  messages: Messages
}

const bundles = { en, es } as const satisfies Record<Locale, Messages>

const LocaleContext = createContext<LocaleContextValue | null>(null)

type LocaleProviderProps = {
  children: ReactNode
  initialLocale: Locale
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    const resolved = readLocaleFromCookie() ?? detectLocaleFromLocation()
    writeLocaleCookie(resolved)
    document.documentElement.lang = resolved
    setLocaleState((current) => (current === resolved ? current : resolved))
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeLocaleCookie(next)
    document.documentElement.lang = next
  }, [])

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      messages: bundles[locale],
    }),
    [locale, setLocale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): Pick<LocaleContextValue, "locale" | "setLocale"> {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider")
  }
  return { locale: ctx.locale, setLocale: ctx.setLocale }
}

export function useMessages(): Messages {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error("useMessages must be used within LocaleProvider")
  }
  return ctx.messages
}
