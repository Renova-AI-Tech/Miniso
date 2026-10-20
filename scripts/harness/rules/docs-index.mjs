/** Índice de docs: cada markdown em docs/ precisa ser apontado pelo README. */

/**
 * Cada markdown em docs/ (exceto o índice) precisa ser apontado pelo índice.
 * Evita doc órfã que o agente nunca encontra (PostHog: lookup, não prompt stuffing).
 *
 * @param {{ root: string, files: { rel: string, abs: string, content: string }[], options: { indexFile?: string, scanDirectory?: string } }} ctx
 */
export function docsIndex(ctx) {
  const indexFile = ctx.options.indexFile ?? 'docs/index.md';
  const scanDirectory = ctx.options.scanDirectory ?? 'docs';
  const index = ctx.files.find((file) => file.rel === indexFile);
  if (!index) {
    return [
      {
        file: indexFile,
        line: 1,
        id: 'docs-index',
        message: `índice ausente: ${indexFile}`,
      },
    ];
  }

  /** @type {{ file: string, line: number, id: string, message: string }[]} */
  const violations = [];
  const docs = ctx.files.filter(
    (file) =>
      file.rel.startsWith(`${scanDirectory}/`) &&
      file.rel.endsWith('.md') &&
      file.rel !== indexFile,
  );

  for (const doc of docs) {
    const fromIndex = relativeFrom(indexFile, doc.rel);
    const posixRel = doc.rel;
    const mentioned =
      index.content.includes(fromIndex) ||
      index.content.includes(posixRel) ||
      index.content.includes(`/${posixRel}`);
    if (!mentioned) {
      violations.push({
        file: indexFile,
        line: 1,
        id: 'docs-index',
        message: `doc órfã não listada no índice: ${doc.rel}`,
      });
    }
  }

  return violations;
}

function relativeFrom(indexFile, docRel) {
  const indexDir = indexFile.split('/').slice(0, -1).join('/');
  const prefix = indexDir.length > 0 ? `${indexDir}/` : '';
  if (docRel.startsWith(prefix)) {
    return docRel.slice(prefix.length);
  }
  return docRel;
}
