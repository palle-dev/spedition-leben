/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i, `${i / 100}`])),
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        ink: 'hsl(var(--ink))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          '2': 'hsl(var(--surface-2))'
        },
        lime: 'hsl(var(--lime))',
        coral: 'hsl(var(--coral))',
        line: 'hsl(var(--line))',
        invest: {
          purple: 'hsl(var(--invest-purple))',
          cyan: 'hsl(var(--invest-cyan))',
        },
        office: {
          DEFAULT: 'hsl(var(--office))',
          light: 'hsl(var(--office-2))',
          '2': 'hsl(var(--office-2))'
        },
        wood: {
          DEFAULT: 'hsl(var(--wood))',
          light: 'hsl(var(--wood))'
        },
        chart: {
          '1': 'hsl(var(--chart-1, 79 94% 75%))',
          '2': 'hsl(var(--chart-2, 15 100% 81%))',
          '3': 'hsl(var(--chart-3, 190 21% 50%))',
          '4': 'hsl(var(--chart-4, 43 74% 66%))',
          '5': 'hsl(var(--chart-5, 27 87% 67%))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)']
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'reveal': { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop': { '0%': { transform: 'scale(.6)', opacity: '0' }, '65%': { transform: 'scale(1.05)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'pulse-ring': { '0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--lime) / 0.15)' }, '50%': { boxShadow: '0 0 0 12px hsl(var(--lime) / 0.04)' } },
        'flow': { to: { strokeDashoffset: '-100' } },
        'road-flow': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-36px)' } }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'reveal': 'reveal 0.6s cubic-bezier(.2,.75,.2,1) both',
        'pop': 'pop 0.6s cubic-bezier(.2,.75,.2,1) both',
        'pulse-ring': 'pulse-ring 1.8s ease-in-out infinite',
        'flow': 'flow 12s linear infinite',
        'road-flow': 'road-flow 0.35s linear infinite'
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
}
