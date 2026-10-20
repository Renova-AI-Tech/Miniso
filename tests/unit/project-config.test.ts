import { describe, expect, it } from 'vitest';
import { parseProjectConfig } from '../../scripts/project/config.mjs';

const valid = {
  schemaVersion: 1,
  project: { slug: 'meu-projeto', displayName: 'Meu projeto' },
  profile: 'public',
  capabilities: [],
  initialTarget: 'local',
  origin: { templateVersion: '0.1.0', sourceRevision: 'd0c2db9', uiVersion: '0.1.0' },
};

describe('project configuration (REQ-002, REQ-003, REQ-037)', () => {
  it('recusa manifesto invalido sem alterar arquivos', () => {
    const input = structuredClone(valid);
    expect(() => parseProjectConfig({ ...input, token: 'secret-sentinel' })).toThrow(
      'campo desconhecido',
    );
    expect(input).toEqual(valid);
    expect(() => parseProjectConfig(null)).toThrow('objeto obrigatório');
    expect(() => parseProjectConfig({ ...valid, schemaVersion: 2 })).toThrow(
      'versão não suportada',
    );
  });
  it('produz configuracao canonica com origem e capacidade fechada', () => {
    expect(parseProjectConfig(valid)).toEqual(valid);
    expect(
      parseProjectConfig({ ...valid, profile: 'authenticated', capabilities: ['auth'] })
        .capabilities,
    ).toEqual(['auth']);
    expect(parseProjectConfig({ ...valid, initialTarget: 'railway' }).initialTarget).toBe(
      'railway',
    );
  });
  it('recusa path traversal comandos nomes reservados e limites de slug', () => {
    for (const slug of [
      '../outside',
      'a;pwd',
      'a$(pwd)',
      'con',
      'com1',
      'rénova',
      'ab',
      'a'.repeat(49),
      'a--b',
    ]) {
      expect(() => parseProjectConfig({ ...valid, project: { ...valid.project, slug } })).toThrow();
    }
    expect(
      parseProjectConfig({ ...valid, project: { ...valid.project, slug: 'a'.repeat(48) } }).project
        .slug,
    ).toHaveLength(48);
  });
  it('recusa perfil inconsistente e capacidade desconhecida', () => {
    for (const [profile, capabilities] of [
      ['public', ['auth']],
      ['authenticated', []],
      ['public', ['billing']],
      ['other', []],
    ]) {
      expect(() => parseProjectConfig({ ...valid, profile, capabilities })).toThrow();
    }
  });
  it('recusa segredo em objeto aninhado e origem invalida', () => {
    expect(() =>
      parseProjectConfig({ ...valid, origin: { ...valid.origin, password: 'sentinel' } }),
    ).toThrow('campo desconhecido');
    expect(() =>
      parseProjectConfig({ ...valid, origin: { ...valid.origin, sourceRevision: 'latest' } }),
    ).toThrow('sourceRevision');
    expect(() => parseProjectConfig({ ...valid, initialTarget: 'arbitrary-cloud' })).toThrow(
      'initialTarget',
    );
  });
  it('limita nome exibido e preserva texto sem interpreta lo como HTML', () => {
    for (const displayName of ['', ' ', 'x'.repeat(81), 'nome\nnovo']) {
      expect(() =>
        parseProjectConfig({ ...valid, project: { ...valid.project, displayName } }),
      ).toThrow();
    }
    expect(
      parseProjectConfig({ ...valid, project: { ...valid.project, displayName: '<b>Nome</b>' } })
        .project.displayName,
    ).toBe('<b>Nome</b>');
  });
});
