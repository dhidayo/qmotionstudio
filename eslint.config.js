import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The import boundary below is the rule that keeps DECISION D-001 honest:
 * the render core must be importable from an export worker without dragging
 * React into the worker bundle. See DECISIONS.md.
 */
const WORKER_SAFE = ['src/core/**/*.ts', 'src/document/**/*.ts', 'src/templates/**/*.ts', 'src/media/**/*.ts'];

export default defineConfig(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // A leading underscore marks a parameter kept for interface conformance.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: WORKER_SAFE,
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'Worker-safe code must not import React (D-001).' },
          { name: 'react-dom', message: 'Worker-safe code must not import React (D-001).' },
          { name: 'zustand', message: 'Worker-safe code must not import editor state (D-001).' },
        ],
        patterns: [
          { group: ['@/ui/*', '@/state/*'], message: 'Worker-safe code must not import editor UI or state (D-001).' },
        ],
      }],
      // The render core has no DOM globals in a worker.
      'no-restricted-globals': ['error',
        { name: 'document', message: 'Not available in a worker — pass what you need in (D-001).' },
        { name: 'window', message: 'Not available in a worker — pass what you need in (D-001).' },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    rules: { '@typescript-eslint/no-console': 'off' },
  },
);
