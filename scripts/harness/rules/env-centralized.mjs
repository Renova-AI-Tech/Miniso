import { lineNumberAt, matchesAnyGlob } from '../walk.mjs';

const ENV_RE = /\bprocess\.env\b|\bimport\.meta\.env\b/g;

/**
 * @param {{ files: { rel: string, content: string }[], options: { allowedFiles?: string[] } }} ctx
 */
export function envCentralized(ctx) {
  const allowed = ctx.options.allowedFiles ?? ['**/env.ts'];
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];

  for (const file of ctx.files) {
    if (!/\.(ts|tsx|js|mjs)$/.test(file.rel)) continue;
    if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file.rel)) continue;
    if (file.rel.startsWith('scripts/harness/')) continue;
    if (matchesAnyGlob(file.rel, allowed)) continue;

    ENV_RE.lastIndex = 0;
    let match = ENV_RE.exec(file.content);
    while (match) {
      violations.push({
        file: file.rel,
        line: lineNumberAt(file.content, match.index),
        id: 'env-centralized',
        message: 'process.env / import.meta.env só em módulos de env (veja allowedFiles)',
      });
      match = ENV_RE.exec(file.content);
    }
  }

  return violations;
}
