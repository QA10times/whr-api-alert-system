import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        sunk: v('sunk'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        accent: v('accent'),
        'accent-soft': v('accent-soft'),
        ok: v('ok'),
        'ok-bg': v('ok-bg'),
        bad: v('bad'),
        'bad-bg': v('bad-bg'),
        warn: v('warn'),
        'warn-bg': v('warn-bg'),
        idle: v('idle'),
        focus: v('focus'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        hint: ['12.5px', '1.45'],
        meta: ['13px', '1.45'],
        body: ['15px', '1.5'],
        chip: ['11.5px', '1.3'],
      },
      borderRadius: { card: '12px', dialog: '14px', ctl: '8px' },
      maxWidth: { content: '1240px' },
      width: { nav: '232px' },
      screens: { desk: '861px' },
      keyframes: {
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pulseRing: { '0%,100%': { outlineColor: 'rgb(var(--accent) / 1)' }, '50%': { outlineColor: 'rgb(var(--accent) / 0.25)' } },
      },
      animation: { checking: 'pulseRing 1s ease-in-out infinite' },
    },
  },
  plugins: [],
};
export default config;
