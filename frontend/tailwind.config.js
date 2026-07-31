/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // NOTE: background / primary / surface-* deliberately removed. They
        // were Material leftovers that shadowed shadcn's own tokens, which is
        // why bg-primary was rendering peach. Those names now resolve to the
        // CSS variables in index.css.
        racing: "#ff2d3c",
        outline: "#27374a",

        // Timing semantics
        fastest: "#b14cff",
        personal: "#00d46a",
        slower: "#ffd024",

        // Tyre compounds, straight from the FIA sidewall colours
        soft: "#ff2d3c",
        medium: "#ffd024",
        hard: "#e8eef4",
        intermediate: "#00d46a",
        wet: "#2f9fff",
      },
      fontFamily: {
        headline: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["IBM Plex Mono", "monospace"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
