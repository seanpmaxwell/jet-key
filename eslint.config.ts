import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    // Build output, dependencies, and throwaway `.tmp.js` scratch files.
    ignores: ['lib/', 'node_modules/', '**/*.tmp.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Turns off stylistic rules that would conflict with Prettier
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      eqeqeq: 'error',
      'no-unused-vars': 'off',
      'no-console': 'warn',
      '@typescript-eslint/no-extraneous-class': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
];
