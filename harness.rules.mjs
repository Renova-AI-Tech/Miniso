/**
 * Regras do produto. Motor: scripts/harness/.
 * Ligar/desligar aqui. Sem invariante de domínio de cliente.
 */
export default {
  ignoreDirectories: [
    'node_modules',
    'dist',
    '.git',
    'playwright-report',
    'test-results',
    'coverage',
    'uploads',
    'agent-tools',
    '.pnpm-store',
    '.husky',
    '.claude',
    '.cursor',
  ],
  textExtensions: [
    '.md',
    '.mjs',
    '.js',
    '.ts',
    '.tsx',
    '.css',
    '.json',
    '.html',
    '.yml',
    '.yaml',
    '.sh',
  ],
  rules: {
    'docs-link': {
      enabled: true,
      ignoreGlobs: ['docs/specs/_templates/**'],
    },
    'docs-index': {
      enabled: true,
      indexFile: 'docs/index.md',
      scanDirectory: 'docs',
    },
    'spec-tests': {
      enabled: true,
      tasksGlob: 'docs/specs/**/tasks.md',
    },
    'spec-status': {
      enabled: true,
      tasksGlob: 'docs/specs/**/tasks.md',
      allowed: ['todo', 'in_progress', 'done', 'blocked'],
    },
    'test-nondeterminism': {
      enabled: true,
    },
    'test-timeout': {
      enabled: true,
      minMs: 1000,
    },
    'no-console': {
      enabled: true,
      allow: [],
    },
    'env-centralized': {
      enabled: true,
      allowedFiles: [
        '**/env.ts',
        '**/env.mjs',
        '**/*.config.ts',
        '**/*.config.mjs',
        '**/*.config.js',
        'scripts/**',
        'templates/modules/auth/files/scripts/**', // Same operational scripts before composition.
        '.railway/railway.ts', // Railway configuration entry point; never browser/runtime code.
        'harness.rules.mjs',
        'playwright.config.ts',
      ],
    },
    'import-direction': {
      enabled: true,
    },
  },
};
