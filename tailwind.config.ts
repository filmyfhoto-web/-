import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        // NATTA GROUP landing mockup tokens
        nt: {
          navy: "hsl(var(--nt-navy))",
          "navy-soft": "hsl(var(--nt-navy-soft))",
          cream: "hsl(var(--nt-cream))",
          mist: "hsl(var(--nt-mist))",
          blue: "hsl(var(--nt-blue))",
          "blue-deep": "hsl(var(--nt-blue-deep))",
          beige: "hsl(var(--nt-beige))",
          line: "hsl(var(--nt-line))",
          muted: "hsl(var(--nt-muted))",
        },
        // NATTA GROUP dashboard tokens — ห้าม hardcode hex ในหน้าแดชบอร์ด
        ng: {
          ink: "hsl(var(--ng-ink))",
          muted: "hsl(var(--ng-muted))",
          soft: "hsl(var(--ng-soft))",
          body: "hsl(var(--ng-body))",
          line: "hsl(var(--ng-line))",
          "line-soft": "hsl(var(--ng-line-soft))",
          divider: "hsl(var(--ng-divider))",
          tint: "hsl(var(--ng-tint))",
          "tint-hover": "hsl(var(--ng-tint-hover))",
          "card-hover": "hsl(var(--ng-card-hover))",
          purple: "hsl(var(--ng-purple))",
          "purple-deep": "hsl(var(--ng-purple-deep))",
          "purple-soft": "hsl(var(--ng-purple-soft))",
          "purple-tint": "hsl(var(--ng-purple-tint))",
          "purple-tint2": "hsl(var(--ng-purple-tint2))",
          lavender: "hsl(var(--ng-lavender))",
          blue: "hsl(var(--ng-blue))",
          "blue-tint": "hsl(var(--ng-blue-tint))",
          orange: "hsl(var(--ng-orange))",
          "orange-deep": "hsl(var(--ng-orange-deep))",
          "orange-tint": "hsl(var(--ng-orange-tint))",
          green: "hsl(var(--ng-green))",
          "green-deep": "hsl(var(--ng-green-deep))",
          "green-tint": "hsl(var(--ng-green-tint))",
          pink: "hsl(var(--ng-pink))",
          "pink-tint": "hsl(var(--ng-pink-tint))",
          chip: "hsl(var(--ng-chip))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        group: {
          colorlab: { DEFAULT: "hsl(var(--group-colorlab))", foreground: "hsl(var(--group-colorlab-foreground))" },
          printing: { DEFAULT: "hsl(var(--group-printing))", foreground: "hsl(var(--group-printing-foreground))" },
          filmshop: { DEFAULT: "hsl(var(--group-filmshop))", foreground: "hsl(var(--group-filmshop-foreground))" },
          queue: { DEFAULT: "hsl(var(--group-queue))", foreground: "hsl(var(--group-queue-foreground))" },
        },
        docbot: { DEFAULT: "hsl(var(--docbot))", foreground: "hsl(var(--docbot-foreground))" },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          deep: "hsl(var(--brand-deep))",
          bright: "hsl(var(--brand-bright))",
          lavender: "hsl(var(--brand-lavender))",
          ink: "hsl(var(--brand-ink))",
          foreground: "hsl(var(--brand-foreground))",
        },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(0 0% 100%)" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(0 0% 100%)" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(0 0% 100%)" },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
