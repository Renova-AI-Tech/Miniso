# Aprendizados observados no onboarding

> Registro gerado pelo mecanismo de aprendizados TLC durante a validação; rótulos traduzidos para pt-BR.
> Estado gerado em [onboarding-lessons.json](onboarding-lessons.json). Artefato histórico; não exige skill pessoal para usar o clone.
> promote_threshold=2 features distintas · window_days=45 · quarantine_threshold=2

## Confirmados

Corroborados em múltiplas features.

_Nenhum._

## Candidatos em observação

Ocorrências deste incremento, ainda sem recorrência independente. Não são novas regras obrigatórias do projeto.

### L-001 - Verifique diagnósticos HTTP contra as rotas reais da API e do proxy, além dos probes simulados.
- Sinal: `ac_gap` · recorrência: 1 feature(s) · escopo: `scripts/project/doctor` · aplicações prejudiciais: 0
- Features: renova-onboarding
- Evidência: tests/integration/doctor.test.ts:104 (scripts/project/doctor)
- Último registro: 2026-10-19T22:23:11Z

### L-002 - Canonicalize o caminho do entrypoint e execute a CLI em subprocesso por um alias de diretório.
- Sinal: `ac_gap` · recorrência: 1 feature(s) · escopo: `scripts/project/cli` · aplicações prejudiciais: 0
- Features: renova-onboarding
- Evidência: tests/integration/setup.test.ts:50; tests/integration/doctor.test.ts:147 (scripts/project/cli)
- Último registro: 2026-10-19T22:23:11Z

## Em quarentena

Aprendizado confirmado que falhou ao ser aplicado; exige revisão.

_Nenhum._

Origem: correções verificadas no [relatório independente](../specs/renova-project-template/onboarding-validation.md).
