import type { ComponentProps, MouseEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './switch';

function clickEvent() {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  } as MouseEvent<HTMLButtonElement>;
}

describe('Switch', () => {
  it('executa callback do consumidor e alterna estado', () => {
    const onClick = vi.fn();
    const onCheckedChange = vi.fn();
    const element = Switch({ checked: false, onClick, onCheckedChange });
    const props = element.props as ComponentProps<'button'>;
    props.onClick?.(clickEvent());

    expect(onClick).toHaveBeenCalledOnce();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('preserva cancelamento explicito do consumidor', () => {
    const onCheckedChange = vi.fn();
    const element = Switch({
      checked: true,
      onClick: (event) => event.preventDefault(),
      onCheckedChange,
    });
    const props = element.props as ComponentProps<'button'>;
    props.onClick?.(clickEvent());

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('expõe semantica acessivel e estado desabilitado', () => {
    const markup = renderToStaticMarkup(<Switch checked disabled aria-label="Notificações" />);
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Notificações"');
  });
});
