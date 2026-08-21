import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Le diary reutilise des composants de Limitless (CardImage, CmcStack) et
    // des helpers qui RENVOIENT des chaines de classes Tailwind
    // (calculateGrade, getDeltaStyle). Sans ces fichiers dans le content, les
    // classes correspondantes ne sont jamais generees.
    "../src/utils/*.ts",
    "../src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  // prose-* pour le rendu markdown des rapports hebdo
  plugins: [typography],
}
