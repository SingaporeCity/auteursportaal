// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import securityPlugin from 'eslint-plugin-security';
import noSecretsPlugin from 'eslint-plugin-no-secrets';
import noUnsanitizedPlugin from 'eslint-plugin-no-unsanitized';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.husky/**',
      'supabase/.temp/**',
      'tests/e2e/**', // Playwright heeft eigen TS-pipeline + tsconfig
      'scripts/**', // Node CLI-scripts (.mjs); strict TS-regels niet relevant
      'supabase/functions/**', // Deno Edge Functions, andere TS-config
    ],
  },

  // Algemene JS-regels (alle files)
  js.configs.recommended,

  // Type-aware regels — alleen op TS files in src/
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'no-secrets': noSecretsPlugin,
      'no-unsanitized': noUnsanitizedPlugin,
    },
    rules: {
      'no-secrets/no-secrets': ['error', { tolerance: 4.5 }],
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false },
      ],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-alert': 'error',
      'no-debugger': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],

      // De security/detect-object-injection regel geeft veel false-positives op
      // bekende key-lookups (i18n, type-safe object access). De n0-secrets/
      // no-unsanitized regels dekken de echte risico's af.
      'security/detect-object-injection': 'off',
    },
  },

  // Security plugin op alle TS/JS — eval, regex DoS, child_process, etc.
  // Object-injection is per file uitgezet (zie hierboven en hieronder).
  {
    files: ['**/*.{js,ts}'],
    ...securityPlugin.configs.recommended,
    rules: {
      ...securityPlugin.configs.recommended.rules,
      'security/detect-object-injection': 'off',
    },
  },

  // Test-bestanden mogen wat losser zijn
  {
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-secrets/no-secrets': 'off',
    },
  },

  // Config-files (vite, playwright, vitest) — Node-context, niet type-aware
  {
    files: ['*.config.ts', '*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  }
);
