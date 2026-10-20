import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider } from './ui/sidebar';

describe('AppSidebar independente', () => {
  it('nao inventa identidade nem contexto no perfil publico', () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar items={[]} activeId="home" />
      </SidebarProvider>,
    );

    expect(markup).toContain('Renova');
    expect(markup).not.toContain('data-sidebar="footer"');
    expect(markup).not.toContain('Contexto');
    expect(markup).not.toContain('Ricardo');
    expect(markup).not.toContain('Líder');
  });

  it('renderiza identidade explicita e escapa conteudo fornecido', () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <AppSidebar
          items={[{ id: 'home', label: 'Início', icon: 'home', href: '/' }]}
          activeId="home"
          userName="<script>pessoa</script>"
          userRole="Responsável"
        />
      </SidebarProvider>,
    );

    expect(markup).toContain('data-sidebar="footer"');
    expect(markup).toContain('Responsável');
    expect(markup).toContain('&lt;script&gt;pessoa&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('data-active="true"');
  });
});
