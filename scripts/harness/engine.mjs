import { docsIndex } from './rules/docs-index.mjs';
import { docsLink } from './rules/docs-link.mjs';
import { envCentralized } from './rules/env-centralized.mjs';
import { importDirection } from './rules/import-direction.mjs';
import { noConsole } from './rules/no-console.mjs';
import { specStatus } from './rules/spec-status.mjs';
import { specTests } from './rules/spec-tests.mjs';
import { testNondeterminism } from './rules/test-nondeterminism.mjs';
import { testTimeout } from './rules/test-timeout.mjs';
import { listTextFiles } from './walk.mjs';

export const RULES = {
  'docs-link': docsLink,
  'docs-index': docsIndex,
  'spec-tests': specTests,
  'spec-status': specStatus,
  'test-nondeterminism': testNondeterminism,
  'test-timeout': testTimeout,
  'no-console': noConsole,
  'env-centralized': envCentralized,
  'import-direction': importDirection,
};

/**
 * @param {{ root: string, config: Record<string, unknown> }} input
 */
export function runHarness(input) {
  const { root, config } = input;
  const files = listTextFiles(root, config);
  const ruleConfig = config.rules ?? {};
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];
  let rulesRun = 0;

  for (const [id, impl] of Object.entries(RULES)) {
    const options = ruleConfig[id];
    if (!options || options.enabled === false) continue;
    rulesRun += 1;
    const found = impl({
      root,
      config,
      options,
      files,
    });
    violations.push(...found);
  }

  const unknown = Object.keys(ruleConfig).filter((id) => !RULES[id]);
  for (const id of unknown) {
    violations.push({
      file: 'harness.rules.mjs',
      line: 1,
      id: 'unknown-rule',
      message: `regra desconhecida: ${id}`,
    });
  }

  violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id),
  );

  return {
    filesScanned: files.length,
    rulesRun,
    violations,
  };
}

export function formatViolations(violations) {
  return violations.map((v) => `${v.file}:${v.line} [${v.id}] ${v.message}`).join('\n');
}
