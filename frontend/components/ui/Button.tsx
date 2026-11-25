import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-[rgb(var(--on-accent))] border-accent hover:opacity-90',
  secondary: 'bg-panel text-ink border-line hover:bg-sunk',
  danger: 'bg-panel text-bad border-bad hover:bg-bad-bg',
  ghost: 'bg-transparent text-accent border-transparent underline-offset-2 hover:underline',
};
const sizes: Record<Size, string> = {
  md: 'min-h-[40px] px-4 text-meta',
  sm: 'min-h-[32px] px-2.5 text-[12.5px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="animate-spin" size={14} aria-hidden />}
      {children}
    </button>
  );
});
