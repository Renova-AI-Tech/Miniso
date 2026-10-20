import * as fc from 'fast-check';
import { expect, it } from 'vitest';
import { parseProjectConfig } from '../../scripts/project/config.mjs';

const name = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
    minLength: 1,
    maxLength: 30,
  })
  .map((characters) => characters.join(''));
const project = fc.record({
  slug: name.map((value) => `project-${value}`),
  displayName: name,
});
const config = project.map((value) => ({
  schemaVersion: 1,
  project: value,
  profile: 'public',
  capabilities: [],
  initialTarget: 'local',
  origin: { templateVersion: '0.1.0', sourceRevision: 'd0c2db9', uiVersion: '0.1.0' },
}));

it('preserva identidade e configuracao ao serializar e reler manifestos validos', () => {
  fc.assert(
    fc.property(config, (input) => {
      const snapshot = structuredClone(input);
      const parsed = parseProjectConfig(input);
      expect(parseProjectConfig(JSON.parse(JSON.stringify(parsed)))).toEqual(snapshot);
      expect(input).toEqual(snapshot);
    }),
    { seed: 20261019, numRuns: 200 },
  );
});

it('recusa campos extras em manifestos gerados sem alterar a entrada', () => {
  fc.assert(
    fc.property(config, name, (input, value) => {
      const invalid = { ...input, unexpectedSetting: value };
      const snapshot = structuredClone(invalid);
      expect(() => parseProjectConfig(invalid)).toThrow('campo desconhecido');
      expect(invalid).toEqual(snapshot);
    }),
    { seed: 20261019, numRuns: 200 },
  );
});
