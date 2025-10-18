import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import playwright from 'eslint-plugin-playwright'

export default [
  // Apply to all files
  js.configs.recommended,

  // Vue files configuration
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        atob: 'readonly',
        URLSearchParams: 'readonly',
      },
      parser: vueParser,
      parserOptions: {
        // Always use TypeScript parser for <script> blocks so TS syntax doesn't mask template errors
        parser: typescriptParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      vue,
      '@typescript-eslint': typescript,
    },
    rules: {
      // Ensure SFC template parse errors surface during linting
      'vue/no-parsing-error': 'error',
      ...vue.configs['vue3-essential'].rules,
    },
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        atob: 'readonly',
        URLSearchParams: 'readonly',
      },
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
    },
  },

  // JavaScript files configuration
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        atob: 'readonly',
        URLSearchParams: 'readonly',
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },

  // Test files configuration (Playwright and Cypress)
  {
    files: ['e2e/**/*.{js,ts}', 'tests/**/*.{js,ts}', '**/*.spec.{js,ts}', '**/*.test.{js,ts}', 'cypress/**/*.{js,ts}'],
    plugins: {
      playwright,
    },
    rules: {
      // Forbid waitForTimeout usage in tests
      'playwright/no-wait-for-timeout': 'error',
      
      // No conditionals in tests - applies to both Playwright and Cypress
      'playwright/no-conditional-in-test': 'error',

      // Other recommended Playwright rules
      'playwright/expect-expect': 'error',
      'playwright/max-nested-describe': 'error',
      'playwright/missing-playwright-await': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-force-option': 'warn',
      'playwright/no-nested-step': 'error',
      'playwright/no-page-pause': 'warn',
      'playwright/no-skipped-test': 'warn',
      'playwright/no-useless-await': 'error',
      'playwright/prefer-strict-equal': 'error',
      'playwright/prefer-to-be': 'error',
      'playwright/prefer-to-contain': 'error',
      'playwright/prefer-to-have-length': 'error',
      'playwright/require-top-level-describe': 'error',
      'playwright/valid-describe-callback': 'error',
      'playwright/valid-expect': 'error',
      'playwright/valid-title': 'error',
    },
  },

  // General no-restricted-syntax rule as fallback for any missed cases
  {
    files: ['**/*.{js,ts,vue}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='waitForTimeout']",
          message:
            'waitForTimeout is forbidden. Use more reliable selectors or wait conditions like waitForSelector, waitForLoadState, or expect with timeout options.',
        },
      ],
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.vitepress/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
]
