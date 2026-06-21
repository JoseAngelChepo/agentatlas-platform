import { cn } from "@/lib/utils"

type Props = {
  size?: number
  className?: string
  variant?: "filled" | "outline"
}

/** Flat mark: rounded square with swarm graph — use inside AppLogo or alone. */
export default function LogoMark({ size = 24, className }: Props) {
  return (
    <img
      src="/logo-atlas.png"
      alt="AgentAtlas Logo"
      width={size}
      height={size}
      className={cn(className)}
      style={{ display: "block", objectFit: "contain", width: size, height: size }}
    />
  )
}

