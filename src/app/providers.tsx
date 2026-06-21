"use client"

import { ServicesProvider } from "@/data/providers/ServicesProvider"
import { LocaleProvider } from "@/i18n/LocaleProvider"
import type { Locale } from "@/i18n/locale"
import { Slide, ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./toastify-theme.css"

type ProvidersProps = {
  children: React.ReactNode
  initialLocale: Locale
}

export function Providers({ children, initialLocale }: ProvidersProps) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
    <ServicesProvider>
      {children}
      <ToastContainer
        position="bottom-right"
        transition={Slide}
        autoClose={4200}
        newestOnTop
        limit={5}
        theme="dark"
        hideProgressBar={false}
        closeOnClick={false}
        pauseOnHover
        draggable={false}
        className="app-toastify-host"
      />
    </ServicesProvider>
    </LocaleProvider>
  )
}
