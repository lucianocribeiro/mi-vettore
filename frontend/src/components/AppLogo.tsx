type Props = {
  size?: number;
  className?: string;
  title?: string;
};

/** Logo Mi Vettore: triángulo invertido azul con borde blanco. */
export function AppLogo({
  size = 32,
  className = "",
  title = "Mi Vettore",
}: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
      style={{ flexShrink: 0 }}
    >
      <title>{title}</title>
      <polygon
        points="16,28 4,6 28,6"
        fill="#2563EB"
        stroke="#FFFFFF"
        strokeWidth="2.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
