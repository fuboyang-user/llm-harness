// LLM Harness logo — central core with orbital ring and satellite nodes.
// Color rides currentColor (wordmark ink). Native viewBox 32x32, rendered at
// the requested `size` (default 24).

import type { IconProps } from './icons/props.ts'

/**
 * Render the LLM Harness logo.
 * @param props.size - width in px (default 24; square aspect).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      {/* Central core */}
      <circle cx="16" cy="16" r="4.2" fill="currentColor" />
      {/* Orbital ring */}
      <ellipse
        cx="16" cy="16" rx="12" ry="5"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        transform="rotate(-30 16 16)"
      />
      {/* Satellite nodes */}
      <circle cx="5.5" cy="11" r="2" fill="currentColor" />
      <circle cx="26.5" cy="21" r="2" fill="currentColor" />
      <circle cx="22" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="10" cy="24.5" r="1.5" fill="currentColor" />
    </svg>
  )
}
