import type { OxfmtConfig } from 'oxfmt'

// face-platform's settings, so the sibling repos read the same.
export default {
  ignorePatterns: [
    'pnpm-lock.yaml',
    'docs/',
    '**/dist/',
    '**/.eve/',
    '**/.output/',
    'output/',
    'apps/agent/agent/lib/vendor/',
  ],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  trailingComma: 'all',
} satisfies OxfmtConfig
