"use client"

import { ServicesProvider } from "@/data/providers/ServicesProvider"
import { Slide, ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./toastify-theme.css"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  )
}
