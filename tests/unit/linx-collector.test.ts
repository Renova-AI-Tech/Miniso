import { describe, expect, it } from 'vitest';
import { parseResponse, recordHash, safeColumn } from '../../scripts/linx/collect.mjs';

describe('coletor Linx', () => {
  it('converte o envelope XML em linhas nomeadas', () => {
    const xml = `
      <LinxMicrovix>
        <ResponseResult><ResponseSuccess>true</ResponseSuccess></ResponseResult>
        <ResponseData>
          <C><D>cod_produto</D><D>nome</D></C>
          <R><D>101</D><D>Caneca &amp; presente</D></R>
        </ResponseData>
      </LinxMicrovix>`;
    expect(parseResponse(xml, 'LinxProdutos')).toEqual([
      { cod_produto: '101', nome: 'Caneca & presente' },
    ]);
  });

  it('recusa uma resposta XML rejeitada pela Linx', () => {
    expect(() =>
      parseResponse(
        '<ResponseResult><ResponseSuccess>false</ResponseSuccess><ResponseMessage>negado</ResponseMessage></ResponseResult>',
        'LinxMovimento',
      ),
    ).toThrow('Linx recusou LinxMovimento: negado');
    expect(() =>
      parseResponse(
        '<ResponseResult><ResponseSuccess>false</ResponseSuccess><ResponseError><Message>Usuário ou senha inválidos</Message></ResponseError></ResponseResult>',
        'LinxGrupoLojas',
      ),
    ).toThrow('Linx recusou LinxGrupoLojas: Usuário ou senha inválidos');
  });

  it('normaliza colunas e mantém hash independente da ordem das chaves', () => {
    expect(safeColumn('Preço de venda')).toBe('pre_o_de_venda');
    expect(recordHash('LinxProdutos', '123', { b: '2', a: '1' })).toBe(
      recordHash('LinxProdutos', '123', { a: '1', b: '2' }),
    );
  });
});
