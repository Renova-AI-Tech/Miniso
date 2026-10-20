import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runHarness } from './engine.mjs';
import { matchGlob } from './walk.mjs';

const temps = [];

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  temps.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const baseRules = {
  'docs-link': { enabled: false },
  'docs-index': { enabled: false },
  'spec-tests': { enabled: false },
  'spec-status': { enabled: false },
  'test-nondeterminism': { enabled: false },
  'test-timeout': { enabled: false },
  'no-console': { enabled: false },
  'env-centralized': { enabled: false },
  'import-direction': { enabled: false },
};

function configWith(id, options = {}) {
  return {
    ignoreDirectories: ['node_modules', '.git', 'dist'],
    textExtensions: ['.md', '.ts', '.tsx', '.mjs', '.js', '.json'],
    rules: {
      ...baseRules,
      [id]: { enabled: true, ...options },
    },
  };
}

function ids(result) {
  return result.violations.map((v) => `${v.id}:${v.file}`);
}

describe('matchGlob', () => {
  it('casa ** e extensão', () => {
    expect(matchGlob('docs/specs/example/tasks.md', 'docs/specs/**/tasks.md')).toBe(true);
    expect(matchGlob('docs/index.md', 'docs/specs/**/tasks.md')).toBe(false);
    expect(matchGlob('apps/demo/src/env.ts', '**/env.ts')).toBe(true);
  });
});

describe('docs-link', () => {
  it('recusa markdown apontando para arquivo inexistente', () => {
    const root = fixture({
      'docs/a.md': 'Veja [x](./missing.md)',
    });
    const result = runHarness({ root, config: configWith('docs-link') });
    expect(result.violations.some((v) => v.id === 'docs-link')).toBe(true);
  });

  it('aceita link relativo existente e ignora http', () => {
    const root = fixture({
      'docs/a.md': 'Veja [b](./b.md) e [ext](https://example.com)',
      'docs/b.md': 'ok',
    });
    const result = runHarness({ root, config: configWith('docs-link') });
    expect(result.violations).toEqual([]);
  });
});

describe('docs-index', () => {
  it('recusa doc de processo fora do índice', () => {
    const root = fixture({
      'docs/index.md': '# Índice\n',
      'docs/process/task-recipe.md': '# receita',
    });
    const result = runHarness({ root, config: configWith('docs-index') });
    expect(ids(result).some((row) => row.startsWith('docs-index:'))).toBe(true);
  });

  it('passa quando o índice cita o arquivo', () => {
    const root = fixture({
      'docs/index.md': 'Leia [receita](process/task-recipe.md)',
      'docs/process/task-recipe.md': '# receita',
    });
    const result = runHarness({ root, config: configWith('docs-index') });
    expect(result.violations).toEqual([]);
  });
});

describe('spec-status', () => {
  it('recusa status fora da lista', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md': '## T-001 Foo\n- **Status:** shipped\n',
    });
    const result = runHarness({ root, config: configWith('spec-status') });
    expect(result.violations[0]?.id).toBe('spec-status');
  });

  it('aceita done', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md': '## T-001 Foo\n- **Status:** `done`\n',
    });
    const result = runHarness({ root, config: configWith('spec-status') });
    expect(result.violations).toEqual([]);
  });
});

describe('spec-tests', () => {
  const task = (extra = '', test = "it('evidencia')", path = 'tests/unit/evidence.test.ts') =>
    `## T-001 Evidência\n- **Status:** done\n- **Ownership:** \`scripts/config.mjs\`\n- **Test:** \`${test}\` em \`${path}\`\n${extra}`;

  it('valida campo de evidencia e runner sem escolher ownership', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md': task(),
      'scripts/config.mjs': 'export const value = 1;',
      'tests/unit/evidence.test.ts': "it('evidencia', () => {})",
    });
    expect(runHarness({ root, config: configWith('spec-tests') }).violations).toEqual([]);
  });

  it('aceita declaracao Playwright no arquivo citado', () => {
    for (const path of [
      'tests/e2e/demo.spec.ts',
      'templates/module/files/tests/e2e/demo.spec.ts',
    ]) {
      const root = fixture({
        'docs/specs/demo/tasks.md': task('', "test('jornada')", path),
        [path]: "test('jornada', async () => {})",
      });
      expect(runHarness({ root, config: configWith('spec-tests') }).violations).toEqual([]);
    }
  });

  it('recusa arquivo de evidencia inexistente', () => {
    for (const path of [
      'tests/unit/evidence.test.ts',
      'templates/module/files/tests/unit/evidence.test.ts',
    ]) {
      const root = fixture({ 'docs/specs/demo/tasks.md': task('', "it('evidencia')", path) });
      expect(runHarness({ root, config: configWith('spec-tests') }).violations[0]?.message).toMatch(
        /inexistente/,
      );
    }
  });

  it('recusa nome citado fora de declaracao de teste', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md': task(),
      'tests/unit/evidence.test.ts': "const title = 'evidencia';",
    });
    expect(runHarness({ root, config: configWith('spec-tests') }).violations[0]?.message).toMatch(
      /não encontrado/,
    );
  });

  it('recusa comentario string e teste desabilitado como evidencia', () => {
    for (const content of [
      "// it('evidencia', () => {})",
      'const note = "it(\'evidencia\', () => {})";',
      "it.skip('evidencia', () => {});",
      "/* test('evidencia', () => {}) */",
    ]) {
      for (const path of [
        'tests/unit/evidence.test.ts',
        'templates/module/files/tests/unit/evidence.test.ts',
      ]) {
        const root = fixture({
          'docs/specs/demo/tasks.md': task('', "it('evidencia')", path),
          [path]: content,
        });
        expect(
          runHarness({ root, config: configWith('spec-tests') }).violations[0]?.message,
        ).toMatch(/não encontrado/);
      }
    }
  });

  it('recusa aceite humano sem relatorio mesmo com teste existente', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md': task('- **Tests:** aceite humano + discriminação\n'),
      'tests/unit/evidence.test.ts': "it('evidencia', () => {})",
    });
    expect(runHarness({ root, config: configWith('spec-tests') }).violations[0]?.message).toMatch(
      /Evidence human/,
    );
  });

  it('exige tipo correto e veredito PASS com referencia no relatorio', () => {
    for (const [kind, report, valid] of [
      ['human', '**Verdict:** PASS\n`tests/unit/evidence.test.ts:1`', true],
      ['provider', '**Verdict:** PASS\n`tests/unit/evidence.test.ts:1`', false],
      ['human', '**Verdict:** FAIL\n`tests/unit/evidence.test.ts:1`', false],
      ['human', '**Verdict:** PASS', false],
    ]) {
      const root = fixture({
        'docs/specs/demo/tasks.md': task(
          `- **Tests:** aceite humano\n- **Evidence:** ${kind} em \`docs/report.md\`\n`,
        ),
        'tests/unit/evidence.test.ts': "it('evidencia', () => {})",
        'docs/report.md': report,
      });
      expect(runHarness({ root, config: configWith('spec-tests') }).violations.length).toBe(
        valid ? 0 : 1,
      );
    }
  });

  it('nao aceita teste citado em outra secao', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md':
        "## T-001 Evidência\n- **Status:** done\n## Referências\n- **Test:** `it('evidencia')` em `tests/unit/evidence.test.ts`",
      'tests/unit/evidence.test.ts': "it('evidencia', () => {})",
    });
    expect(runHarness({ root, config: configWith('spec-tests') }).violations).toHaveLength(1);
  });

  it('recusa passo done sem it() nomeado', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md': '## T-001 Conservação\n- **Status:** done\n',
    });
    const result = runHarness({ root, config: configWith('spec-tests') });
    expect(result.violations[0]?.id).toBe('spec-tests');
  });

  it('recusa done cujo it() não existe no arquivo', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md':
        "## T-001 Conservação\n- **Status:** done\n- **Test:** `it('conserva o total em centavos ao repartir')` em `tests/property/example.property.test.ts`\n",
      'tests/property/example.property.test.ts': "it('outra coisa', () => {})\n",
    });
    const result = runHarness({ root, config: configWith('spec-tests') });
    expect(result.violations[0]?.message).toMatch(/não encontrado/);
  });

  it('passa quando o it() está no arquivo citado', () => {
    const root = fixture({
      'docs/specs/demo/tasks.md':
        "## T-001 Conservação\n- **Status:** done\n- **Test:** `it('conserva o total em centavos ao repartir')` em `tests/property/example.property.test.ts`\n",
      'tests/property/example.property.test.ts':
        "it('conserva o total em centavos ao repartir', () => {})\n",
    });
    const result = runHarness({ root, config: configWith('spec-tests') });
    expect(result.violations).toEqual([]);
  });
});

describe('test-nondeterminism', () => {
  it('recusa Math.random em teste', () => {
    const root = fixture({
      'packages/domain/src/money.test.ts': 'it("x", () => { Math.random() })\n',
    });
    const result = runHarness({ root, config: configWith('test-nondeterminism') });
    expect(result.violations[0]?.id).toBe('test-nondeterminism');
  });

  it('aceita fixture determinística', () => {
    const root = fixture({
      'packages/domain/src/money.test.ts': 'it("x", () => { expect(1).toBe(1) })\n',
    });
    const result = runHarness({ root, config: configWith('test-nondeterminism') });
    expect(result.violations).toEqual([]);
  });
});

describe('test-timeout', () => {
  it('recusa vitest config sem testTimeout', () => {
    const root = fixture({
      'packages/domain/vitest.config.ts': 'export default { test: { environment: "node" } }\n',
    });
    const result = runHarness({ root, config: configWith('test-timeout') });
    expect(result.violations[0]?.id).toBe('test-timeout');
  });

  it('aceita testTimeout honesto', () => {
    const root = fixture({
      'packages/domain/vitest.config.ts':
        'export default { test: { testTimeout: 10_000, hookTimeout: 10_000 } }\n',
    });
    const result = runHarness({
      root,
      config: configWith('test-timeout', { minMs: 1000 }),
    });
    expect(result.violations).toEqual([]);
  });
});

describe('no-console', () => {
  it('recusa console.log em src de produto', () => {
    const root = fixture({
      'apps/demo/src/App.tsx': 'console.log("debug")\n',
    });
    const result = runHarness({ root, config: configWith('no-console') });
    expect(result.violations[0]?.id).toBe('no-console');
  });

  it('ignora testes', () => {
    const root = fixture({
      'apps/demo/src/App.test.ts': 'console.log("debug")\n',
    });
    const result = runHarness({ root, config: configWith('no-console') });
    expect(result.violations).toEqual([]);
  });
});

describe('env-centralized', () => {
  it('recusa process.env fora do allowlist', () => {
    const root = fixture({
      'apps/demo/src/App.tsx': 'export const x = process.env.FOO\n',
    });
    const result = runHarness({
      root,
      config: configWith('env-centralized', { allowedFiles: ['**/env.ts'] }),
    });
    expect(result.violations[0]?.id).toBe('env-centralized');
  });

  it('permite env.ts', () => {
    const root = fixture({
      'apps/demo/src/env.ts': 'export const env = { a: import.meta.env.VITE_A }\n',
    });
    const result = runHarness({
      root,
      config: configWith('env-centralized', { allowedFiles: ['**/env.ts'] }),
    });
    expect(result.violations).toEqual([]);
  });
});

describe('import-direction', () => {
  const manifests = {
    'apps/backend/package.json': '{"name":"@custom/api"}',
    'apps/frontend/package.json': '{"name":"@custom/web"}',
    'packages/dbmigrator/package.json': '{"name":"@custom/schema"}',
  };

  it('preserva regras apos renomear os workspaces', () => {
    const root = fixture({
      ...manifests,
      'packages/ui/src/escape.ts': "import type { AppRouter } from '@custom/api/contract'",
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toHaveLength(1);
  });

  it('permite somente contrato type-only no frontend', () => {
    const root = fixture({
      ...manifests,
      'apps/frontend/src/api.ts': "import type { AppRouter } from '@custom/api/contract'",
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toEqual([]);
  });

  it('recusa import e reexport runtime do backend', () => {
    const root = fixture({
      ...manifests,
      'apps/frontend/src/api.ts':
        "import { router } from '@custom/api/contract'; export { x } from '@custom/api';",
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toHaveLength(2);
  });

  it('recusa import dinamico require e escape relativo', () => {
    const root = fixture({
      ...manifests,
      'packages/ui/src/bad.ts':
        "import('@custom/api'); require('@custom/web'); export { x } from '../../../apps/backend/src/app';",
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toHaveLength(3);
  });

  it('recusa DB e Node no browser mesmo com scope renomeado', () => {
    const root = fixture({
      ...manifests,
      'apps/frontend/src/bad.ts':
        "import '@custom/schema'; import 'pg'; import 'node:fs'; import 'fs/promises';",
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toHaveLength(4);
  });

  it('recusa template literal estatico em import dinamico e require', () => {
    const root = fixture({
      ...manifests,
      'apps/frontend/src/bad.ts': 'import(`@custom/schema`); require(`@custom/api/contract`);',
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toHaveLength(2);
  });

  it('limita expressao import type ao contrato publico', () => {
    const root = fixture({
      ...manifests,
      'apps/frontend/src/types.ts':
        "type Good = import('@custom/api/contract').AppRouter; type Bad = import('@custom/api/internal').Database;",
    });
    const result = runHarness({ root, config: configWith('import-direction') });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].message).toContain('@custom/api/internal');
  });

  it('ignora imports comentados e texto sem execucao', () => {
    const root = fixture({
      ...manifests,
      'apps/frontend/src/text.ts':
        "// import 'pg';\nconst documentation = \"import('@custom/api')\";",
    });
    expect(runHarness({ root, config: configWith('import-direction') }).violations).toEqual([]);
  });

  it('recusa packages importando apps', () => {
    const root = fixture({
      'packages/domain/src/index.ts': "import { App } from '../../apps/demo/src/App.tsx'\n",
    });
    const result = runHarness({ root, config: configWith('import-direction') });
    expect(result.violations[0]?.id).toBe('import-direction');
  });

  it('permite packages importando packages', () => {
    const root = fixture({
      'packages/domain/src/index.ts': "export { x } from './money.ts'\n",
    });
    const result = runHarness({ root, config: configWith('import-direction') });
    expect(result.violations).toEqual([]);
  });
});

describe('unknown-rule', () => {
  it('recusa id que o motor não conhece', () => {
    const root = fixture({ 'README.md': '# x\n' });
    const result = runHarness({
      root,
      config: {
        rules: {
          ...baseRules,
          'ui-token': { enabled: true },
        },
      },
    });
    expect(result.violations[0]?.id).toBe('unknown-rule');
  });
});
