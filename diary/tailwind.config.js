import typography from '@tailwindcss/typography'

/**
 * Thème « papier » du diary : encre noire sur crème, bordures pleines et
 * ombres dures (0 flou). L'emerald #10B981 reste la couleur de marque, mais il
 * est éclaté en trois rôles — lavis de fond, remplissage de signal, encre
 * verte — parce qu'un seul ton saturé ne tient pas sur de grandes surfaces.
 *
 * @type {import('tailwindcss').Config}
 */
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
    extend: {
      colors: {
        // Surfaces
        paper: {
          DEFAULT: '#FBF6EC', // fond de page quadrillé
          raised: '#FFFCF6', // cartes
          sunk: '#F1EADC', // plages creusées (pistes de barres, cases vides)
        },
        // Encre
        ink: {
          DEFAULT: '#141310', // texte principal + toutes les bordures
          soft: '#6E6A5E', // texte secondaire
          faint: '#9C9788', // labels, unités, placeholders
        },
        // Marque : ton conservé, décliné pour chaque rôle
        brand: {
          DEFAULT: '#10B981', // remplissage plein (CTA, barres, jauges)
          wash: '#EFF9F3', // lavis le plus pâle (blocs internes, listes)
          soft: '#DFF3E7', // lavis de surface (cartes héros)
          mid: '#A7E3C6', // état intermédiaire (heatmap, hover)
          ink: '#05614A', // texte/bordure verte sur lavis
        },
        // Signaux : mêmes rôles que la marque, transposés sur papier
        loss: { DEFAULT: '#E4572E', soft: '#FBE2D8' },
        info: { DEFAULT: '#3D7BE8', soft: '#DCE7FB' }, // palier intermédiaire des scores
        warn: { DEFAULT: '#E8A317', soft: '#FBEED0' },
        trophy: { DEFAULT: '#8B5CF6', soft: '#E9E0FF' },
        // Plaque sombre insérée dans le papier (visuels de cartes MTG)
        plate: '#1B1A16',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        // Ombres dures : décalage, aucun flou. C'est la signature du style.
        brut: '3px 3px 0 0 #141310',
        'brut-sm': '2px 2px 0 0 #141310',
        'brut-lg': '5px 5px 0 0 #141310',
      },
      letterSpacing: {
        micro: '0.14em',
      },
    },
  },
  // prose-* pour le rendu markdown des rapports hebdo
  plugins: [typography],
}
