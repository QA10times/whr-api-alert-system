/** Five-bar product mark: four green, one red — echoes the 5-hit rule. */
export function Mark({ size = 22 }: { size?: number }) {
  const h = [10, 14, 8, 18, 14];
  return (
    <svg width={size * 1.2} height={size} viewBox="0 0 30 22" aria-hidden>
      {h.map((bar, i) => (
        <rect
          key={i}
          x={i * 6}
          y={22 - bar}
          width={4.5}
          height={bar}
          rx={1}
          fill={i === 4 ? 'rgb(var(--bad))' : 'rgb(var(--ok))'}
        />
      ))}
    </svg>
  );
}
