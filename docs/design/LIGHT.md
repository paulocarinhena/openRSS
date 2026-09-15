---
name: Light
description: Tema claro do openRSS — leitura calma, densidade moderada e um único acento azul-marinho para ação.
platform: web
colors:
  background: "oklch(0.985 0.006 250)"
  foreground: "oklch(0.18 0.018 252)"
  surface: "oklch(1 0.002 250)"
  primary: "oklch(0.36 0.075 251)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.955 0.01 250)"
  accent: "oklch(0.94 0.035 251)"
  success: "oklch(0.69 0.14 165)"
  success-soft: "oklch(0.72 0.12 165)"
  info: "oklch(0.62 0.11 220)"
  warning: "oklch(0.72 0.14 75)"
  muted: "oklch(0.955 0.01 250)"
  muted-foreground: "oklch(0.48 0.018 252)"
  border: "oklch(0.89 0.014 252)"
  destructive: "oklch(0.577 0.245 27.325)"
  sidebar: "oklch(0.97 0.009 250)"
typography:
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.25"
    letterSpacing: "-0.025em"
  reader:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.7"
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.25"
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1.25"
  mono:
    fontFamily: "Geist Mono, monospace"
rounded:
  sm: "0.45rem"
  md: "0.6rem"
  lg: "0.75rem"
  xl: "1.05rem"
  2xl: "1.35rem"
  pill: "9999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "0 0.75rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "1rem"
---

# Design System: Light

## Overview

**North Star: "Mesa de leitura"**

O tema Light transforma a triagem de feeds em uma rotina serena: listas compactas, leitor confortável e uma presença visual discreta. A interface ajuda a ler, decidir e seguir em frente — o conteúdo é o centro.

Geist sustenta toda a experiência com uma escala compacta. Camadas azuladas frias e sombras estruturais separam navegação, lista e leitor sem transformar a tela em uma coleção de cartões decorativos.

**Key Characteristics:**
- Densidade moderada, feita para leitura recorrente.
- Acento azul-marinho de baixo croma reservado para ações, seleção e foco.
- Superfícies arredondadas com profundidade contida.
- Estados visíveis (lido / não lido / salvo), foco de teclado inequívoco e feedback rápido.

## Colors

Paleta fria que transmite precisão e calma; o azul-marinho concentra ação e orientação sem dominar a tela.

- **Primary (Azul de Orientação):** ações primárias, item selecionado, links, anéis de foco, contador de não lidos ativo.
- **Secondary (Névoa):** fundos de controle e estados de baixa ênfase.
- **Accent (Azul de Contexto):** realce suave de hover e áreas de apoio; nunca uma segunda ação primária.
- **Semantic:** `info` para atualização de feeds em curso; `success` para confirmações; `warning` para feeds com erro; `destructive` para ações irreversíveis.
- **Neutral:** `background` (plano frio), `surface` (lista e leitor), `foreground` (texto), `border` (divisores silenciosos), `sidebar` (camada da navegação).

**The One Signal Rule.** O azul de orientação é um sinal operacional. Use-o para ação, seleção, foco e estado, nunca como preenchimento decorativo.

## Typography

Uma única família sem serifa (Geist) com Geist Mono para valores técnicos. Hierarquia vem de peso, tamanho e espaçamento.

- **Headline** (600, `1.875rem`): estados vazios e títulos de página.
- **Title** (600, `1rem`, `1.25`): títulos de artigo na lista, cartões e seções.
- **Reader** (400, `1rem`, `1.7`): corpo do artigo, largura máxima ~68ch.
- **Body** (400, `0.875rem`, `1.5`): interface geral.
- **Label** (500, `0.75rem`): metadados (feed, autor, data), controles.
- **Mono**: código, URLs de feed, métricas de IA.

**The Working Scale Rule.** Não usar tipografia de exibição em controles, menus ou listas.

## Elevation

Elevação estrutural e sutil. Bordas e mudanças tonais fazem a maior parte da separação.

- **Baixa (`shadow-sm`, preto 5%):** campos, itens de lista em hover.
- **Média (`shadow-md`, acento 20–30%):** ação primária.
- **Estrutural (`shadow-xl`, preto 10–15%):** menus, diálogos, painel do leitor flutuante.

**The Resting Surface Rule.** Superfícies em repouso não devem parecer suspensas.

## Components

### Buttons
- Cantos `0.75rem`, altura `2rem`. Primary em azul de orientação; Ghost para ações de contexto (marcar lido, salvar, abrir original). Transições de `200ms`; foco com anel de 3 unidades.

### Article list
- Linhas compactas; não lidos com título em peso 600 e ponto de acento; lidos em `muted-foreground`. Item selecionado recebe fundo `accent` e anel interno discreto.

### Reader
- Superfície `surface`, cantos `1.35rem` quando em painel. Cabeçalho com feed, autor, data e ações; resumo de IA aparece em bloco `secondary` acima do conteúdo, nunca competindo com o texto.

### Inputs
- Altura `2.25rem`, cantos `1.05rem`, fundo `background`. Foco: borda primária + halo. Erro: cor destrutiva com anel próprio.

### Navigation
- Sidebar em camada `sidebar`, linhas compactas com contador de não lidos à direita. Em telas menores, abre como painel lateral modal.

### AI surfaces
- Resumo, digest e chat usam a mesma superfície de leitura. Streaming e metadados (modelo, tokens) em `caption`/mono, sem brilho ou gradiente.

## Do's and Don'ts

### Do
- Usar o azul de orientação para próxima ação, foco e seleção.
- Preservar contraste alto e foco visível para navegação por teclado.
- Manter controles compactos e transições em torno de `200ms`.
- Deixar artigos longos respirarem com entrelinha ampla e largura controlada.

### Don't
- Gradientes, brilhos ou cartões decorativos por toda a tela.
- Gradiente em texto.
- Acento primário como fundo decorativo em estados inativos.
- Remover indicadores de foco ou depender só de hover.
- Introduzir outra família tipográfica.
