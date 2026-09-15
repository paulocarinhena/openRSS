# openRSS — Guia para desenvolvedores

Documentação técnica para contribuir, operar em produção e trabalhar com o banco dual SQLite/PostgreSQL.

## Requisitos

- Node.js **22.12+**
- npm **10+**

## Setup local

```bash
git clone https://github.com/paulocarinhena/openRSS.git
cd openRSS
cp .env.example .env
npm ci
npm run dev
```

Sem `DATABASE_URL` no `.env`, o app abre o assistente de instalação em `/setup`. As migrations são aplicadas pelo próprio app na inicialização.

Para pular o assistente:

```bash
# .env
DATABASE_URL=file:./data/openrss.db
```

## Scripts npm

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento em `http://localhost:3000` |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção |
| `npm run db:generate` | Regenera `prisma/sqlite` e `prisma/postgres` a partir de `prisma/schema.base.prisma` e os dois clients Prisma |
| `npm run db:migrate -- --name <nome>` | Cria migration para o provider do `.env`/`config.json` |
| `npm run db:deploy` | Aplica migrations manualmente (o app já faz isso ao iniciar) |
| `npm run typecheck` | Verificação TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Testes Vitest |

## Checklist antes de abrir um PR

O CI executa `npm ci`, geração e verificação dos schemas, lint, typecheck, testes e build. Reproduza localmente:

```bash
npm run db:generate
npm run lint
npm run typecheck
npm test
DISABLE_SCHEDULER=true npm run build
```

## Banco dual (SQLite / PostgreSQL)

O Prisma não aceita provider dinâmico, então:

- **Edite só** `prisma/schema.base.prisma`. `npm run db:generate` gera `prisma/sqlite/schema.prisma` e `prisma/postgres/schema.prisma`.
- Cada provider tem sua pasta de migrations. Ao mudar o schema, crie a migration nos dois:

```bash
npm run db:migrate -- --name minha_mudanca
DATABASE_PROVIDER=postgresql DATABASE_URL=postgresql://user:pass@localhost:5432/openrss npm run db:migrate -- --name minha_mudanca
```

- São gerados dois clients (`src/generated/prisma` e `src/generated/prisma-postgres`); `src/lib/db.ts` escolhe em runtime conforme `src/lib/env.ts` (ambiente > `config.json`).
- Mantenha os modelos portáveis: sem `@db.*` e sem arrays escalares.

## Migrando de SQLite para PostgreSQL

1. Exporte o OPML de cada usuário (Configurações → Feeds → Exportar).
2. Suba a instância com Postgres e recrie os usuários.
3. Importe os OPMLs. (Estado de lido/salvo e histórico não são migrados.)

## Operação em produção

- Verifique a saúde em `GET /api/health` ou com `docker compose ps`.
- Consulte logs com `docker compose logs -f openrss`.
- Atualize gerando backup do volume/banco, baixando a revisão desejada e executando `docker compose up -d --build`. As migrations são aplicadas automaticamente pelo app ao iniciar.
- Faça backup do volume `openrss-data` (contém `config.json` com o `APP_SECRET` e, no SQLite, o banco) e, no PostgreSQL, use as ferramentas de backup do próprio banco. Teste periodicamente a restauração.
- Para refazer o assistente de instalação, remova a chave `database` de `/data/config.json` (mantenha `appSecret`) e reinicie o container.
- Imagens publicadas no GHCR recebem uma tag imutável `sha-<commit completo>`, além da tag Git e de `latest` na branch padrão. Em produção, prefira a tag `sha-*` para rollback e implantação reproduzível.
- Para usar uma tag local específica no Compose, defina `OPENRSS_IMAGE_TAG`; o padrão de builds locais é `local`, não `latest`.
- Nunca versione `.env`. Apenas `.env.example`, sem segredos reais, é mantido no repositório.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (SQLite / PostgreSQL via driver adapters) · Better Auth · AI SDK 7.
