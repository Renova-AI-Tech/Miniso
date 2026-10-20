import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/**
 * @param {string} root
 * @param {{ ignoreDirectories?: string[], textExtensions?: string[] }} config
 * @returns {{ rel: string, abs: string, content: string }[]}
 */
export function listTextFiles(root, config) {
  const ignore = new Set(config.ignoreDirectories ?? ['node_modules', '.git', 'dist']);
  const extensions = new Set(config.textExtensions ?? ['.md', '.ts', '.mjs', '.js']);
  /** @type {{ rel: string, abs: string, content: string }[]} */
  const out = [];

  /**
   * @param {string} dir
   */
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.has(extname(entry.name))) continue;
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      if (stat.size > 1_500_000) continue;
      const rel = relative(root, abs).split('\\').join('/');
      const content = readFileSync(abs, 'utf8');
      out.push({ rel, abs, content });
    }
  }

  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * @param {string} rel
 * @param {string} glob
 */
export function matchGlob(rel, glob) {
  const escaped = glob
    .split('/')
    .map((part) => {
      if (part === '**') return '<<<DS>>>';
      return part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
    })
    .join('/');
  const source = `^${escaped.replaceAll('<<<DS>>>/', '(?:.+/)?').replaceAll('<<<DS>>>', '.*')}$`;
  return new RegExp(source).test(rel);
}

/**
 * @param {string} rel
 * @param {string[]} globs
 */
export function matchesAnyGlob(rel, globs) {
  return globs.some((glob) => matchGlob(rel, glob));
}

/**
 * @param {string} content
 * @param {number} index
 */
export function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length;
}
