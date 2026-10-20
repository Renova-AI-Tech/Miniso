import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChartContainer, ChartLegendContent, ChartTooltipContent } from './chart';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <Fragment>{children}</Fragment>,
  };
});

describe('ChartLegendContent', () => {
  it.each([
    { label: undefined, expected: 'Receita' },
    { label: 'Receita mensal', expected: 'Receita mensal' },
  ])('renders the series name unless a label is configured: $expected', ({ label, expected }) => {
    const markup = renderToStaticMarkup(
      <ChartContainer config={{ revenue: { color: 'var(--primary)', label } }}>
        <ChartLegendContent
          payload={[
            { dataKey: 'revenue', value: 'Receita', color: 'var(--primary)', type: 'square' },
          ]}
        />
      </ChartContainer>,
    );

    expect(markup).toContain(`${expected}</div>`);
  });
});

describe('ChartTooltipContent', () => {
  it('rejects HTML and stylesheet injection in chart colors', () => {
    expect(() =>
      renderToStaticMarkup(
        <ChartContainer
          config={{
            value: { color: '</style><script>alert(1)</script>' },
          }}
        >
          <div>Gráfico</div>
        </ChartContainer>,
      ),
    ).toThrow('Chart colors must be local CSS color values.');
  });

  it('renders zero values inside the formatted value slot', () => {
    const markup = renderToStaticMarkup(
      <ChartContainer
        config={{
          value: {
            label: 'Leitura',
            color: 'var(--primary)',
          },
        }}
      >
        <ChartTooltipContent
          active
          hideLabel
          payload={[
            {
              color: 'var(--primary)',
              dataKey: 'value',
              graphicalItemId: 'value',
              name: 'value',
              payload: {},
              value: 0,
            },
          ]}
        />
      </ChartContainer>,
    );

    expect(markup).toContain('>0</span>');
  });
});
