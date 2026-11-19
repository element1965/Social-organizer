import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/', '**/node_modules/', '**/.turbo/', '**/build/', '**/.gradle/',
    'apps/web/android/app/src/main/assets/public/', 'apps/web/ios/App/App/public/',
    'docs/redesign/mockups/',
    // Local-only material and other checkouts (agent worktrees live under .claude/worktrees)
    '.claude/', 'local/',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    extends: [js.configs.recommended],
    rules: {
      // Report existing declaration, assignment and error-chaining debt without blocking CI.
      'no-unused-vars': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['docs/**/*.mjs'],
    // Video capture scripts also run callbacks inside a browser page.
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommended],
    rules: {
      // Existing weakly typed boundaries and declaration style need a separate cleanup.
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
    },
  },
  {
    files: ['apps/web/src/components/onboarding/flow.ts'],
    rules: { 'no-control-regex': 'off' }, // The sanitizer deliberately matches control characters.
  },
  {
    files: ['packages/tg-adapter/src/index.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': ['error', { path: 'always' }] },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/graph-3d/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Effect dependencies need individual review. The React Compiler rules are opt-in.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
