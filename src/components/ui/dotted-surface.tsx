"use client"

import { cn } from "@/lib/utils"
import { useEffect, useRef } from "react"
import * as THREE from "three"
import styles from "./dotted-surface.module.css"

const SEPARATION = 150
const AMOUNTX = 40
const AMOUNTY = 60

type DottedSurfaceLayout = "fixed" | "contained"

type DottedSurfaceProps = Omit<React.ComponentProps<"div">, "ref"> & {
  /** `fixed` matches the 21st demo (full viewport). `contained` fills a positioned parent (hero). */
  layout?: DottedSurfaceLayout
}

export function DottedSurface({ className, layout = "contained", ...props }: DottedSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    particles: THREE.Points[]
    animationId: number
  } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xffffff, 2000, 10000)

    const camera = new THREE.PerspectiveCamera(60, 1, 1, 10000)
    camera.position.set(0, 355, 1220)

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(scene.fog.color, 0)
    renderer.domElement.className = styles.canvas ?? ""
    container.appendChild(renderer.domElement)

    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const colors: number[] = []

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2
        const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2

        positions.push(x, 0, z)
        colors.push(200, 200, 200)
      }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 8,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    let count = 0
    let animationId = 0

    const measure = () => {
      if (layout === "fixed") {
        return { width: window.innerWidth, height: window.innerHeight }
      }

      const { width, height } = container.getBoundingClientRect()
      return { width: Math.max(1, width), height: Math.max(1, height) }
    }

    const handleResize = () => {
      const { width, height } = measure()
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, layout !== "fixed")
    }

    const animate = () => {
      animationId = requestAnimationFrame(animate)

      const positionAttribute = geometry.attributes.position
      if (positionAttribute) {
        const positionArray = positionAttribute.array as Float32Array

        let i = 0
        for (let ix = 0; ix < AMOUNTX; ix++) {
          for (let iy = 0; iy < AMOUNTY; iy++) {
            const index = i * 3
            positionArray[index + 1] =
              Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50
            i++
          }
        }

        positionAttribute.needsUpdate = true
      }

      renderer.render(scene, camera)
      count += 0.1
    }

    handleResize()
    animate()

    sceneRef.current = {
      scene,
      camera,
      renderer,
      particles: [points],
      animationId,
    }

    const onWindowResize = () => {
      handleResize()
    }

    let resizeObserver: ResizeObserver | undefined
    if (layout === "contained") {
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
    }

    window.addEventListener("resize", onWindowResize)

    return () => {
      window.removeEventListener("resize", onWindowResize)
      resizeObserver?.disconnect()
      cancelAnimationFrame(animationId)

      geometry.dispose()
      material.dispose()
      renderer.dispose()

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }

      sceneRef.current = null
    }
  }, [layout])

  return (
    <div
      ref={containerRef}
      className={cn(layout === "fixed" ? styles.rootFixed : styles.rootContained, className)}
      aria-hidden="true"
      {...props}
    />
  )
}
