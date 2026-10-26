import type { AppRouter } from '@renova/backend/contract';
import { createTRPCClient, httpLink } from '@trpc/client';
import type {
  AnalyticsPayload,
  DailySale,
  DashboardPayload,
  HealthPayload,
  InventoryItem,
  Product,
  SyncAuditPayload,
  SyncHistoryPayload,
  SyncStatus,
  Summary,
} from './types';

const client = createTRPCClient<AppRouter>({ links: [httpLink({ url: '/api/trpc' })] });
type CompanyFilter = string | string[] | undefined;
const companies = (value?: CompanyFilter) => (Array.isArray(value) ? value : value ? [value] : []);

export async function getStores() {
  const response = await client.linx.stores.query();
  return { data: response.data, count: response.data.length };
}

export async function getHealth() {
  return client.linx.health.query() as unknown as Promise<HealthPayload>;
}

export async function getSummary(start: string, end: string, company?: CompanyFilter) {
  return client.linx.summary.query({
    start,
    end,
    companies: companies(company),
  }) as unknown as Promise<{
    start: string;
    end: string;
    source?: 'powerbi_monthly' | 'linx_movements';
    data: Summary;
  }>;
}

export async function getDashboard(start: string, end: string, company?: CompanyFilter) {
  return client.linx.dashboard.query({
    start,
    end,
    companies: companies(company),
  }) as unknown as Promise<DashboardPayload>;
}

export async function getDailySales(
  start: string,
  end: string,
  company?: CompanyFilter,
  page = 1,
  pageSize = 100,
) {
  return client.linx.dailySales.query({
    start,
    end,
    companies: companies(company),
    page,
    pageSize,
  }) as unknown as Promise<{
    data: DailySale[];
    page: number;
    page_size: number;
    total: number;
    has_next: boolean;
  }>;
}

export async function getProducts(
  search = '',
  company?: CompanyFilter,
  asOf?: string,
  page = 1,
  pageSize = 12,
) {
  return client.linx.products.query({
    search,
    companies: companies(company),
    asOf: asOf || new Date().toISOString().slice(0, 10),
    page,
    pageSize,
  }) as unknown as Promise<{
    data: Product[];
    page: number;
    page_size: number;
    total: number;
    has_next: boolean;
  }>;
}

export async function getInventory(
  asOf: string,
  company?: CompanyFilter,
  pageSize = 100,
  page = 1,
) {
  return client.linx.inventory.query({
    asOf,
    companies: companies(company),
    page,
    pageSize,
  }) as unknown as Promise<{
    data: InventoryItem[];
    as_of: string;
    page: number;
    page_size: number;
    total: number;
    has_next: boolean;
  }>;
}

export async function getAnalytics(start: string, end: string, company?: CompanyFilter) {
  return client.linx.analyses.query({
    start,
    end,
    companies: companies(company),
  }) as unknown as Promise<AnalyticsPayload>;
}

export async function getSyncStatus() {
  return client.linx.syncStatus.query() as unknown as Promise<SyncStatus>;
}

export async function getSyncHistory(page = 1, pageSize = 25, status?: string, method?: string) {
  return client.linx.syncHistory.query({
    page,
    pageSize,
    method,
    status,
  }) as unknown as Promise<SyncHistoryPayload>;
}

export async function getSyncAudit(
  page = 1,
  pageSize = 50,
  runId?: number,
  tableName?: string,
  changeType?: string,
) {
  return client.linx.syncAudit.query({
    page,
    pageSize,
    runId,
    tableName,
    changeType,
  }) as unknown as Promise<SyncAuditPayload>;
}

export async function startSync(
  daysBack = 3,
  profile: 'dashboard' | 'full' = 'dashboard',
): Promise<SyncStatus> {
  await client.linx.sync.mutate({ daysBack, profile });
  const status = (await client.linx.syncStatus.query()) as unknown as SyncStatus;
  return { ...status, running: true };
}

/** Compatibility surface kept for the template reference page. */
export const api = {
  public: {
    list: {
      query: async (
        _input?: { limit?: number; cursor?: string },
        _options?: { signal?: AbortSignal },
      ) => ({
        items: [] as Array<{ id: string; title: string; description: string }>,
        nextCursor: null as string | null,
      }),
    },
  },
};
