import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// App locale, séparée de Limitless (port 5173). Pas de plugin PWA : outil de
// bureau, un service worker n'apporterait rien et complique le debug.
//
// L'alias `@limitless` pointe vers les sources de Limitless pour réutiliser la
// logique pure (parseMtgaDeck, calculateGrade, deckAnalysisCore) sans dupliquer
// de code. N'importer que des modules SANS dépendance React depuis là.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@limitless': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    fs: {
      // `@limitless` résout hors du root de cette app : il faut autoriser
      // explicitement le dossier parent, sinon Vite refuse de servir les fichiers.
      allow: ['..'],
    },
  },
})
