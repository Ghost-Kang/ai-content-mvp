import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      animation: {
        "aurora-spin":   "aurora-spin 8s linear infinite",
        "float-slow":    "float-slow 6s ease-in-out infinite",
        "shine":         "shine 2.4s ease-in-out infinite",
        "pulse-soft":    "pulse-soft 2.6s ease-in-out infinite",
        "pipeline-flow": "pipeline-flow 3.2s ease-in-out infinite",
        "node-glow":     "node-glow 2.8s ease-in-out infinite",
        "heartbeat":     "heartbeat 1.4s ease-in-out infinite",
        "heart-glow":    "heart-glow 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
