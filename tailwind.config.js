/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Branch lane palette - colorblind-friendly distinct hues.
        lane: {
          0: "#60a5fa",
          1: "#34d399",
          2: "#f472b6",
          3: "#fbbf24",
          4: "#a78bfa",
          5: "#fb7185",
          6: "#22d3ee",
          7: "#facc15",
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
