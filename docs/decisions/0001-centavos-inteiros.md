# ADR 0001 — Centavos inteiros

- **Status:** histórico do exemplo retirado em 19/10/2026; não é regra de domínio deste template
- **Data:** 2026-10-15

## Contexto

Agentes (e JS) erram conta em ponto flutuante de reais. Exemplos escolhidos não pegam resto e arredondamento.

## Decisão

Valores monetários neste sample são **centavos** `Number.isSafeInteger`. Percentual em bps arredonda half-up **uma vez** no total; depois `splitCents`.

## Consequências

- Recusar fração, `NaN` e overflow.
- O exemplo usava propriedades de conservação e contraexemplos; código e testes foram retirados com a aplicação financeira.
- Trocar por Decimal/BigInt é mudança de ADR, não “ajuste local”.
