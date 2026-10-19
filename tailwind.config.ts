import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#08090c",
        foreground: "#f3f4f6",
        surface: {
          50: "#181b22",
          100: "#13151b",
          200: "#0f1116",
          300: "#0a0b0e",
          border: "#232834",
        },
        brand: {
          DEFAULT: "#8b5cf6",
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          neon: "#a855f7",
        },
        cyanAccent: {
          DEFAULT: "#06b6d4",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          neon: "#00f0ff",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-orbitron)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px -5px rgba(139, 92, 246, 0.4)",
        "glow-cyan": "0 0 20px -5px rgba(6, 182, 212, 0.4)",
        "glow-sm": "0 0 10px -2px rgba(139, 92, 246, 0.3)",
      },
    },
  },
  plugins: [],
};
export default config;
