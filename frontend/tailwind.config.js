/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0f1015",
        surface: "#181920",
        "surface-card": "#22232c",
        "surface-hover": "#2a2c38",
        border: "rgba(255, 255, 255, 0.08)",
        "border-hover": "rgba(255, 255, 255, 0.16)",
        primary: "#0082ff",
        success: "#49d090",
        warning: "#ff8300",
        danger: "#ff453a",
        gold: "#ffd600"
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        ui: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    },
  },
  plugins: [],
}
