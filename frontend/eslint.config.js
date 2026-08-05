import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import security from 'eslint-plugin-security'
import noUnsanitized from 'eslint-plugin-no-unsanitized'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // ── SAST: Security Plugin ──────────────────────────────────────────────────
  // Detects: unsafe regex, dynamic requires, Object prototype pollution,
  // insecure randomness, path traversal, eval() usage, etc.
  {
    files: ['**/*.{js,jsx}'],
    plugins: { security },
    rules: {
      'security/detect-object-injection':        'warn',
      'security/detect-non-literal-regexp':      'warn',
      'security/detect-non-literal-require':     'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression':    'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes':       'warn',
      'security/detect-unsafe-regex':            'warn',
      'security/detect-buffer-noassert':         'warn',
      'security/detect-child-process':           'warn',
      'security/detect-disable-mustache-escape': 'warn',
      'security/detect-new-buffer':              'warn',
    },
  },

  // ── SAST: XSS / No-Unsanitized Plugin ─────────────────────────────────────
  // Detects direct use of innerHTML, dangerouslySetInnerHTML, and other XSS
  // injection sinks with unsanitized user-controlled values.
  {
    files: ['**/*.{js,jsx}'],
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      'no-unsanitized/method':   'warn',
      'no-unsanitized/property': 'warn',
    },
  },
])

