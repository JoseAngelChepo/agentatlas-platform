"use client"

import LandingHeader from "@/components/landing/LandingHeader"
import ArchitecturesSection from "@/components/landing/ArchitecturesSection"
import HeroSection from "@/components/landing/sections/HeroSection"
import LandingFooter from "@/components/landing/sections/LandingFooter"

/** Pull overlap into hero mesh; pad slightly less than pull to raise catalog content. */
const ARCH_STACK_PULL = "calc(100dvh - 3.75rem - 12rem)"
const ARCH_STACK_PAD = "calc(100dvh - 3.75rem - 17rem)"

export default function LandingPage() {
  return (
    <div className="page landing-snap">
      <LandingHeader />
      <main className="main">
        <div className="heroStage">
          <HeroSection />
          <div
            id="landing-architectures-panel"
            className="archStack"
            style={
              {
                "--arch-stack-pull": ARCH_STACK_PULL,
                "--arch-stack-pad": ARCH_STACK_PAD,
              } as React.CSSProperties
            }
          >
            <ArchitecturesSection />
          </div>
        </div>
        <LandingFooter />
      </main>
      <style jsx global>{`
        @media (prefers-reduced-motion: no-preference) {
          html:has(.landing-snap) {
            scroll-snap-type: y proximity;
          }
        }
        .archStack :global(.section--compact) {
          background: transparent;
          padding-top: 0;
        }
      `}</style>
      <style jsx>{`
        .page {
          min-height: 100vh;
          background: var(--app-bg);
        }
        .main {
          position: relative;
          isolation: isolate;
        }
        .heroStage {
          position: relative;
          isolation: isolate;
        }
        .archStack {
          position: relative;
          z-index: 3;
          margin-top: calc(-1 * var(--arch-stack-pull));
          padding-top: var(--arch-stack-pad);
        }
      `}</style>
    </div>
  )
}
