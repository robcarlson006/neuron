module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'out',
    'mempalace',
    'scripts/generate-icon.js'
  ],
  rules: {
    // TypeScript's noUnusedLocals/noUnusedParameters already enforce this;
    // ESLint's variant flags runtime constructs TS does not (and vice versa),
    // so rely on the compiler to avoid conflicting reports.
    '@typescript-eslint/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    // The codebase predates strict any-elimination; keep as warnings, not errors.
    '@typescript-eslint/no-explicit-any': 'warn',
    // Main-process code legitimately uses console for diagnostics.
    'no-console': 'off',
    // CommonJS require() is used in a few IPC handlers for lazy loading.
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    // Suppressed @ts-* comments are intentional in a few migration seams.
    '@typescript-eslint/ban-ts-comment': 'off',
    // Allow empty catch blocks that intentionally swallow non-fatal errors.
    'no-empty': 'off',
    // React hooks correctness rules.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn'
  }
}
