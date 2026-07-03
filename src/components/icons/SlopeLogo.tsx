interface SlopeLogoProps {
  size?: number
  className?: string
}

/**
 * Ícone assinatura do app: perfil de talude em linha única com o arco do
 * círculo crítico cortando a face. Usado no header, sidebar colapsada e favicon.
 */
export function SlopeLogo({ size = 28, className }: SlopeLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2 26 H9 L20 8 H30"
        stroke="var(--color-text-primary, #ECF0F1)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 30 A15 15 0 0 1 24 6"
        stroke="var(--color-accent-red, #E74C3C)"
        strokeWidth="1.6"
        strokeDasharray="3 2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
