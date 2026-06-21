export type Locale = "en" | "es"

export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_COOKIE = "NEXT_LOCALE"

const SPANISH_TIMEZONES = new Set([
  "America/Mexico_City",
  "America/Cancun",
  "America/Merida",
  "America/Monterrey",
  "America/Matamoros",
  "America/Mazatlan",
  "America/Chihuahua",
  "America/Ojinaga",
  "America/Hermosillo",
  "America/Tijuana",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Caracas",
  "America/La_Paz",
  "America/Asuncion",
  "America/Guayaquil",
  "America/Panama",
  "America/Costa_Rica",
  "America/Guatemala",
  "America/El_Salvador",
  "America/Tegucigalpa",
  "America/Managua",
  "Europe/Madrid",
  "Atlantic/Canary",
])

export function parseLocaleCookieValue(value: string | undefined | null): Locale | null {
  const v = value?.trim()
  if (v === "es" || v === "en") return v
  return null
}

export function readLocaleFromCookie(): Locale | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))
  return parseLocaleCookieValue(m?.[1])
}

/** Server render: cookie wins, then Accept-Language, then default. */
export function resolveServerLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  const fromCookie = parseLocaleCookieValue(cookieValue)
  if (fromCookie) return fromCookie

  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const tag = part.split(";")[0]?.trim().toLowerCase()
      if (!tag) continue
      if (tag === "es" || tag.startsWith("es-")) return "es"
    }
  }

  return DEFAULT_LOCALE
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; SameSite=Strict${secure}`
}

/** First visit: infer locale from browser language and timezone (Americas / Spain → es). */
export function detectLocaleFromLocation(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of languages) {
    const tag = raw?.trim().toLowerCase()
    if (!tag) continue
    if (tag === "es" || tag.startsWith("es-")) return "es"
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && SPANISH_TIMEZONES.has(tz)) return "es"
  } catch {
    /* ignore */
  }

  return DEFAULT_LOCALE
}

export function resolveInitialLocale(): Locale {
  return readLocaleFromCookie() ?? detectLocaleFromLocation()
}
