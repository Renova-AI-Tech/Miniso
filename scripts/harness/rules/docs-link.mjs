import { existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { lineNumberAt, matchesAnyGlob } from '../walk.mjs';

const LINK_RE = /!\[[^\]]*]\(([^)]+)\)|\[[^\]]*]\(([^)]+)\)/g;

/**
 * @param {{ root: string, files: { rel: string, content: string }[], options: { ignoreGlobs?: string[] } }} ctx
 */
export function docsLink(ctx) {
  const ignoreGlobs = ctx.options.ignoreGlobs ?? [];
  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];

  for (const file of ctx.files) {
    if (!file.rel.endsWith('.md')) continue;
    if (matchesAnyGlob(file.rel, ignoreGlobs)) continue;

    LINK_RE.lastIndex = 0;
    let match = LINK_RE.exec(file.content);
    while (match) {
      const target = (match[1] ?? match[2] ?? '').trim();
      const line = lineNumberAt(file.content, match.index);
      match = LINK_RE.exec(file.content);

      if (!target || target.startsWith('#')) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      if (target.includes('{{') || target.includes('<') || target.includes('*')) continue;

      const stripped = target.split('#')[0]?.split('?')[0] ?? '';
      if (!stripped) continue;

      const fromDir = dirname(join(ctx.root, file.rel));
      const abs = stripped.startsWith('/')
        ? join(ctx.root, stripped.replace(/^\/+/, ''))
        : normalize(join(fromDir, stripped));
      if (!existsSync(abs)) {
        violations.push({
          file: file.rel,
          line,
          id: 'docs-link',
          message: `link quebrado: ${target}`,
        });
      }
    }
  }

  return violations;
}
