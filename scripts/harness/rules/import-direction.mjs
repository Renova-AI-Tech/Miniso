import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import ts from 'typescript';
import { lineNumberAt } from '../walk.mjs';

const serverModules = new Set([...builtinModules, 'pg', 'pg-pool', 'pg-protocol', 'fastify']);

/** Workspaces são descobertos pelo manifesto, inclusive depois de renomear o scope. */
export function importDirection(ctx) {
  const workspaces = ctx.files
    .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file.rel))
    .map((file) => ({ path: posix.dirname(file.rel), name: JSON.parse(file.content).name }))
    .filter((workspace) => typeof workspace.name === 'string');
  const violations = [];
  for (const file of ctx.files) {
    if (!/^(apps|packages)\/.+\.(ts|tsx|js|mjs)$/.test(file.rel)) continue;
    const source = ts.createSourceFile(file.rel, file.content, ts.ScriptTarget.Latest, true);
    const imports = [];
    function visit(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        imports.push({
          spec: node.moduleSpecifier.text,
          typeOnly: ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly,
          start: node.getStart(source),
        });
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        imports.push({
          spec: node.arguments[0].text,
          typeOnly: false,
          start: node.getStart(source),
        });
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteralLike(node.argument.literal)
      ) {
        imports.push({
          spec: node.argument.literal.text,
          typeOnly: true,
          start: node.getStart(source),
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const item of imports) {
      const { spec, typeOnly, start } = item;
      const workspace = workspaces.find((w) => spec === w.name || spec.startsWith(`${w.name}/`));
      const target = spec.startsWith('.')
        ? posix.normalize(posix.join(posix.dirname(file.rel), spec))
        : (workspace?.path ?? spec);
      let message;
      if (file.rel.startsWith('packages/') && /(^|\/)apps\//.test(target)) {
        message = `packages/* não importa apps (${spec})`;
      }
      if (file.rel.startsWith('apps/frontend/src/')) {
        const contractOnly =
          typeOnly && workspace?.path === 'apps/backend' && spec === `${workspace.name}/contract`;
        if (
          (!contractOnly && target.startsWith('apps/backend')) ||
          /^packages\/db[^/]*(\/|$)/.test(target) ||
          spec.startsWith('node:') ||
          serverModules.has(spec.split('/')[0])
        ) {
          message = `frontend só acessa o contrato type-only da API, nunca código de servidor (${spec})`;
        }
      }
      if (message) {
        violations.push({
          file: file.rel,
          line: lineNumberAt(file.content, start),
          id: 'import-direction',
          message,
        });
      }
    }
  }
  return violations;
}
