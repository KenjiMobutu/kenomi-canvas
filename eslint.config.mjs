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
      // React Compiler experimental lints
      // - set-state-in-effect: désactivé. Audit a montré que les ~10 cas sont
      //   tous des patterns valides (fetch async puis setState, reset état
      //   dérivé sur changement de filter). La règle vise une migration vers
      //   SWR/React Query/use() qui est hors-scope court terme. À réactiver
      //   après refactor data-fetching.
      // - immutability + preserve-manual-memoization: warn pour signaler les
      //   patterns à refactor sans bloquer.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]

export default config
