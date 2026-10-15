// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.angular/**',
      '**/coverage/**',
      'project-scope-and-direction/**',
      '.playwright-mcp/**',
      'apps/api/prisma/check-drift.js',
    ],
  },

  // TypeScript everywhere
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // API: decorators need runtime imports for DI metadata, so type-only imports are not forced there.
  {
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  { files: ['apps/api/prisma/seed.ts'], rules: { 'no-console': 'off' } },
  { files: ['**/*.spec.ts', 'apps/api/test/**/*.ts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },

  // Angular web app: component rules + accessible templates
  {
    files: ['apps/web/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'sb', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'sb', style: 'camelCase' }],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      // Routed screens end in Page, everything else in Component.
      '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Component', 'Page'] }],
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // Clickable scrims/backdrops are mirrored by a keyboard path (Escape / explicit close button).
      '@angular-eslint/template/click-events-have-key-events': 'off',
      '@angular-eslint/template/interactive-supports-focus': 'off',
    },
  },
);
