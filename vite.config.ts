import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * O app e servido de um subcaminho no GitHub Pages, nao da raiz.
 *
 * Este valor precisa concordar com `start_url` e `scope` do manifesto. Se
 * divergirem, o service worker registra no escopo errado, nao encontra os
 * ativos pre-cacheados, e o app abre EM BRANCO pelo icone -- funcionando
 * normalmente no Safari. E um defeito silencioso que so aparece no aparelho.
 */
const BASE = '/finance-control/'

export default defineConfig({
  base: BASE,

  build: {
    // Alvo de plataforma: iOS 16 e superior (NFR-P01, NFR-P02).
    target: ['safari16', 'es2022'],
    // Bundle unico (PAD-10): com cinco telas pequenas, dividir renderia poucos
    // kilobytes e adicionaria requisicoes que, offline, vem do cache de
    // qualquer forma.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  plugins: [
    react(),

    VitePWA({
      registerType: 'prompt', // PAD-09: anunciar, nunca impor
      injectRegister: null, // registro feito manualmente em src/main.tsx

      workbox: {
        // PAD-08: pre-cache completo no install. Cache sob demanda faria uma
        // tela nunca visitada nao abrir offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },

      manifest: {
        name: 'Controle Orçamentário',
        short_name: 'Orçamento',
        description: 'Fluxo de caixa pessoal, offline, com os dados só no seu aparelho',
        lang: 'pt-BR',
        // display standalone e o que faz o app abrir em tela cheia pelo icone,
        // sem barra de endereco.
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        background_color: '#ffffff',
        theme_color: '#1f6feb',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            // O maskable evita que o iOS desenhe uma moldura branca em volta.
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
