import { lineNumberAt } from '../walk.mjs';

const PATTERNS = [
  {
    id: 'math-random',
    re: /\bMath\.random\s*\(/g,
    message: 'Math.random nos testes; use seed (fast-check) ou fixture',
  },
  { id: 'date-now', re: /\bDate\.now\s*\(/g, message: 'Date.now() nos testes; congele o relógio' },
  {
    id: 'new-date',
    re: /new Date\(\s*\)/g,
    message: 'new Date() sem argumento; passe um instante fixo',
  },
  {
    id: 'wait-for-timeout',
    re: /\.waitForTimeout\s*\(/g,
    message: 'waitForTimeout é sono; use expect locator (LID-108 / flakes)',
  },
];

/**
 * @param {{ files: { rel: string, content: string }[] }} ctx
 */
export function testNondeterminism(ctx) {
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];
  for (const file of ctx.files) {
    if (!isTestFile(file.rel)) continue;
    for (const pattern of PATTERNS) {
      pattern.re.lastIndex = 0;
      let match = pattern.re.exec(file.content);
      while (match) {
        violations.push({
          file: file.rel,
          line: lineNumberAt(file.content, match.index),
          id: 'test-nondeterminism',
          message: pattern.message,
        });
        match = pattern.re.exec(file.content);
      }
    }
  }
  return violations;
}

function isTestFile(rel) {
  if (rel.startsWith('scripts/harness/')) return false;
  if (rel.startsWith('tests/e2e/') && /\.(ts|js|mjs)$/.test(rel)) return true;
  return /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(rel);
}
