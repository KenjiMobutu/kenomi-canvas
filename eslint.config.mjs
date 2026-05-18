import nextConfig from 'eslint-config-next/core-web-vitals'
import tsEslint from 'typescript-eslint'

const config = [
  ...nextConfig,
  {
    plugins: {
      '@typescript-eslint': tsEslint.plugin,
    },
    rules: {
      // New rules added by this config
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Downgrade to warn for existing code patterns (rules come from eslint-plugin-react-hooks recommended)
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]

export default config
