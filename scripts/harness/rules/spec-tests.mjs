import ts from 'typescript';
import { matchGlob } from '../walk.mjs';

function hasTestDeclaration(content, path, runner, name) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  let found = false;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === runner &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === name &&
      node.arguments
        .slice(1)
        .some((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
    )
      found = true;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

/**
 * Passo `done` exige teste nomeado no campo Test e evidência externa quando aplicável.
 * Checa o **nome** no arquivo; não prova que o teste distingue implementação errada
 * (isso é revisão humana + propriedades).
 *
 * @param {{ files: { rel: string, content: string }[], options: { tasksGlob?: string } }} ctx
 */
export function specTests(ctx) {
  const glob = ctx.options.tasksGlob ?? 'docs/specs/**/tasks.md';
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];

  for (const file of ctx.files) {
    if (!matchGlob(file.rel, glob)) continue;
    if (file.rel.includes('/_templates/')) continue;
    const blocks = splitTaskBlocks(file.content);
    for (const block of blocks) {
      const status = block.body.match(/\*\*Status:\*\*\s*`?([A-Za-z_]+)`?/i)?.[1]?.toLowerCase();
      if (status !== 'done') continue;

      const field = block.body.match(/^- \*\*Test:\*\* (.+)$/m)?.[1] ?? '';
      const itMatch = field.match(/\b(it|test)\((['"])(.+?)\2\)/);
      const pathMatch = field.match(
        /`((?:apps|packages|scripts|tests|e2e|src|templates)\/[^`]+?\.(?:ts|tsx|js|mjs))`/,
      );

      if (!itMatch || !pathMatch) {
        violations.push({
          file: file.rel,
          line: block.line,
          id: 'spec-tests',
          message: `passo done "${block.title}" precisa citar it('nome') ou test('nome') e arquivo no campo Test`,
        });
        continue;
      }

      const testName = itMatch[3];
      const testPath = pathMatch[1];
      const testFile = ctx.files.find((candidate) => candidate.rel === testPath);
      if (!testFile) {
        violations.push({
          file: file.rel,
          line: block.line,
          id: 'spec-tests',
          message: `arquivo de teste inexistente: ${testPath}`,
        });
        continue;
      }
      if (!hasTestDeclaration(testFile.content, testPath, itMatch[1], testName)) {
        violations.push({
          file: file.rel,
          line: block.line,
          id: 'spec-tests',
          message: `${itMatch[1]}('${testName}') não encontrado em ${testPath}`,
        });
      }
      const types = block.body.match(/^- \*\*Tests:\*\* (.+)$/m)?.[1] ?? '';
      if (/humano|provider|documental/.test(types)) {
        const evidence = block.body.match(
          /^- \*\*Evidence:\*\* (human|provider|documental) em `(docs\/[^`]+\.md)`$/m,
        );
        const report = ctx.files.find((candidate) => candidate.rel === evidence?.[2]);
        const expected = /humano/.test(types)
          ? 'human'
          : /provider/.test(types)
            ? 'provider'
            : 'documental';
        if (
          evidence?.[1] !== expected ||
          !report ||
          !/^\*\*Verdict:\*\* PASS$/m.test(report.content) ||
          !/`[^`\n]+:\d+`/.test(report.content)
        ) {
          violations.push({
            file: file.rel,
            line: block.line,
            id: 'spec-tests',
            message: `passo done "${block.title}" precisa de Evidence ${expected} com relatório PASS e referências arquivo:linha; teste não substitui aceite`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * @param {string} content
 */
function splitTaskBlocks(content) {
  const lines = content.split('\n');
  /** @type {{ title: string, line: number, body: string }[]} */
  const blocks = [];
  /** @type {{ title: string, line: number, parts: string[] } | null} */
  let current = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const heading = line.match(/^#{2,3}\s+(T-\d+\b.*)$/);
    if (/^#{2,3}\s/.test(line)) {
      if (current) {
        blocks.push({ title: current.title, line: current.line, body: current.parts.join('\n') });
      }
      current = heading ? { title: heading[1] ?? '', line: i + 1, parts: [line] } : null;
      continue;
    }
    if (current) current.parts.push(line);
  }
  if (current) {
    blocks.push({ title: current.title, line: current.line, body: current.parts.join('\n') });
  }
  return blocks;
}
