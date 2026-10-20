# Origem do design system

Este pacote é uma cópia independente e adaptada do design system interno Renova.

- Origem: `Renova-AI-Tech/renova-monorepo`, diretório `packages/ui`.
- Revisão: `73830f818932ea6d441b384ddca593c7093897ac`.
- Extração: 19 de outubro de 2026, por arquivo da revisão, sem usar o checkout de trabalho.
- A revisão de origem não contém arquivo de licença aberta. Esta nota registra a
  procedência e não concede uma licença de distribuição pública.

Foram preservados os 15 primitivos e as sete composições existentes. A adaptação
remove informações pessoais, defaults de cargos e a variante `painel` que dependia
do CSS de outro aplicativo. Fontes passam a ser servidas localmente, pelo pacote.
O `Switch` preserva o callback do consumidor sem perder a alternância. O gráfico
usa conteúdo textual de estilo em vez de injeção de HTML.

Dependências de terceiros mantêm suas próprias licenças, incluídas nas respectivas
distribuições npm. Manrope e Playfair Display são distribuídas via Fontsource sob
SIL Open Font License, assim como Material Symbols Outlined. Conservar essas
licenças quando redistribuir os arquivos de fontes. Componentes Radix e utilitários
são dependências do projeto e não requerem registro privado Renova.
