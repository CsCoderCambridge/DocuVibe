import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0B57D0",
          dark: "#0842A0",
          container: "#D3E3FD",
          on: "#041E49",
        },
        surface: {
          DEFAULT: "#F8FAFD",
          variant: "#E9EEF6",
        },
      },
      fontFamily: {
        sans: ["Roboto", "system-ui", "Segoe UI", "Arial", "sans-serif"],
        urdu: ['"Noto Nastaliq Urdu"', '"Jameel Noori Nastaleeq"', "serif"],
      },
      boxShadow: {
        md1: "0 1px 2px rgba(0,0,0,0.12), 0 1px 3px 1px rgba(0,0,0,0.06)",
        md2: "0 1px 2px rgba(0,0,0,0.14), 0 2px 6px 2px rgba(0,0,0,0.08)",
      },
      keyframes: {
        wave: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        wave: "wave 0.9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
