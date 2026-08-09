/**
 * Ajustes de ambiente para os testes de interface.
 *
 * Aplicado apenas onde ha DOM: os arquivos de teste de interface declaram
 * `// @vitest-environment jsdom` no topo, e este setup verifica a presenca de
 * `window` antes de tocar em qualquer coisa.
 *
 * O jsdom nao implementa `matchMedia`, usado pelo tema. E suprido aqui para
 * que o codigo de producao nao precise de desvio para teste.
 */

if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')

  if (window.matchMedia === undefined) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}

export {}
