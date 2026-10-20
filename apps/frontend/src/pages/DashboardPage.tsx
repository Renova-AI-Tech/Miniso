/* biome-ignore-all lint/a11y/useButtonType: dashboard controls are not form submissions. */
/* biome-ignore-all lint/suspicious/noArrayIndexKey: paginated analytical rows are keyed by their source grain. */
/* biome-ignore-all lint/style/useTemplate: legacy dashboard formatting is kept stable during template migration. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAnalytics,
  getDailySales,
  getDashboard,
  getHealth,
  getInventory,
  getProducts,
  getStores,
  getSyncAudit,
  getSyncHistory,
  getSyncStatus,
  startSync,
} from '../api';
import type {
  AnalyticsPayload,
  CategoryPerformance,
  DashboardPayload,
  DailySale,
  HealthPayload,
  InventoryItem,
  Product,
  Store,
  SyncAuditPayload,
  SyncHistoryPayload,
  SyncStatus,
} from '../types';

const isoToday = () => new Date().toISOString().slice(0, 10);
const subtractDays = (iso: string, amount: number) => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() - amount);
  return date.toISOString().slice(0, 10);
};
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const moneyPrecise = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
type ViewKey = 'overview' | 'sales' | 'inventory' | 'products' | 'status';
type ChartMetric = 'net_revenue' | 'net_quantity' | 'cost_value';

type WorkbookSheets = Record<string, Array<Record<string, unknown>>>;

async function saveWorkbook(sheets: WorkbookSheets, filename: string) {
  // Vite exposes this CommonJS package through `default`, while some
  // spreadsheet viewers expose its named exports. Support both shapes.
  const imported = await import('xlsx-js-style');
  const XLSX = ((imported as unknown as { default?: typeof import('xlsx-js-style') }).default ??
    imported) as typeof import('xlsx-js-style');
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    const safeRows = rows.length ? rows : [{ Status: 'Sem dados para os filtros selecionados.' }];
    const worksheet = XLSX.utils.json_to_sheet(safeRows);
    const headers = Object.keys(safeRows[0] || { Status: '' });
    const range = worksheet['!ref'] || `A1:A${safeRows.length + 1}`;
    const decodedRange = XLSX.utils.decode_range(range);
    const headerStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: '084D3E' } },
      font: { name: 'Aptos Display', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { bottom: { style: 'medium', color: { rgb: '06372C' } } },
    };
    const totalStyle = {
      fill: { patternType: 'solid', fgColor: { rgb: 'E7F2EE' } },
      font: { bold: true, color: { rgb: '084D3E' } },
      border: { top: { style: 'thin', color: { rgb: 'A8C9BE' } } },
    };
    const currencyHeaders = /faturamento|custo|preço|estoque|valor|margem/i;
    const integerHeaders =
      /quantidade|saldo|vendas|código|produtos|lojas|linhas|snapshots|dias ativos/i;
    const decimalHeaders = /giro|velocidade|unidades por dia|cobertura/i;
    const dateHeaders = /data|período/i;
    headers.forEach((header, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
      if (worksheet[address]) worksheet[address].s = headerStyle;
      const values = safeRows.slice(0, 400).map((row) => String(row[header] ?? ''));
      const longest = Math.max(header.length, ...values.map((value) => value.length));
      worksheet['!cols'] = worksheet['!cols'] || [];
      worksheet['!cols'][columnIndex] = { wch: Math.min(Math.max(longest + 2, 12), 42) };
      const numberFormat = currencyHeaders.test(header)
        ? 'R$ #,##0.00;[Red]-R$ #,##0.00'
        : integerHeaders.test(header)
          ? '#,##0;[Red]-#,##0'
          : decimalHeaders.test(header)
            ? '#,##0.00;[Red]-#,##0.00'
            : dateHeaders.test(header)
              ? 'yyyy-mm-dd'
              : undefined;
      for (let rowIndex = 1; rowIndex <= decodedRange.e.r; rowIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        const cell = worksheet[cellAddress];
        if (!cell) continue;
        if (
          dateHeaders.test(header) &&
          typeof cell.v === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(cell.v)
        ) {
          cell.v = new Date(`${cell.v}T00:00:00`);
          cell.t = 'd';
          cell.z = 'dd/mm/yyyy';
        } else if (numberFormat && typeof cell.v === 'number') cell.z = numberFormat;
        if (rowIndex % 2 === 0) {
          cell.s = {
            ...(cell.s || {}),
            fill: { patternType: 'solid', fgColor: { rgb: 'F5FAF8' } },
          };
        }
      }
    });
    if (name === 'Resumo' && worksheet['!ref']) {
      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(headers.length - 1, 1) } },
      ];
      const titleCell = worksheet.A1;
      if (titleCell)
        titleCell.s = {
          fill: { patternType: 'solid', fgColor: { rgb: '06372C' } },
          font: { name: 'Aptos Display', sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        };
      worksheet['!rows'] = [{ hpt: 30 }];
    } else {
      worksheet['!rows'] = [{ hpt: 28 }];
    }
    // xlsx-js-style keeps the standard SheetJS metadata and forwards this
    // freeze hint to compatible spreadsheet viewers. The auto-filter is
    // written by the library and works in Excel, LibreOffice and Sheets.
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    if (name !== 'Resumo' && name !== 'Parâmetros') worksheet['!autofilter'] = { ref: range };
    if (
      safeRows.some((row) =>
        Object.values(row).some((value) => String(value ?? '').toLowerCase() === 'total'),
      )
    ) {
      const lastRow = decodedRange.e.r;
      for (let columnIndex = 0; columnIndex <= decodedRange.e.c; columnIndex += 1) {
        const address = XLSX.utils.encode_cell({ r: lastRow, c: columnIndex });
        if (worksheet[address])
          worksheet[address].s = { ...(worksheet[address].s || {}), ...totalStyle };
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
  });
  XLSX.writeFile(workbook, filename);
}

function SalesScreen({
  sales,
  page,
  setPage,
  pageSize,
  total,
  hasNext,
}: {
  sales: DailySale[];
  page: number;
  setPage: (value: number) => void;
  pageSize: number;
  total: number;
  hasNext: boolean;
}) {
  const totalRevenue = sales.reduce((sum, row) => sum + Number(row.net_revenue || 0), 0);
  const totalCost = sales.reduce((sum, row) => sum + Number(row.cost_value || 0), 0);
  const totalQuantity = sales.reduce((sum, row) => sum + Number(row.net_quantity || 0), 0);
  return (
    <>
      <section className="kpi-grid compact-kpis">
        <article className="kpi-card">
          <div className="kpi-label">Linhas detalhadas</div>
          <strong>{number.format(sales.length)}</strong>
          <small>movimentos agrupados por produto</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Quantidade líquida</div>
          <strong>{number.format(totalQuantity)}</strong>
          <small>vendas menos devoluções</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Faturamento líquido</div>
          <strong>{money.format(totalRevenue)}</strong>
          <small>no período e loja selecionados</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Custo das vendas</div>
          <strong>{money.format(totalCost)}</strong>
          <small>custo movimentado</small>
        </article>
      </section>
      <article className="card table-card detail-screen-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">VENDAS DETALHADAS</p>
            <h2>Dia · loja · produto · classificação</h2>
          </div>
          <span className="period-pill">{number.format(total)} linhas</span>
        </div>
        <div className="table-scroll tall-table">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Loja</th>
                <th>Produto</th>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Qtd.</th>
                <th>Faturamento</th>
                <th>Custo</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((row, index) => (
                <tr key={`${row.document_date}-${row.company_cnpj}-${row.product_code}-${index}`}>
                  <td>{row.document_date}</td>
                  <td>{row.store_name || row.company_cnpj}</td>
                  <td>
                    <strong>{row.product_name || 'Sem nome'}</strong>
                    <small>#{row.product_code}</small>
                  </td>
                  <td>
                    {row.supplier_name || (row.supplier_code ? `#${row.supplier_code}` : '—')}
                  </td>
                  <td>
                    <strong>{row.category_name || 'Sem categoria'}</strong>
                    <small>
                      {[row.class_name, row.subclass_name].filter(Boolean).join(' / ') ||
                        'Sem classificação'}
                    </small>
                  </td>
                  <td>{number.format(Number(row.net_quantity || 0))}</td>
                  <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                  <td>{moneyPrecise.format(Number(row.cost_value || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sales.length && <div className="empty-state">Nenhuma venda encontrada no período.</div>}
        </div>
        <div className="pagination">
          <button onClick={() => setPage(Math.max(page - 1, 1))} disabled={page === 1}>
            ← Anterior
          </button>
          <span>
            Página {page} · {number.format(total)} linhas
          </span>
          <button onClick={() => setPage(page + 1)} disabled={!hasNext || sales.length < pageSize}>
            Próxima →
          </button>
        </div>
      </article>
    </>
  );
}

function InventoryScreen({
  inventory,
  stores,
  page,
  setPage,
  pageSize,
  total,
  hasNext,
}: {
  inventory: InventoryItem[];
  stores: Store[];
  page: number;
  setPage: (value: number) => void;
  pageSize: number;
  total: number;
  hasNext: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      inventory.filter((item) =>
        `${item.product_name || ''} ${item.reference || ''} ${item.product_code} ${item.company_cnpj}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [inventory, search],
  );
  const totalQuantity = filtered.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalCost = filtered.reduce((sum, row) => sum + Number(row.total_cost || 0), 0);
  const totalSale = filtered.reduce(
    (sum, row) => sum + Number(row.quantity || 0) * Number(row.sale_price || 0),
    0,
  );
  const storeName = (cnpj: string) =>
    stores.find((store) => store.company_cnpj === cnpj)?.trade_name || cnpj;
  return (
    <>
      <section className="kpi-grid compact-kpis">
        <article className="kpi-card">
          <div className="kpi-label">Itens no snapshot</div>
          <strong>{number.format(filtered.length)}</strong>
          <small>produto · loja</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Saldo</div>
          <strong>{number.format(totalQuantity)}</strong>
          <small>unidades</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Valor a custo</div>
          <strong>{money.format(totalCost)}</strong>
          <small>custo total</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Valor a venda</div>
          <strong>{money.format(totalSale)}</strong>
          <small>saldo × preço de venda</small>
        </article>
      </section>
      <article className="card table-card detail-screen-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">ESTOQUE POR PRODUTO E LOJA</p>
            <h2>Saldo, custo, venda e fornecedor</h2>
          </div>
          <input
            className="search"
            placeholder="Buscar produto ou loja nesta página"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="table-scroll tall-table">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Loja</th>
                <th>Saldo</th>
                <th>Custo unit.</th>
                <th>Preço venda</th>
                <th>Valor custo</th>
                <th>Fornecedor</th>
                <th>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={`${item.company_cnpj}-${item.product_code}`}>
                  <td>
                    <strong>{item.product_name || 'Sem nome'}</strong>
                    <small>
                      #{item.product_code} · {item.reference || 'sem referência'}
                    </small>
                  </td>
                  <td>
                    {item.company_cnpj}
                    <small>{storeName(item.company_cnpj)}</small>
                  </td>
                  <td>{number.format(Number(item.quantity || 0))}</td>
                  <td>{moneyPrecise.format(Number(item.average_cost || item.cost_price || 0))}</td>
                  <td>{moneyPrecise.format(Number(item.sale_price || 0))}</td>
                  <td>{moneyPrecise.format(Number(item.total_cost || 0))}</td>
                  <td>
                    {item.supplier_name || (item.supplier_code ? `#${item.supplier_code}` : '—')}
                  </td>
                  <td>
                    <strong>{item.category_name || 'Sem categoria'}</strong>
                    <small>
                      {[item.class_name, item.subclass_name].filter(Boolean).join(' / ') ||
                        'Sem classificação'}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty-state">Nenhum item encontrado no snapshot.</div>
          )}
        </div>
        <div className="pagination">
          <button onClick={() => setPage(Math.max(page - 1, 1))} disabled={page === 1}>
            ← Anterior
          </button>
          <span>
            Página {page} · {number.format(total)} linhas
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!hasNext || inventory.length < pageSize}
          >
            Próxima →
          </button>
        </div>
      </article>
    </>
  );
}

function ProductsScreen({
  products,
  search,
  setSearch,
  page,
  setPage,
  pageSize,
  total,
  hasNext,
}: {
  products: Product[];
  search: string;
  setSearch: (value: string) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: number;
  total: number;
  hasNext: boolean;
}) {
  return (
    <article className="card table-card detail-screen-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">CADASTRO LINX</p>
          <h2>Produtos, preços e hierarquia comercial</h2>
          <small>
            Quando “Todas as lojas” está selecionado, cada linha mantém o preço da própria unidade.
          </small>
        </div>
        <input
          className="search"
          placeholder="Buscar produto, referência ou código"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="table-scroll tall-table">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Loja</th>
              <th>Fornecedor</th>
              <th>Categoria · classe · subclasse</th>
              <th>Origem</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr
                key={`${product.portal}-${product.product_code}-${product.company_cnpj || 'sem-snapshot'}`}
              >
                <td>
                  <strong>{product.name || 'Sem nome'}</strong>
                  <small>
                    #{product.product_code} · {product.reference || 'sem referência'} ·{' '}
                    {product.barcode || 'sem código de barras'}
                  </small>
                </td>
                <td>{product.store_name || product.company_cnpj || 'Sem snapshot'}</td>
                <td>
                  {product.supplier_name ||
                    (product.supplier_code ? `#${product.supplier_code}` : '—')}
                </td>
                <td>
                  <strong>{product.category_name || product.sector_name || 'Sem categoria'}</strong>
                  <small>
                    {[product.class_name, product.subclass_name].filter(Boolean).join(' / ') ||
                      'Sem classificação'}
                  </small>
                </td>
                <td>{product.origin_name || '—'}</td>
                <td>
                  {product.cost_price == null
                    ? '—'
                    : moneyPrecise.format(Number(product.cost_price))}
                </td>
                <td>
                  {product.sale_price == null
                    ? '—'
                    : moneyPrecise.format(Number(product.sale_price))}
                </td>
                <td>
                  {product.balance_quantity == null
                    ? '—'
                    : number.format(Number(product.balance_quantity))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!products.length && <div className="empty-state">Nenhum produto encontrado.</div>}
      </div>
      <div className="pagination">
        <button onClick={() => setPage(Math.max(page - 1, 1))} disabled={page === 1}>
          ← Anterior
        </button>
        <span>
          Página {page} · {number.format(total)} linhas
        </span>
        <button onClick={() => setPage(page + 1)} disabled={!hasNext || products.length < pageSize}>
          Próxima →
        </button>
      </div>
    </article>
  );
}

function StatusScreen({
  health,
  sync,
  history,
  audit,
}: {
  health: HealthPayload | null;
  sync: SyncStatus;
  history: SyncHistoryPayload | null;
  audit: SyncAuditPayload | null;
}) {
  const lastRun = health?.last_run || sync.last_run;
  const lastSuccess = health?.last_successful_run || sync.last_successful_run;
  const age = health?.data_quality?.stock_age_days ?? null;
  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString('pt-BR') : '—';
  return (
    <section className="status-page">
      <div className={`alert ${age !== null && age > 1 ? 'warning' : 'success'}`}>
        <strong>{age !== null && age > 1 ? 'Estoque atrasado' : 'Estoque atualizado'}</strong>
        <span>
          {age === null
            ? 'Ainda não há snapshot disponível.'
            : `Último snapshot: ${health?.data_quality?.last_stock_date || '—'} (${age} dia(s) de idade).`}
        </span>
      </div>
      <section className="kpi-grid compact-kpis">
        <article className="kpi-card">
          <div className="kpi-label">Estado atual</div>
          <strong>{sync.running ? 'Em execução' : 'Concluído'}</strong>
          <small>{sync.running ? 'Uma coleta está em andamento' : 'Nenhuma coleta ativa'}</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Último estoque</div>
          <strong>{health?.data_quality?.last_stock_date || '—'}</strong>
          <small>{age === null ? 'Sem dados' : `${age} dia(s) de idade`}</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Última execução</div>
          <strong>
            {lastSuccess?.status === 'succeeded' ? 'Sucesso' : lastSuccess?.status || '—'}
          </strong>
          <small>{formatDateTime(lastSuccess?.finished_at)}</small>
        </article>
        <article className="kpi-card">
          <div className="kpi-label">Movimentos no banco</div>
          <strong>{number.format(Number(health?.data_quality?.movement_rows || 0))}</strong>
          <small>{number.format(Number(health?.data_quality?.product_rows || 0))} produtos</small>
        </article>
      </section>
      <div className="status-grid">
        <article className="card table-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">AUDITORIA DE EXECUÇÕES</p>
              <h2>Histórico de sincronizações</h2>
              <small>{history?.total || 0} execuções registradas</small>
            </div>
            <span className="period-pill">{sync.running ? 'Em execução' : 'Ocioso'}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Método</th>
                  <th>Janela</th>
                  <th>Status</th>
                  <th>Recebidos</th>
                  <th>Alterados</th>
                  <th>Duração</th>
                </tr>
              </thead>
              <tbody>
                {(history?.data || []).map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.started_at)}</td>
                    <td>
                      <strong>{run.method}</strong>
                      <small>{run.table_name || '—'}</small>
                    </td>
                    <td>
                      {run.window_start || '—'} → {run.window_end || '—'}
                    </td>
                    <td>
                      <span className={`run-status ${run.status}`}>{run.status}</span>
                      {run.error_message && <small>{run.error_message}</small>}
                    </td>
                    <td>{number.format(Number(run.records_received || 0))}</td>
                    <td>{number.format(Number(run.changed_rows ?? run.records_inserted ?? 0))}</td>
                    <td>
                      {run.duration_seconds == null
                        ? '—'
                        : `${Number(run.duration_seconds).toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history?.data?.length && (
              <div className="empty-state">Nenhuma execução registrada.</div>
            )}
          </div>
        </article>
        <article className="card table-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">HISTÓRICO DE ALTERAÇÕES</p>
              <h2>Registros modificados</h2>
              <small>Eventos gravados por execução da coleta.</small>
            </div>
            <span className="period-pill">{audit?.total || 0} alterações</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Tabela</th>
                  <th>Chave</th>
                  <th>Execução</th>
                </tr>
              </thead>
              <tbody>
                {(audit?.data || []).slice(0, 50).map((change) => (
                  <tr key={change.id}>
                    <td>{formatDateTime(change.changed_at)}</td>
                    <td>
                      <span className={`run-status ${change.change_type}`}>
                        {change.change_type}
                      </span>
                    </td>
                    <td>{change.table_name}</td>
                    <td>{change.record_key}</td>
                    <td>#{change.collection_run_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!audit?.data?.length && (
              <div className="empty-state">
                Nenhum evento de alteração registrado após a instalação da auditoria.
              </div>
            )}
          </div>
        </article>
      </div>
      {lastRun?.status === 'failed' && (
        <div className="alert error">
          A última execução falhou em {formatDateTime(lastRun.finished_at)}.{' '}
          {lastRun.error_message || 'Consulte o histórico para mais detalhes.'}
        </div>
      )}
    </section>
  );
}

function StoreDailyAnalysis({ rows }: { rows: AnalyticsPayload['store_daily'] }) {
  const [metric, setMetric] = useState<'turnover' | 'sales_velocity'>('turnover');
  const storeTotals = useMemo(() => {
    const totals = new Map<
      string,
      { name: string; sales: number; stock: number; turnover: number }
    >();
    rows.forEach((row) => {
      const item = totals.get(row.company_cnpj) || {
        name: row.store_name || row.company_cnpj,
        sales: 0,
        stock: 0,
        turnover: 0,
      };
      item.sales += Number(row.net_quantity || 0);
      item.stock += Number(row.stock_quantity || 0);
      item.turnover += Number(row.turnover || 0);
      totals.set(row.company_cnpj, item);
    });
    return [...totals.values()].sort((a, b) =>
      metric === 'turnover' ? b.turnover - a.turnover : b.sales - a.sales,
    );
  }, [metric, rows]);
  return (
    <article className="card table-card analysis-wide">
      <div className="card-header">
        <div>
          <p className="eyebrow">GIRO E VELOCIDADE POR LOJA</p>
          <h2>Desempenho diário de cada unidade</h2>
          <small>
            Velocidade = unidades vendidas no dia. Giro = vendas do dia ÷ saldo de estoque do dia.
          </small>
        </div>
        <div className="chart-toggles">
          <button
            type="button"
            className={metric === 'turnover' ? 'chart-toggle active' : 'chart-toggle'}
            onClick={() => setMetric('turnover')}
          >
            Ordenar por giro
          </button>
          <button
            type="button"
            className={metric === 'sales_velocity' ? 'chart-toggle active' : 'chart-toggle'}
            onClick={() => setMetric('sales_velocity')}
          >
            Ordenar por velocidade
          </button>
        </div>
      </div>
      <div className="store-analysis-summary">
        {storeTotals.slice(0, 15).map((store) => (
          <div className="store-analysis-chip" key={store.name}>
            <strong>{store.name}</strong>
            <span>{store.sales.toLocaleString('pt-BR')} un. no período</span>
            <b>{store.turnover.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}x giro</b>
          </div>
        ))}
      </div>
      <div className="table-scroll store-daily-table">
        <table>
          <thead>
            <tr>
              <th>Dia</th>
              <th>Loja</th>
              <th>Velocidade</th>
              <th>Faturamento</th>
              <th>Saldo</th>
              <th>Estoque tabela</th>
              <th>Giro</th>
              <th>Cobertura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.document_date}-${row.company_cnpj}`}>
                <td>{row.document_date}</td>
                <td>
                  <strong>{row.store_name || row.company_cnpj}</strong>
                  <small>{row.company_cnpj}</small>
                </td>
                <td>
                  <strong>
                    {Number(row.sales_velocity || 0).toLocaleString('pt-BR', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    un./dia
                  </strong>
                </td>
                <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                <td>{number.format(Number(row.stock_quantity || 0))}</td>
                <td>{moneyPrecise.format(Number(row.stock_sale_value || 0))}</td>
                <td>
                  {row.turnover == null
                    ? '—'
                    : `${Number(row.turnover).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}x`}
                </td>
                <td>
                  {row.coverage_days == null
                    ? '—'
                    : `${Number(row.coverage_days).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} dias`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">Sem dados diários de vendas e estoque para o período.</div>
        )}
      </div>
    </article>
  );
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [stores, setStores] = useState<Store[]>([]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [sales, setSales] = useState<DailySale[]>([]);
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesHasNext, setSalesHasNext] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsHasNext, setProductsHasNext] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryHasNext, setInventoryHasNext] = useState(false);
  const [start, setStart] = useState(subtractDays(isoToday(), 13));
  const [end, setEnd] = useState(isoToday());
  const [companies, setCompanies] = useState<string[]>([]);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [draftCompanies, setDraftCompanies] = useState<string[]>([]);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const storeFilterRef = useRef<HTMLDivElement>(null);
  const [productSearch, setProductSearch] = useState('');
  const [draftProductSearch, setDraftProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [sync, setSync] = useState<SyncStatus>({ running: false });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('net_revenue');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryPayload | null>(null);
  const [syncAudit, setSyncAudit] = useState<SyncAuditPayload | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Each screen requests only the data it renders.  In particular, a
      // sales, inventory, or products filter no longer also rebuilds the
      // overview dashboard in the background.
      const dashboardPromise =
        activeView === 'overview' ? getDashboard(start, end, companies) : Promise.resolve(null);
      const productsPromise =
        activeView === 'overview' || activeView === 'products'
          ? getProducts(
              productSearch,
              companies,
              end,
              productPage,
              activeView === 'products' ? 50 : 12,
            )
          : Promise.resolve({
              data: [] as Product[],
              total: 0,
              has_next: false,
              page: 1,
              page_size: 12,
            });
      const inventoryPromise =
        activeView === 'overview' || activeView === 'inventory'
          ? getInventory(end, companies, activeView === 'inventory' ? 100 : 12, inventoryPage)
          : Promise.resolve({
              data: [] as InventoryItem[],
              total: 0,
              has_next: false,
              page: 1,
              page_size: 12,
              as_of: end,
            });
      const analyticsPromise =
        activeView === 'overview' ? getAnalytics(start, end, companies) : Promise.resolve(null);
      const historyPromise =
        activeView === 'status' ? getSyncHistory(1, 25) : Promise.resolve(null);
      const auditPromise = activeView === 'status' ? getSyncAudit(1, 50) : Promise.resolve(null);
      const [
        dashboardResponse,
        productsResponse,
        inventoryResponse,
        analyticsResponse,
        historyResponse,
        auditResponse,
      ] = await Promise.all([
        dashboardPromise,
        productsPromise,
        inventoryPromise,
        analyticsPromise,
        historyPromise,
        auditPromise,
      ]);
      if (dashboardResponse) setDashboard(dashboardResponse);
      setProducts(productsResponse.data);
      setInventory(inventoryResponse.data);
      if (activeView === 'products' || activeView === 'overview') {
        setProductsTotal(productsResponse.total);
        setProductsHasNext(productsResponse.has_next);
      }
      if (activeView === 'inventory') {
        setInventoryTotal(inventoryResponse.total);
        setInventoryHasNext(inventoryResponse.has_next);
      }
      if (activeView === 'products') {
        // Product pagination metadata is kept by the API; the current UI uses
        // the page length as a fallback for compatibility with old responses.
      }
      if (analyticsResponse) setAnalytics(analyticsResponse);
      if (historyResponse) setSyncHistory(historyResponse);
      if (auditResponse) setSyncAudit(auditResponse);
      if (activeView === 'sales') {
        const salesResponse = await getDailySales(start, end, companies, salesPage, 100);
        setSales(salesResponse.data);
        setSalesTotal(salesResponse.total);
        setSalesHasNext(salesResponse.has_next);
      } else {
        setSales([]);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar os dados.',
      );
    } finally {
      setLoading(false);
    }
  }, [activeView, companies, end, inventoryPage, productPage, productSearch, salesPage, start]);

  useEffect(() => {
    Promise.all([getStores(), getHealth()])
      .then(([storeResponse, health]) => {
        setStores(storeResponse.data);
        setHealth(health);
        const lastMovement = health.data_quality?.last_movement_date || isoToday();
        setEnd(lastMovement);
        setStart(subtractDays(lastMovement, 13));
        setDraftEnd(lastMovement);
        setDraftStart(subtractDays(lastMovement, 13));
        setReady(true);
      })
      .catch(() => {
        setError('API indisponível. Ligue o backend e tente novamente.');
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (ready) void loadData();
  }, [loadData, ready]);

  useEffect(() => {
    getSyncStatus()
      .then(setSync)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!storePickerOpen) return undefined;
    const closePicker = (event: MouseEvent) => {
      if (storeFilterRef.current && !storeFilterRef.current.contains(event.target as Node))
        setStorePickerOpen(false);
    };
    document.addEventListener('mousedown', closePicker);
    return () => document.removeEventListener('mousedown', closePicker);
  }, [storePickerOpen]);

  useEffect(() => {
    if (!sync.running) return undefined;
    const timer = window.setInterval(() => {
      getSyncStatus()
        .then((status) => {
          setSync(status);
          if (!status.running) {
            setMessage(
              status.exit_code === 0
                ? 'Atualização concluída. Indicadores recarregados.'
                : 'A atualização terminou com falhas; consulte o log da API.',
            );
            getHealth()
              .then(setHealth)
              .catch(() => undefined);
            getSyncHistory(1, 25)
              .then(setSyncHistory)
              .catch(() => undefined);
            getSyncAudit(1, 50)
              .then(setSyncAudit)
              .catch(() => undefined);
            void loadData();
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadData, sync.running]);

  const dailySeries = useMemo(() => (dashboard?.daily || []).slice(-14), [dashboard]);
  const topStores = useMemo(() => (dashboard?.stores || []).slice(0, 5), [dashboard]);
  const topSuppliers = useMemo(
    () => (dashboard?.suppliers || []).filter((row) => row.supplier_code !== null).slice(0, 8),
    [dashboard],
  );
  const topCategories = useMemo(
    () => (dashboard?.categories || []).filter((row) => row.category_name).slice(0, 8),
    [dashboard],
  );
  const topOrigins = useMemo(
    () => (dashboard?.origins || []).filter((row) => row.origin_name).slice(0, 4),
    [dashboard],
  );
  const chartMax = Math.max(...dailySeries.map((row) => Number(row[chartMetric] || 0)), 1);
  const maxStore = Math.max(...topStores.map((row) => Number(row.net_revenue || 0)), 1);
  const storeName = (cnpj: string) =>
    stores.find((store) => store.company_cnpj === cnpj)?.trade_name || cnpj;
  const stockSaleTotal = (dashboard?.stock_by_store || []).reduce(
    (total, row) => total + Number(row.stock_sale_value || 0),
    0,
  );
  const stockCostTotal = (dashboard?.stock_by_store || []).reduce(
    (total, row) => total + Number(row.stock_cost_value || 0),
    0,
  );
  const stockQuantity = (dashboard?.stock_by_store || []).reduce(
    (total, row) => total + Number(row.balance_quantity || 0),
    0,
  );

  const chartMetricLabel: Record<ChartMetric, string> = {
    net_revenue: 'Faturamento',
    net_quantity: 'Quantidade',
    cost_value: 'Custo',
  };

  const formatChartValue = (value: number) =>
    chartMetric === 'net_quantity' ? number.format(value) : money.format(value);

  async function handleSync() {
    setMessage('Solicitando atualização rápida de vendas e estoque...');
    setError('');
    try {
      // A manual refresh only needs to re-read the latest day.  The scheduled
      // job reviews a wider window to catch late corrections from Linx.
      const status = await startSync(1, 'dashboard');
      setSync(status);
      setMessage(
        status.running
          ? 'Atualização do último dia iniciada. Os dados serão atualizados ao concluir.'
          : '',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível iniciar a atualização.',
      );
    }
  }

  function setQuickPeriod(days: number) {
    setDraftStart(subtractDays(draftEnd, days - 1));
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      setMessage('Coletando vendas, estoque e cadastro completos para o Excel...');
      const [salesResponse, inventoryResponse] = await Promise.all([
        getDailySales(start, end, companies, 1, 100000),
        getInventory(end, companies, 100000),
      ]);
      const exportSales = salesResponse.data;
      const exportInventory = inventoryResponse.data;
      const productPageSize = 5000;
      const exportProducts: Product[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const response = await getProducts(
          activeView === 'products' ? productSearch : '',
          companies,
          end,
          page,
          productPageSize,
        );
        exportProducts.push(...response.data);
        if (response.data.length < productPageSize) break;
      }
      const salesByDate = new Map<
        string,
        { net_quantity: number; net_revenue: number; cost_value: number }
      >();
      const storesByKey = new Map<
        string,
        {
          store: string;
          cnpj: string;
          net_quantity: number;
          net_revenue: number;
          cost_value: number;
        }
      >();
      const suppliersByKey = new Map<
        string,
        {
          name: string;
          code: number | '';
          net_quantity: number;
          net_revenue: number;
          cost_value: number;
        }
      >();
      const categoriesByKey = new Map<
        string,
        {
          category: string;
          className: string;
          subclass: string;
          net_quantity: number;
          net_revenue: number;
          cost_value: number;
          gross_margin: number;
        }
      >();
      exportSales.forEach((row) => {
        const quantity = Number(row.net_quantity || 0);
        const revenue = Number(row.net_revenue || 0);
        const cost = Number(row.cost_value || 0);
        const day = salesByDate.get(row.document_date) || {
          net_quantity: 0,
          net_revenue: 0,
          cost_value: 0,
        };
        day.net_quantity += quantity;
        day.net_revenue += revenue;
        day.cost_value += cost;
        salesByDate.set(row.document_date, day);
        const storeKey = row.company_cnpj || row.store_name || 'Sem loja';
        const store = storesByKey.get(storeKey) || {
          store: row.store_name || storeKey,
          cnpj: row.company_cnpj,
          net_quantity: 0,
          net_revenue: 0,
          cost_value: 0,
        };
        store.net_quantity += quantity;
        store.net_revenue += revenue;
        store.cost_value += cost;
        storesByKey.set(storeKey, store);
        const supplierKey = `${row.supplier_code ?? ''}|${row.supplier_name || 'Sem fornecedor'}`;
        const supplier = suppliersByKey.get(supplierKey) || {
          name: row.supplier_name || 'Sem fornecedor',
          code: row.supplier_code ?? '',
          net_quantity: 0,
          net_revenue: 0,
          cost_value: 0,
        };
        supplier.net_quantity += quantity;
        supplier.net_revenue += revenue;
        supplier.cost_value += cost;
        suppliersByKey.set(supplierKey, supplier);
        const categoryKey = `${row.category_name || 'Sem categoria'}|${row.class_name || ''}|${row.subclass_name || ''}`;
        const category = categoriesByKey.get(categoryKey) || {
          category: row.category_name || 'Sem categoria',
          className: row.class_name || '',
          subclass: row.subclass_name || '',
          net_quantity: 0,
          net_revenue: 0,
          cost_value: 0,
          gross_margin: 0,
        };
        category.net_quantity += quantity;
        category.net_revenue += revenue;
        category.cost_value += cost;
        category.gross_margin += Number(row.gross_margin || 0);
        categoriesByKey.set(categoryKey, category);
      });
      const summary = dashboard?.summary || {
        net_quantity: exportSales.reduce((sum, row) => sum + Number(row.net_quantity || 0), 0),
        net_revenue: exportSales.reduce((sum, row) => sum + Number(row.net_revenue || 0), 0),
        cost_value: exportSales.reduce((sum, row) => sum + Number(row.cost_value || 0), 0),
      };
      const stockQuantityForExport = exportInventory.reduce(
        (sum, row) => sum + Number(row.quantity || 0),
        0,
      );
      const stockSaleForExport = exportInventory.reduce(
        (sum, row) => sum + Number(row.quantity || 0) * Number(row.sale_price || 0),
        0,
      );
      const stockCostForExport = exportInventory.reduce(
        (sum, row) => sum + Number(row.total_cost || 0),
        0,
      );
      const dailyRows = [...salesByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
      const sheets: WorkbookSheets = {
        Resumo: [
          { Indicador: 'Linx Analytics — Relatório operacional', Valor: '', Observação: '' },
          {
            Indicador: 'Período de análise',
            Valor: `${start} a ${end}`,
            Observação: 'Filtros aplicados no momento da exportação',
          },
          {
            Indicador: 'Lojas selecionadas',
            Valor: companies.length ? companies.map(storeName).join(', ') : 'Todas as lojas',
            Observação: companies.length ? companies.join(', ') : 'Todas as lojas',
          },
          {
            Indicador: 'Faturamento líquido',
            Valor: Number(summary.net_revenue || 0),
            Observação: `${exportSales.length.toLocaleString('pt-BR')} linhas de vendas`,
          },
          {
            Indicador: 'Quantidade de vendas',
            Valor: Number(summary.net_quantity || 0),
            Observação: 'Unidades líquidas',
          },
          {
            Indicador: 'Custo das vendas',
            Valor: Number(summary.cost_value || 0),
            Observação: 'Custo movimentado',
          },
          {
            Indicador: 'Saldo em estoque',
            Valor: stockQuantityForExport,
            Observação: `${exportInventory.length.toLocaleString('pt-BR')} linhas produto · loja`,
          },
          {
            Indicador: 'Estoque a preço de venda',
            Valor: stockSaleForExport,
            Observação: 'Saldo × preço de venda',
          },
          {
            Indicador: 'Estoque a custo',
            Valor: stockCostForExport,
            Observação: 'Valor informado pela Linx',
          },
          {
            Indicador: 'Produtos no cadastro',
            Valor: exportProducts.length,
            Observação: 'Cadastro por produto · loja',
          },
        ],
        'Evolução diária': dailyRows.map(([date, row]) => ({
          Data: date,
          Quantidade: row.net_quantity,
          'Faturamento líquido': row.net_revenue,
          'Custo das vendas': row.cost_value,
        })),
        'Por loja': [...storesByKey.values()]
          .sort((a, b) => b.net_revenue - a.net_revenue)
          .map((row) => ({
            Loja: row.store,
            CNPJ: row.cnpj,
            Quantidade: row.net_quantity,
            'Faturamento líquido': row.net_revenue,
            Custo: row.cost_value,
          })),
        Fornecedores: [...suppliersByKey.values()]
          .sort((a, b) => b.net_revenue - a.net_revenue)
          .map((row) => ({
            Fornecedor: row.name,
            Código: row.code,
            Quantidade: row.net_quantity,
            'Faturamento líquido': row.net_revenue,
            Custo: row.cost_value,
          })),
        Categorias: [...categoriesByKey.values()]
          .sort((a, b) => b.net_revenue - a.net_revenue)
          .map((row) => ({
            Categoria: row.category,
            Classe: row.className,
            Subclasse: row.subclass,
            Quantidade: row.net_quantity,
            'Faturamento líquido': row.net_revenue,
            Custo: row.cost_value,
            Margem: row.gross_margin,
          })),
      };
      if (analytics) {
        sheets.Velocidade = analytics.velocity.map((row) => ({
          Produto: row.product_name || `Produto #${row.product_code}`,
          Código: row.product_code,
          Fornecedor: row.supplier_name || '',
          Vendas: Number(row.net_quantity || 0),
          'Dias ativos': Number(row.active_days || 0),
          'Unidades por dia': Number(row.sales_velocity || 0),
          'Estoque tabela': Number(row.stock_sale_value || 0),
        }));
        sheets.Giro = analytics.turnover.map((row) => ({
          Produto: row.product_name || `Produto #${row.product_code}`,
          Código: row.product_code,
          Vendas: Number(row.net_quantity || 0),
          'Estoque médio': Number(row.average_stock_quantity || 0),
          Giro: Number(row.turnover || 0),
          Snapshots: Number(row.stock_history_points || 0),
        }));
        sheets['Giro por loja'] = analytics.store_daily.map((row) => ({
          Data: row.document_date,
          Loja: row.store_name || row.company_cnpj,
          CNPJ: row.company_cnpj,
          'Velocidade (un./dia)': Number(row.sales_velocity || 0),
          'Faturamento líquido': Number(row.net_revenue || 0),
          Saldo: Number(row.stock_quantity || 0),
          'Estoque tabela': Number(row.stock_sale_value || 0),
          Giro: row.turnover == null ? '' : Number(row.turnover),
          'Cobertura (dias)': row.coverage_days == null ? '' : Number(row.coverage_days),
        }));
      }
      if (exportInventory.length) {
        sheets.Estoque = exportInventory.map((row) => ({
          Data: row.snapshot_date,
          Loja: storeName(row.company_cnpj),
          CNPJ: row.company_cnpj,
          Produto: row.product_name || '',
          Código: row.product_code,
          Referência: row.reference || '',
          Localização: row.location || '',
          Saldo: Number(row.quantity || 0),
          'Preço de custo': Number(row.cost_price || row.average_cost || 0),
          'Preço de venda': Number(row.sale_price || 0),
          'Valor a custo': Number(row.total_cost || 0),
          Fornecedor: row.supplier_name || '',
          Categoria: row.category_name || '',
          Classe: row.class_name || '',
          Subclasse: row.subclass_name || '',
          Origem: row.origin_name || '',
        }));
      }
      if (exportSales.length) {
        sheets.Vendas = exportSales.map((row) => ({
          Data: row.document_date,
          Loja: row.store_name || row.company_cnpj,
          Produto: row.product_name || '',
          Código: row.product_code,
          Fornecedor: row.supplier_name || '',
          Categoria: row.category_name || '',
          Classe: row.class_name || '',
          Subclasse: row.subclass_name || '',
          Quantidade: Number(row.net_quantity || 0),
          'Faturamento líquido': Number(row.net_revenue || 0),
          Custo: Number(row.cost_value || 0),
        }));
      }
      if (exportProducts.length) {
        sheets.Produtos = exportProducts.map((row) => ({
          Produto: row.name || '',
          Código: row.product_code,
          'Código de barras': row.barcode || '',
          Referência: row.reference || '',
          Loja: row.store_name || row.company_cnpj || 'Sem snapshot',
          Fornecedor: row.supplier_name || '',
          Categoria: row.category_name || '',
          Classe: row.class_name || '',
          Subclasse: row.subclass_name || '',
          Origem: row.origin_name || '',
          Marca: row.brand_name || '',
          Linha: row.line_name || '',
          Unidade: row.unit || '',
          'Descrição básica': row.basic_description || '',
          Custo: row.cost_price == null ? '' : Number(row.cost_price),
          Venda: row.sale_price == null ? '' : Number(row.sale_price),
          Saldo: row.balance_quantity == null ? '' : Number(row.balance_quantity),
          'Data do snapshot': row.snapshot_date || '',
          Ativo:
            row.disabled === null || row.disabled === undefined ? '' : row.disabled ? 'Não' : 'Sim',
        }));
      }
      sheets.Parâmetros = [
        {
          Campo: 'Gerado em',
          Valor: new Date().toLocaleString('pt-BR'),
          Observação: 'Horário local do navegador',
        },
        {
          Campo: 'Fonte',
          Valor: 'Linx · banco analítico PostgreSQL',
          Observação: 'Sem valores simulados',
        },
        { Campo: 'Período', Valor: `${start} a ${end}`, Observação: 'Vendas e evolução diária' },
        {
          Campo: 'Lojas',
          Valor: companies.length ? companies.map(storeName).join(', ') : 'Todas as lojas',
          Observação: companies.length ? companies.join(', ') : 'Todas as lojas',
        },
        { Campo: 'Linhas de vendas', Valor: exportSales.length, Observação: 'Aba Vendas' },
        {
          Campo: 'Linhas de estoque',
          Valor: exportInventory.length,
          Observação: 'Último snapshot disponível até a data final',
        },
        {
          Campo: 'Linhas de produtos',
          Valor: exportProducts.length,
          Observação: 'Cadastro por produto e loja',
        },
        {
          Campo: 'Limite técnico',
          Valor: '100.000 linhas por coleta',
          Observação: 'Se o volume exceder esse limite, exporte por loja ou por período',
        },
      ];
      const suffix = new Date().toISOString().slice(0, 10);
      await saveWorkbook(sheets, `linx-analytics-${activeView}-${suffix}.xlsx`);
      setMessage(
        `Excel gerado com ${exportSales.length.toLocaleString('pt-BR')} vendas, ${exportInventory.length.toLocaleString('pt-BR')} linhas de estoque e ${exportProducts.length.toLocaleString('pt-BR')} produtos.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Não foi possível gerar o Excel.',
      );
    } finally {
      setExporting(false);
    }
  }

  function applyFilters() {
    setStart(draftStart);
    setEnd(draftEnd);
    setCompanies(draftCompanies);
    setProductSearch(draftProductSearch);
    setProductPage(1);
    setSalesPage(1);
    setInventoryPage(1);
    setStorePickerOpen(false);
  }

  const categoryLabel = (row: CategoryPerformance) =>
    [row.category_name, row.class_name, row.subclass_name].filter(Boolean).join(' / ');
  const pageTitle =
    activeView === 'sales'
      ? 'Vendas'
      : activeView === 'inventory'
        ? 'Estoque'
        : activeView === 'products'
          ? 'Produtos'
          : activeView === 'status'
            ? 'Status e auditoria'
            : 'Visão geral';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <span>Linx Analytics</span>
        </div>
        <div className="workspace-label">MINISO · OPERAÇÕES</div>
        <nav>
          <button
            className={`nav-item ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveView('overview')}
          >
            <span>⌂</span> Visão geral
          </button>
          <button
            className={`nav-item ${activeView === 'sales' ? 'active' : ''}`}
            onClick={() => setActiveView('sales')}
          >
            <span>↗</span> Vendas
          </button>
          <button
            className={`nav-item ${activeView === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveView('inventory')}
          >
            <span>▦</span> Estoque
          </button>
          <button
            className={`nav-item ${activeView === 'products' ? 'active' : ''}`}
            onClick={() => setActiveView('products')}
          >
            <span>◈</span> Produtos
          </button>
          <button
            className={`nav-item ${activeView === 'status' ? 'active' : ''}`}
            onClick={() => setActiveView('status')}
          >
            <span>◷</span> Status e auditoria
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> API conectada
          <br />
          <small>PostgreSQL · Linx</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PAINEL OPERACIONAL</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <span className="last-sync">
              {sync.running
                ? 'Sincronizando...'
                : dashboard?.source === 'powerbi_monthly'
                  ? 'Fonte mensal do Power BI'
                  : 'Dados do banco analítico'}
            </span>
            <button
              className="export-button"
              onClick={handleExport}
              disabled={exporting || loading}
            >
              <span>⇩</span>
              {exporting ? 'Gerando...' : 'Exportar Excel'}
            </button>
            <button className="refresh-button" onClick={handleSync} disabled={sync.running}>
              <span>↻</span>
              {sync.running ? 'Atualizando' : 'Atualizar dados'}
            </button>
          </div>
        </header>

        <section className="filters card">
          <div className="filter-heading">
            <span className="filter-icon">◷</span>
            <div>
              <strong>Período de análise</strong>
              <small>Escolha o intervalo e uma ou mais lojas para atualizar os indicadores.</small>
              <div className="period-shortcuts">
                <span>Atalhos</span>
                {[7, 14, 30].map((days) => (
                  <button
                    type="button"
                    key={days}
                    className={
                      draftStart === subtractDays(draftEnd, days - 1)
                        ? 'quick-range active'
                        : 'quick-range'
                    }
                    onClick={() => setQuickPeriod(days)}
                  >
                    {days} dias
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label>
            De
            <input
              type="date"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={draftEnd}
              onChange={(event) => setDraftEnd(event.target.value)}
            />
          </label>
          <div className="store-filter" ref={storeFilterRef}>
            <span className="store-filter-label">Lojas</span>
            <button
              type="button"
              className="store-picker"
              aria-expanded={storePickerOpen}
              onClick={() => setStorePickerOpen((open) => !open)}
            >
              <span>
                {draftCompanies.length
                  ? `${draftCompanies.length} loja${draftCompanies.length > 1 ? 's' : ''} selecionada${draftCompanies.length > 1 ? 's' : ''}`
                  : 'Todas as lojas'}
              </span>
              <span className="store-picker-arrow">▾</span>
            </button>
            {storePickerOpen && (
              <div className="store-dropdown">
                <div className="store-checklist">
                  {stores.map((store) => {
                    const value = store.company_cnpj;
                    const checked = draftCompanies.includes(value);
                    return (
                      <label className="store-option" key={value}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDraftCompanies(
                              checked
                                ? draftCompanies.filter((item) => item !== value)
                                : [...draftCompanies, value],
                            );
                            setProductPage(1);
                          }}
                        />
                        <span>{store.trade_name || value}</span>
                      </label>
                    );
                  })}
                </div>
                <small>Marque uma ou mais lojas.</small>
              </div>
            )}
          </div>
          {draftCompanies.length > 0 && (
            <button className="clear-filter" onClick={() => setDraftCompanies([])}>
              Todas as lojas
            </button>
          )}
          <button className="apply-button" onClick={applyFilters} disabled={loading}>
            {loading ? 'Carregando...' : 'Aplicar filtros'}
          </button>
        </section>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        {activeView !== 'status' &&
          health?.data_quality?.stock_age_days !== null &&
          health?.data_quality?.stock_age_days !== undefined &&
          health.data_quality.stock_age_days > 1 && (
            <div className="alert warning">
              <strong>Estoque atrasado:</strong> último snapshot em{' '}
              {health.data_quality.last_stock_date || '—'}, há {health.data_quality.stock_age_days}{' '}
              dia(s). Consulte “Status e auditoria” ou atualize os dados.
            </div>
          )}

        {activeView === 'overview' && (
          <section className="kpi-grid">
            <article className="kpi-card">
              <div className="kpi-label">
                Faturamento líquido <span className="kpi-icon green">R$</span>
              </div>
              <strong>{money.format(Number(dashboard?.summary.net_revenue || 0))}</strong>
              <small>no período selecionado</small>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">
                Quantidade de vendas <span className="kpi-icon blue">↗</span>
              </div>
              <strong>{number.format(Number(dashboard?.summary.net_quantity || 0))}</strong>
              <small>unidades líquidas</small>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">
                Custo das vendas <span className="kpi-icon orange">R$</span>
              </div>
              <strong>{money.format(Number(dashboard?.summary.cost_value || 0))}</strong>
              <small>preço de custo movimentado</small>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">
                Saldo em estoque <span className="kpi-icon purple">▦</span>
              </div>
              <strong>{number.format(stockQuantity)}</strong>
              <small>{money.format(stockSaleTotal)} a preço de venda</small>
            </article>
          </section>
        )}

        {activeView === 'overview' && (
          <section className="dashboard-grid">
            <article className="card chart-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">EVOLUÇÃO DIÁRIA</p>
                  <h2>{chartMetricLabel[chartMetric]} por dia</h2>
                  {selectedDay && (
                    <small className="chart-selection">Selecionado: {selectedDay}</small>
                  )}
                </div>
                <div className="chart-header-actions">
                  <div className="chart-toggles">
                    {(['net_revenue', 'net_quantity', 'cost_value'] as ChartMetric[]).map(
                      (metric) => (
                        <button
                          type="button"
                          key={metric}
                          className={
                            chartMetric === metric ? 'chart-toggle active' : 'chart-toggle'
                          }
                          onClick={() => setChartMetric(metric)}
                        >
                          {chartMetricLabel[metric]}
                        </button>
                      ),
                    )}
                  </div>
                  <span className="period-pill">últimos 14 dias</span>
                </div>
              </div>
              <div className="bar-chart">
                {dailySeries.length ? (
                  dailySeries.map((day) => {
                    const value = Number(day[chartMetric] || 0);
                    return (
                      <button
                        type="button"
                        className={
                          selectedDay === day.document_date ? 'bar-column selected' : 'bar-column'
                        }
                        key={day.document_date}
                        title={`${day.document_date}: ${formatChartValue(value)}`}
                        onClick={() => setSelectedDay(day.document_date)}
                      >
                        <div className="bar-value">{formatChartValue(value)}</div>
                        <div
                          className="bar"
                          style={{ height: String(Math.max((value / chartMax) * 100, 4)) + '%' }}
                        />
                        <span>
                          {day.document_date.slice(8, 10)}/{day.document_date.slice(5, 7)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-state">Sem vendas para o período.</div>
                )}
              </div>
            </article>
            <article className="card ranking-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">DESEMPENHO</p>
                  <h2>Faturamento por loja</h2>
                </div>
              </div>
              <div className="ranking-list">
                {topStores.length ? (
                  topStores.map((store, index) => (
                    <div className="ranking-row" key={store.company_cnpj}>
                      <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                      <div className="ranking-main">
                        <div className="ranking-label">
                          <strong>{store.store_name || storeName(store.company_cnpj)}</strong>
                          <span>{money.format(Number(store.net_revenue || 0))}</span>
                        </div>
                        <div className="progress">
                          <span
                            style={{
                              width:
                                String((Number(store.net_revenue || 0) / maxStore) * 100) + '%',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Sem dados de lojas.</div>
                )}
              </div>
            </article>
          </section>
        )}

        {activeView === 'overview' && (
          <section className="detail-grid">
            <article className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">CATEGORIAS</p>
                  <h2>Categoria · classe · subclasse</h2>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Hierarquia</th>
                      <th>Quantidade</th>
                      <th>Faturamento</th>
                      <th>Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCategories.map((row, index) => (
                      <tr key={categoryLabel(row) + '-' + index}>
                        <td>
                          <strong>{row.category_name || 'Sem categoria'}</strong>
                          <small>
                            {[row.class_name, row.subclass_name].filter(Boolean).join(' / ') ||
                              'Sem classificação'}
                          </small>
                        </td>
                        <td>{number.format(Number(row.net_quantity || 0))}</td>
                        <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                        <td>{moneyPrecise.format(Number(row.gross_margin || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">FORNECEDORES</p>
                  <h2>Faturamento por fornecedor</h2>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Quantidade</th>
                      <th>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSuppliers.map((row, index) => (
                      <tr key={`${row.supplier_code}-${row.supplier_name || 'sem-nome'}-${index}`}>
                        <td>
                          <strong>{row.supplier_name || 'Código ' + row.supplier_code}</strong>
                          <small>código {row.supplier_code}</small>
                        </td>
                        <td>{number.format(Number(row.net_quantity || 0))}</td>
                        <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">ORIGEM</p>
                  <h2>Nacional · importado</h2>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Origem</th>
                      <th>Quantidade</th>
                      <th>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topOrigins.map((row) => (
                      <tr key={row.origin_name}>
                        <td>
                          <strong>{row.origin_name}</strong>
                        </td>
                        <td>{number.format(Number(row.net_quantity || 0))}</td>
                        <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeView === 'overview' && analytics && (
          <section className="analysis-grid">
            <article className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">FORNECEDOR</p>
                  <h2>Faturamento × estoque a preço de tabela</h2>
                  <small>Estoque = saldo × preço de tabela da própria loja.</small>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Faturamento</th>
                      <th>Estoque tabela</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.suppliers.slice(0, 10).map((row, index) => (
                      <tr key={`${row.supplier_code}-${row.supplier_name || 'sem-nome'}-${index}`}>
                        <td>
                          <strong>{row.supplier_name || 'Sem fornecedor'}</strong>
                          <small>código {row.supplier_code ?? '—'}</small>
                        </td>
                        <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                        <td>{moneyPrecise.format(Number(row.stock_sale_value || 0))}</td>
                        <td>{number.format(Number(row.balance_quantity || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">ORIGEM COMERCIAL</p>
                  <h2>Nacional × importado</h2>
                  <small>Importado quando o fornecedor contém “Miniso” ou “Prodigy”.</small>
                </div>
              </div>
              <div className="origin-bars">
                {analytics.origins.map((row) => (
                  <div className="origin-row" key={row.origin_name}>
                    <div className="origin-label">
                      <strong>{row.origin_name}</strong>
                      <span>{moneyPrecise.format(Number(row.net_revenue || 0))}</span>
                    </div>
                    <div className="origin-track">
                      <span
                        style={{
                          width: `${Math.min((Number(row.net_revenue || 0) / Math.max(...analytics.origins.map((item) => Number(item.net_revenue || 0)), 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      Estoque tabela: {moneyPrecise.format(Number(row.stock_sale_value || 0))}
                    </small>
                  </div>
                ))}
              </div>
            </article>
            <article className="card table-card analysis-wide">
              <div className="card-header">
                <div>
                  <p className="eyebrow">CATEGORIA · CLASSE · SUBCLASSE</p>
                  <h2>Faturamento e estoque a preço de tabela</h2>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Hierarquia</th>
                      <th>Faturamento</th>
                      <th>Estoque tabela</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.categories
                      .filter((row) => row.category_name)
                      .slice(0, 15)
                      .map((row, index) => (
                        <tr
                          key={`${row.category_name}-${row.class_name}-${row.subclass_name}-${index}`}
                        >
                          <td>
                            <strong>{row.category_name}</strong>
                            <small>
                              {[row.class_name, row.subclass_name].filter(Boolean).join(' / ') ||
                                'Sem classificação'}
                            </small>
                          </td>
                          <td>{moneyPrecise.format(Number(row.net_revenue || 0))}</td>
                          <td>{moneyPrecise.format(Number(row.stock_sale_value || 0))}</td>
                          <td>{number.format(Number(row.balance_quantity || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card table-card analysis-wide">
              <div className="card-header">
                <div>
                  <p className="eyebrow">VELOCIDADE DE VENDA</p>
                  <h2>Produtos com maior venda diária</h2>
                  <small>
                    Quantidade vendida ÷ dias desde a primeira venda no período selecionado.
                  </small>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Fornecedor</th>
                      <th>Vendas</th>
                      <th>Dias ativos</th>
                      <th>Velocidade</th>
                      <th>Estoque tabela</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.velocity.slice(0, 15).map((row) => (
                      <tr key={row.product_code}>
                        <td>
                          <strong>{row.product_name || `Produto #${row.product_code}`}</strong>
                          <small>
                            #{row.product_code} · início {row.first_sale_date || '—'}
                          </small>
                        </td>
                        <td>{row.supplier_name || '—'}</td>
                        <td>{number.format(Number(row.net_quantity || 0))}</td>
                        <td>{number.format(Number(row.active_days || 0))}</td>
                        <td>
                          <strong>
                            {Number(row.sales_velocity || 0).toLocaleString('pt-BR', {
                              maximumFractionDigits: 2,
                            })}{' '}
                            un./dia
                          </strong>
                        </td>
                        <td>{moneyPrecise.format(Number(row.stock_sale_value || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card table-card analysis-wide">
              <div className="card-header">
                <div>
                  <p className="eyebrow">GIRO DE ESTOQUE</p>
                  <h2>Produtos com maior giro</h2>
                  <small>Vendas do período ÷ estoque médio dos snapshots disponíveis.</small>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Vendas</th>
                      <th>Estoque médio</th>
                      <th>Giro</th>
                      <th>Snapshots</th>
                      <th>Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.turnover
                      .filter((row) => row.turnover != null)
                      .sort((a, b) => Number(b.turnover || 0) - Number(a.turnover || 0))
                      .slice(0, 15)
                      .map((row) => (
                        <tr key={`turnover-${row.product_code}`}>
                          <td>
                            <strong>{row.product_name || `Produto #${row.product_code}`}</strong>
                            <small>
                              #{row.product_code} · {row.category_name || 'Sem categoria'}
                            </small>
                          </td>
                          <td>{number.format(Number(row.net_quantity || 0))}</td>
                          <td>{number.format(Number(row.average_stock_quantity || 0))}</td>
                          <td>
                            <strong>
                              {Number(row.turnover || 0).toLocaleString('pt-BR', {
                                maximumFractionDigits: 2,
                              })}
                              x
                            </strong>
                          </td>
                          <td>{number.format(Number(row.stock_history_points || 0))}</td>
                          <td>
                            {row.sales_velocity && Number(row.sales_velocity) > 0
                              ? `${(Number(row.average_stock_quantity || 0) / Number(row.sales_velocity)).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} dias`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </article>
            <StoreDailyAnalysis rows={analytics.store_daily} />
          </section>
        )}

        {activeView === 'overview' && (
          <section className="bottom-grid">
            <article className="card table-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">CATÁLOGO</p>
                  <h2>Produtos, preços e saldo</h2>
                </div>
                <input
                  className="search"
                  placeholder="Buscar produto"
                  value={draftProductSearch}
                  onChange={(event) => setDraftProductSearch(event.target.value)}
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Loja</th>
                      <th>Fornecedor</th>
                      <th>Categoria</th>
                      <th>Custo</th>
                      <th>Venda</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr
                        key={
                          String(product.portal) +
                          '-' +
                          String(product.product_code) +
                          '-' +
                          String(product.company_cnpj || 'sem-snapshot')
                        }
                      >
                        <td>
                          <strong>{product.name || 'Sem nome'}</strong>
                          <small>
                            #{product.product_code} · {product.reference || 'sem referência'}
                          </small>
                        </td>
                        <td>{product.store_name || product.company_cnpj || 'Sem snapshot'}</td>
                        <td>
                          {product.supplier_name ||
                            (product.supplier_code ? '#' + product.supplier_code : '—')}
                        </td>
                        <td>{product.category_name || product.sector_name || '—'}</td>
                        <td>
                          {product.cost_price == null
                            ? '—'
                            : moneyPrecise.format(Number(product.cost_price))}
                        </td>
                        <td>
                          {product.sale_price == null
                            ? '—'
                            : moneyPrecise.format(Number(product.sale_price))}
                        </td>
                        <td>
                          {product.balance_quantity == null
                            ? '—'
                            : number.format(Number(product.balance_quantity))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="card stock-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">ESTOQUE</p>
                  <h2>Valores de estoque</h2>
                </div>
                <span className="period-pill">{inventory.length} itens</span>
              </div>
              <div className="stock-total">
                {moneyPrecise.format(stockSaleTotal)}
                <small>preço de venda · custo {moneyPrecise.format(stockCostTotal)}</small>
              </div>
              <div className="stock-list">
                {inventory.slice(0, 5).map((item) => (
                  <div
                    className="stock-row"
                    key={String(item.company_cnpj) + '-' + String(item.product_code)}
                  >
                    <span>{item.product_code}</span>
                    <div>
                      <strong>{number.format(Number(item.quantity || 0))} un.</strong>
                      <small>{item.product_name || item.location || 'Sem descrição'}</small>
                    </div>
                    <b>{moneyPrecise.format(Number(item.sale_price || 0))}</b>
                  </div>
                ))}
                {!inventory.length && (
                  <div className="empty-state">Aguardando snapshot de estoque.</div>
                )}
              </div>
            </article>
          </section>
        )}
        {activeView === 'sales' && (
          <SalesScreen
            sales={sales}
            page={salesPage}
            setPage={setSalesPage}
            pageSize={100}
            total={salesTotal}
            hasNext={salesHasNext}
          />
        )}
        {activeView === 'inventory' && (
          <InventoryScreen
            inventory={inventory}
            stores={stores}
            page={inventoryPage}
            setPage={setInventoryPage}
            pageSize={100}
            total={inventoryTotal}
            hasNext={inventoryHasNext}
          />
        )}
        {activeView === 'products' && (
          <ProductsScreen
            products={products}
            search={draftProductSearch}
            setSearch={(value) => {
              setDraftProductSearch(value);
              setProductPage(1);
            }}
            page={productPage}
            setPage={setProductPage}
            pageSize={50}
            total={productsTotal}
            hasNext={productsHasNext}
          />
        )}
        {activeView === 'status' && (
          <StatusScreen health={health} sync={sync} history={syncHistory} audit={syncAudit} />
        )}
        <footer>
          Fonte: Linx Microvix · camada analítica PostgreSQL <span>•</span> Movimentos até{' '}
          {health?.data_quality?.last_movement_date || '—'} <span>•</span> Atualização incremental
          controlada pela API
        </footer>
      </main>
    </div>
  );
}

export default App;
