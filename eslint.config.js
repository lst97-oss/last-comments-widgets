import js from '@eslint/js'
import angular from 'angular-eslint'
import prettier from 'eslint-config-prettier/flat'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  {
    files: ['packages/angular/**/*.ts'],
    extends: [js.configs.recommended, ...ts.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: { globals: globals.browser },
    rules: {
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'lc', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'lc', style: 'camelCase' }],
    },
  },
  {
    files: ['packages/angular/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['packages/vue/**/*.{ts,vue}'],
    extends: [js.configs.recommended, ...ts.configs.recommended, ...vue.configs['flat/recommended']],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: ts.parser },
    },
    rules: {
      // Comments is the public widget's existing component name.
      'vue/multi-word-component-names': ['error', { ignores: ['Comments'] }],
    },
  },
  prettier,
)
