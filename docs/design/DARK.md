---
name: Dark
description: Tema escuro do openRSS — canvas quase preto, contornos hairline, pílulas translúcidas e rótulos mono em caixa alta.
platform: web
colors:
  primary: "#ffffff"
  on-primary: "#0a0a0a"
  ink: "#ffffff"
  ink-hover: "#fafaf7"
  body: "#dadbdf"
  mute: "#858990"
  hairline: "#212327"
  outline: "rgb(255 255 255 / 37%)"
  outline-hover: "rgb(255 255 255 / 55%)"
  canvas: "#0a0a0a"
  canvas-soft: "#1a1c20"
  canvas-card: "#191919"
  canvas-mid: "#363a3f"
  accent-orange: "#ff7a17"
  accent-orange-soft: "#ffc285"
  accent-purple: "#7c3aed"
  accent-violet: "#c4b5fd"
  accent-blue: "#a0c3ec"
  accent-navy: "#0d1726"
  destructive: "#f87171"
  success: "#4ade80"
  warning: "#fbbf24"
typography:
  display-md:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 400
    lineHeight: 36px
    letterSpacing: -0.6px
  display-xs:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 28px
  body-lg:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-sm:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  caption-mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 1.2px
  button-md:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
rounded:
  none: 0px
  sm: 8px
  pill: 9999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  text-input:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
  card:
    backgroundColor: "{colors.canvas-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xl}"
  sidebar-row:
    backgroundColor: "{colors.canvas}"
    activeBackground: "{colors.canvas-soft}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
  eyebrow-mono:
    textColor: "{colors.mute}"
    typography: "{typography.caption-mono}"
---

# Design System: Dark

## Overview

**North Star: "Sala escura"**

O tema Dark é um canvas quase preto (`#0a0a0a`) de ponta a ponta, contornos hairline e pílulas translúcidas como vocabulário interativo. É contido e técnico: nada de gradientes de fundo, nada de sombras. Texto branco sobre preto, com Geist em peso regular e rótulos Geist Mono em caixa alta.

**Key Characteristics:**
- Canvas único quase preto; cartões e painéis em `canvas-card` com borda hairline.
- Botões em pílula (`9999px`) com borda branca translúcida; o único botão preenchido (branco) é a ação primária da tela.
- Rótulos de seção, metadados e contadores em Geist Mono caixa alta com tracking positivo.
- Sem sombras: elevação apenas por borda e mudança tonal.
- Paleta de acentos (laranja, roxo, violeta, azul) usada com parcimônia: cores de pastas, badges de prioridade da IA, ícones.

## Colors

### Surface
- **Canvas** `#0a0a0a`: fundo de página.
- **Canvas Soft** `#1a1c20`: hover, item selecionado, inputs, tooltips.
- **Canvas Card** `#191919`: cartões, leitor, diálogos.
- **Canvas Mid** `#363a3f`: superfícies aninhadas, blocos de código.
- **Hairline** `#212327`: divisores de 1px.

### Text
- **Ink** `#ffffff`: títulos e texto principal; não lidos.
- **Body** `#dadbdf`: corpo do artigo.
- **Mute** `#858990`: metadados, itens lidos, legendas.

### Accents & Semantic
- Laranja `#ff7a17` / suave `#ffc285`: prioridade alta da IA.
- Roxo `#7c3aed` / violeta `#c4b5fd`: superfícies de IA (resumo, digest, chat) — só em ícone/indicador.
- Azul `#a0c3ec`: links no leitor, informação.
- `destructive`, `success`, `warning`: estados de erro, confirmação e feeds com falha.

## Typography

- Geist peso 400 em quase tudo; ênfase por tamanho e tracking negativo em títulos grandes. Títulos de artigo não lidos podem usar 500 para leitura rápida na lista.
- **Display** (32px / -0.6px): títulos de página e estados vazios.
- **Body lg** (17px / 28px): corpo do leitor, largura ~68ch.
- **Body sm** (14px / 20px): interface, lista de artigos.
- **Caption mono** (12px, +1.2px, UPPERCASE): nomes de seção na sidebar, metadados, contadores.

## Layout
- Base 4px. Padding de cartão 24px; linhas de lista 12px vertical.
- Touch targets mínimos de 44px em mobile.

## Elevation & Depth

| Nível | Tratamento | Uso |
|---|---|---|
| 0 — Flat | sem borda | fundo, sidebar |
| 1 — Hairline | 1px `hairline` | cartões, leitor, inputs, diálogos |

Nenhuma sombra.

## Shapes
- `8px` para cartões, inputs e linhas selecionadas.
- `9999px` para todo botão e chip.

## Components

- **Button primary:** pílula branca com texto `#0a0a0a`; uma por tela.
- **Button outline:** pílula transparente, borda `outline`, hover `outline-hover`.
- **Input:** `canvas-soft`, borda hairline, foco com borda `outline-hover`.
- **Card / Reader:** `canvas-card`, borda hairline, raio 8px.
- **Sidebar row:** transparente; ativo em `canvas-soft` com indicador branco de 2px à esquerda.
- **Eyebrow mono:** rótulos de seção ("FEEDS", "PASTAS", "HOJE").

## Do's and Don'ts

### Do
- Manter o canvas `#0a0a0a` como única superfície de página.
- Usar pílulas em todo elemento interativo.
- Combinar Geist (sentence case) com Geist Mono UPPERCASE nos rótulos.
- Bordas translúcidas nos botões outline.

### Don't
- Sombras em cartões.
- Botões preenchidos em excesso.
- Gradientes de fundo ou brilhos.
- Negrito em títulos de display.
