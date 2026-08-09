import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],

    // Ambiente padrao `node`: as Unidades 1 e 2 nao dependem de DOM, e montar
    // o jsdom para elas acrescentava dezenas de segundos a cada execucao.
    //
    // Os testes de interface declaram o ambiente individualmente, com
    // `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',

    setupFiles: [
      'src/test-support/indexeddb-setup.ts',
      'src/test-support/dom-setup.ts',
    ],
  },
})
