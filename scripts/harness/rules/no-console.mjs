import { lineNumberAt, matchesAnyGlob } from '../walk.mjs';

const CONSOLE_RE = /\bconsole\.(log|debug|info)\s*\(/g;

/**
 * @param {{ files: { rel: string, content: string }[], options: { allow?: string[] } }} ctx
 */
export function noConsole(ctx) {
  const allow = ctx.options.allow ?? [];
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];

  for (const file of ctx.files) {
    if (!isSource(file.rel)) continue;
    if (allow.some((glob) => file.rel === glob || matchesAnyGlob(file.rel, [glob]))) continue;

    CONSOLE_RE.lastIndex = 0;
    let match = CONSOLE_RE.exec(file.content);
    while (match) {
      violations.push({
        file: file.rel,
        line: lineNumberAt(file.content, match.index),
        id: 'no-console',
        message: `console.${match[1]} no código de produto; use logger ou apague`,
      });
      match = CONSOLE_RE.exec(file.content);
    }
  }

  return violations;
}

function isSource(rel) {
  if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(rel)) return false;
  return /^(apps|packages)\/.+\/src\/.+\.(ts|tsx|js|mjs)$/.test(rel);
}
