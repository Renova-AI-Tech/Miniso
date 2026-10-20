const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9]|node-modules|postgres|template)$/;

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: objeto obrigatório`);
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${label}: campo desconhecido`);
  }
  return value;
}

function text(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${label}: valor inválido`);
  }
  return value;
}

/** Valida o manifesto sem I/O, resolução de dependências ou interpretação de shell. */
export function parseProjectConfig(input) {
  const config = object(
    input,
    ['schemaVersion', 'project', 'profile', 'capabilities', 'initialTarget', 'origin'],
    'manifesto',
  );
  if (config.schemaVersion !== 1) throw new Error('schemaVersion: versão não suportada');
  const project = object(config.project, ['slug', 'displayName'], 'project');
  const slug = text(project.slug, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'slug');
  if (slug.length < 3 || slug.length > 48 || reserved.test(slug))
    throw new Error('slug: nome inválido ou reservado');
  const displayName = text(project.displayName, /^[^\p{Cc}\p{Cf}]{1,80}$/u, 'displayName').trim();
  if (!displayName) throw new Error('displayName: nome vazio');
  if (!['public', 'authenticated'].includes(config.profile))
    throw new Error('profile: opção inválida');
  const expected = config.profile === 'public' ? [] : ['auth'];
  if (
    !Array.isArray(config.capabilities) ||
    JSON.stringify(config.capabilities) !== JSON.stringify(expected)
  ) {
    throw new Error('capabilities: incompatíveis com o perfil');
  }
  if (!['local', 'railway'].includes(config.initialTarget))
    throw new Error('initialTarget: opção inválida');
  const origin = object(
    config.origin,
    ['templateVersion', 'sourceRevision', 'uiVersion'],
    'origin',
  );
  const version = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
  return {
    schemaVersion: 1,
    project: { slug, displayName },
    profile: config.profile,
    capabilities: expected,
    initialTarget: config.initialTarget,
    origin: {
      templateVersion: text(origin.templateVersion, version, 'templateVersion'),
      sourceRevision: text(origin.sourceRevision, /^[a-f0-9]{7,40}$/, 'sourceRevision'),
      uiVersion: text(origin.uiVersion, version, 'uiVersion'),
    },
  };
}
