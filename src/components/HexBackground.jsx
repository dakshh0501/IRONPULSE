import { BRAND } from '../config/branding'

export default function HexBackground({ opacity = 0.04, color = BRAND.color }) {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100%',
        opacity, pointerEvents: 'none', zIndex: 0,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="hexgrid" width="56" height="97" patternUnits="userSpaceOnUse">
          <path d="M28 0L56 16.17V48.5L28 64.67L0 48.5V16.17Z" fill="none" stroke={color} strokeWidth="1" />
          <path d="M28 32.33L56 48.5V80.83L28 97L0 80.83V48.5Z" fill="none" stroke={color} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hexgrid)" />
    </svg>
  )
}
