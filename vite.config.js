import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Mise à jour auto dès qu'une nouvelle version est détectée
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Limitless MTG',
        short_name: 'Limitless',
        description: 'MTG Limited Data Analysis',
        theme_color: '#020617', // La couleur de ton bg-slate-950
        background_color: '#020617',
        display: 'standalone', // Enlève la barre d'adresse du navigateur
        orientation: 'portrait', // Force le mode portrait (optionnel)
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Important pour les icônes rondes Android
          }
        ]
      }
    })
  ],
})