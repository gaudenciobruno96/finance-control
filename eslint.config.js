import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Mensagens usadas pelas regras de fronteira.
const MSG_DOMINIO =
  'src/domain/ nao pode importar de outras camadas nem de bibliotecas de ' +
  'infraestrutura. O dominio e puro: sem banco, sem interface, sem relogio. ' +
  'Ver aidlc-docs/inception/application-design/component-dependency.md'

const MSG_DATA =
  'src/data/ nao pode importar de services nem de ui. A persistencia nao ' +
  'conhece orquestracao nem apresentacao.'

const MSG_SERVICES =
  'src/services/ nao pode importar de ui. A orquestracao nao conhece apresentacao.'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'aidlc-docs/**', 'docs/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------
  // Regra de fronteira de import (NFR-M02).
  //
  // Com pacote unico, esta regra e a UNICA coisa que impede o dominio
  // de perder a pureza. Sem workspaces, nada mais barra um import de
  // src/ui/ dentro de src/domain/ -- e a pureza do dominio e o que
  // sustenta toda a estrategia de teste por propriedades.
  //
  // A verificacao ativa desta regra (Step 15 do plano de geracao) e
  // criterio de conclusao da Unidade 1.
  // ---------------------------------------------------------------
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/data',
                '**/data/**',
                '**/services',
                '**/services/**',
                '**/ui',
                '**/ui/**',
              ],
              message: MSG_DOMINIO,
            },
            {
              group: [
                'dexie',
                'dexie-react-hooks',
                'react',
                'react-dom',
                'react-dom/**',
                'react-router',
                'react-router-dom',
              ],
              message: MSG_DOMINIO,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/data/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services', '**/services/**', '**/ui', '**/ui/**'],
              message: MSG_DATA,
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/services/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui', '**/ui/**'],
              message: MSG_SERVICES,
            },
          ],
        },
      ],
    },
  },
)
