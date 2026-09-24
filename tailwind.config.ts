import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

/**
 * Os tokens em index.css são cores completas (`hsl(...)`), não canais soltos.
 * Para que modificadores de opacidade (`bg-primary/10`, `text-primary/60`,
 * `ring-ring/25`, `from-brand-soft`...) funcionem, cada token vira uma função
 * que mistura a cor com transparente via `color-mix()`. Sem isto, Tailwind
 * descartava silenciosamente qualquer classe com `/opacidade` nesses tokens.
 */
const token = (name: string) =>
  (({ opacityValue }: { opacityValue?: string | number }) =>
    opacityValue === undefined
      ? `var(--${name})`
      : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
          hover: token("primary-hover"),
        },
        brand: {
          soft: token("brand-soft"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
        },
        // Semânticos (23/09): bg-success-soft text-success, bg-warning-soft text-warning...
        success: { DEFAULT: token("success"), soft: token("success-soft"), strong: token("success-strong") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft"), strong: token("warning-strong") },
        info: { DEFAULT: token("info"), soft: token("info-soft"), strong: token("info-strong") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft"), strong: token("danger-strong") },
        neutral: { DEFAULT: token("neutral"), soft: token("neutral-soft") },
        surface: { muted: token("surface-muted") },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        chart: {
          "1": token("chart-1"),
          "2": token("chart-2"),
          "3": token("chart-3"),
          "4": token("chart-4"),
          "5": token("chart-5"),
        },
        sidebar: {
          DEFAULT: token("sidebar-background"),
          foreground: token("sidebar-foreground"),
          primary: token("sidebar-primary"),
          "primary-foreground": token("sidebar-primary-foreground"),
          accent: token("sidebar-accent"),
          "accent-foreground": token("sidebar-accent-foreground"),
          border: token("sidebar-border"),
          ring: token("sidebar-ring"),
        },
      },
      // Elevação em 3 níveis (23/09) — substitui 25 sombras arbitrárias com 6 cores-base.
      boxShadow: {
        1: "var(--elevation-1)",
        2: "var(--elevation-2)",
        3: "var(--elevation-3)",
      },
      // Tamanho mínimo legível (23/09): text-2xs = 11px substitui os 898 usos de text-[11px].
      // Os demais tamanhos ficam no padrão do Tailwind para não mexer no app inteiro.
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
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
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
