import { DrawerCancelButton, DrawerShell } from '@renova/ui/components/drawer-shell';
import { EmptyState } from '@renova/ui/components/empty-state';
import { SuccessState } from '@renova/ui/components/feedback-state';
import { FieldError } from '@renova/ui/components/form-feedback';
import { StatusBadge } from '@renova/ui/components/status-badge';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@renova/ui/components/ui/alert-dialog';
import { Badge } from '@renova/ui/components/ui/badge';
import { Button } from '@renova/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renova/ui/components/ui/card';
import { Checkbox } from '@renova/ui/components/ui/checkbox';
import { Input } from '@renova/ui/components/ui/input';
import { Label } from '@renova/ui/components/ui/label';
import { Separator } from '@renova/ui/components/ui/separator';
import { Skeleton } from '@renova/ui/components/ui/skeleton';
import { Switch } from '@renova/ui/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renova/ui/components/ui/tooltip';
import { useRef, useState } from 'react';

export function ReferenceGallery() {
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  return (
    <div data-testid="component-gallery">
      <header className="gallery-heading">
        <p className="eyebrow">Design system Renova</p>
        <h1>Uma linguagem em comum.</h1>
        <p className="lead">
          Cores, tipografia e componentes para dar forma às suas ideias. Experimente os exemplos
          abaixo.
        </p>
        <Badge variant="outline">Demonstração visual · sem salvar dados</Badge>
      </header>
      <section className="identity-grid" aria-label="Identidade visual">
        <div className="type-sample">
          <span className="eyebrow">Tipografia</span>
          <p className="display-sample">
            Clareza.
            <br />
            <em>Com personalidade.</em>
          </p>
          <p>Playfair Display + Manrope</p>
        </div>
        <div className="palette-sample">
          <span className="eyebrow">Paleta essencial</span>
          <div className="swatches">
            <div className="swatch swatch-primary">
              <span>Profundidade</span>
              <strong>#1E3A3A</strong>
            </div>
            <div className="swatch swatch-accent">
              <span>Energia</span>
              <strong>#4FD1C5</strong>
            </div>
            <div className="swatch swatch-surface">
              <span>Respiro</span>
              <strong>#F5F7F7</strong>
            </div>
          </div>
        </div>
      </section>
      <div className="gallery-grid">
        <Card>
          <CardHeader>
            <p className="gallery-card-label">01 / Interação</p>
            <CardTitle>
              <h2>Ações e estados</h2>
            </CardTitle>
            <CardDescription>Hierarquia clara para cada decisão.</CardDescription>
          </CardHeader>
          <CardContent className="gallery-stack">
            <div className="button-row">
              <Button ref={drawerTrigger} onClick={() => setDrawerOpen(true)}>
                Abrir painel
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Abrir diálogo</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Uma pausa para confirmar</AlertDialogTitle>
                    <AlertDialogDescription>
                      Este é um exemplo de diálogo. Nenhum dado será alterado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar à galeria</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button disabled>Indisponível</Button>
            </div>
            <Separator />
            <div className="button-row">
              <StatusBadge tone="accent">Concluído</StatusBadge>
              <StatusBadge tone="warning">Em revisão</StatusBadge>
              <StatusBadge>Rascunho</StatusBadge>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="link">Sobre estes exemplos</Button>
                </TooltipTrigger>
                <TooltipContent>Os controles alteram apenas esta demonstração.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="gallery-card-label">02 / Formulários</p>
            <CardTitle>
              <h2>Campos e escolhas</h2>
            </CardTitle>
            <CardDescription>Rótulos visíveis e controles acessíveis.</CardDescription>
          </CardHeader>
          <CardContent className="gallery-stack">
            <div className="field">
              <Label htmlFor="example-name">Nome de exemplo</Label>
              <Input
                id="example-name"
                placeholder="Uma nova ideia"
                maxLength={80}
                aria-describedby="example-name-hint"
              />
              <p className="field-hint" id="example-name-hint">
                Campo de demonstração. Nada é enviado ou salvo.
              </p>
            </div>
            <div className="choice-row">
              <Checkbox
                id="example-checkbox"
                checked={selected}
                onCheckedChange={(value) => setSelected(value === true)}
              />
              <Label htmlFor="example-checkbox">Selecionar exemplo</Label>
            </div>
            <div className="choice-row">
              <Switch id="example-switch" checked={compact} onCheckedChange={setCompact} />
              <Label htmlFor="example-switch">Exibição compacta</Label>
            </div>
            <div
              className={`preview-choice ${compact ? 'preview-choice--compact' : ''}`}
              data-testid="choice-preview"
            >
              <strong>{selected ? 'Exemplo selecionado' : 'Exemplo disponível'}</strong>
              <p>
                {compact
                  ? 'Visualização compacta.'
                  : 'Visualização com mais espaço para o conteúdo.'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="gallery-card-label">03 / Feedback</p>
            <CardTitle>
              <h2>Retorno para cada momento</h2>
            </CardTitle>
            <CardDescription>Exemplos de vazio, sucesso e erro.</CardDescription>
          </CardHeader>
          <CardContent className="gallery-stack">
            <EmptyState>Ainda não há itens nesta demonstração.</EmptyState>
            <SuccessState>Exemplo de confirmação: tudo certo para continuar.</SuccessState>
            <div className="field">
              <Label htmlFor="invalid-example">Campo com erro ilustrativo</Label>
              <Input
                id="invalid-example"
                defaultValue=""
                aria-invalid="true"
                aria-describedby="invalid-example-message"
              />
              <div id="invalid-example-message">
                <FieldError message="Exemplo de orientação: preencha este campo." />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="gallery-card-label">04 / Carregamento</p>
            <CardTitle>
              <h2>Enquanto o conteúdo chega</h2>
            </CardTitle>
            <CardDescription>Estrutura de carregamento, sem deslocar a página.</CardDescription>
          </CardHeader>
          <CardContent className="gallery-stack">
            <div role="img" aria-label="Exemplo visual de carregamento">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
            <Separator />
            <p className="section-description">
              Uma base consistente deixa você livre para cuidar do que o seu projeto precisa
              resolver.
            </p>
          </CardContent>
        </Card>
      </div>
      <DrawerShell
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          drawerTrigger.current?.focus();
        }}
        eyebrow="Composição Renova"
        title="Espaço para os detalhes"
        description="Um painel lateral mantém o contexto enquanto apresenta mais informações."
        footer={<DrawerCancelButton>Voltar à galeria</DrawerCancelButton>}
      >
        <p className="drawer-copy">
          Use esta composição para detalhes e ações secundárias. Este exemplo não realiza
          alterações.
        </p>
        <SuccessState>Você pode fechar pelo botão ou pela tecla Esc.</SuccessState>
      </DrawerShell>
    </div>
  );
}
