"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IoCheckmark, IoChevronForward, IoCopyOutline } from "react-icons/io5"
import { landingContent } from "@/content/landing"
import { AGENTATLAS_AGENT_SETUP_COMMAND, AGENTATLAS_SWARM_SKILL_PUBLIC_URL } from "@/lib/agentatlas-skill"
import styles from "./skill-copy-command.module.css"

const COPIED_RESET_MS = 2000

export default function SkillCopyCommand() {
  const { skill } = landingContent.hero
  const [copied, setCopied] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  const copyCommand = useCallback(async () => {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current)
    }

    setCopied(true)
    resetTimeoutRef.current = window.setTimeout(() => {
      setCopied(false)
      resetTimeoutRef.current = null
    }, COPIED_RESET_MS)

    try {
      await navigator.clipboard.writeText(AGENTATLAS_AGENT_SETUP_COMMAND)
    } catch {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
        resetTimeoutRef.current = null
      }
      setCopied(false)
    }
  }, [])

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>{skill.hint}</p>
      <div className={styles.shell}>
        <div className={styles.inner}>
          <div className={styles.field}>
            <div className={styles.commandScroll}>
              <IoChevronForward className={styles.chevron} aria-hidden />
              <span className={styles.cursor} aria-hidden />
              <span className={styles.command}>
                <span className={styles.setupWord}>set up</span>{" "}
                <span className={styles.setupUrl}>{AGENTATLAS_SWARM_SKILL_PUBLIC_URL}</span>
              </span>
            </div>
          </div>
          <span className={styles.divider} aria-hidden />
          <button
            type="button"
            className={`${styles.copy}${copied ? ` ${styles.copyDone}` : ""}`}
            onClick={(event) => {
              void copyCommand()
              event.currentTarget.blur()
            }}
            aria-label={copied ? "Copied" : "Copy command"}
          >
            {copied ? (
              <IoCheckmark className={styles.copyIcon} aria-hidden />
            ) : (
              <IoCopyOutline className={styles.copyIcon} aria-hidden />
            )}
          </button>
        </div>
      </div>
      <p className={styles.footerHint}>{skill.footerHint}</p>
    </div>
  )
}
