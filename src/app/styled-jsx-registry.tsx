"use client"

import { useState, type ReactNode } from "react"
import { useServerInsertedHTML } from "next/navigation"
import { StyleRegistry, createStyleRegistry } from "styled-jsx"

export function StyledJsxRegistry({ children }: { children: ReactNode }) {
  const [jsxStyleRegistry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>
}
