# openRSS

Leitor RSS self-hosted, simples e rápido, inspirado no Feedly — com IA integrada (OpenAI, Anthropic, OpenRouter ou qualquer API OpenAI-compatible, inclusive modelos locais).

Feito para instâncias pequenas (até ~5 usuários simultâneos) rodando em **um único container com SQLite**. Precisa de mais? Escolha **PostgreSQL** no assistente de instalação.

## Recursos

- **Leitura**: Hoje (priorizado), Todos, Salvos, pastas e feeds; visualizações de cartões, títulos ou revista; modo artigo completo (Readability); busca; atalhos de teclado (`j/k`, `o`, `m`, `s`, `Shift+A`, `/`).
- **Feeds**: descoberta automática a partir da URL do site, RSS/Atom/RDF, atualização em segundo plano com ETag/Last-Modified e backoff em erros, importação/exportação OPML, retenção configurável.
- **IA**
  - **Resumir** artigo (streaming, com cache).
  - **Digest diário** dos não lidos, agrupado por tema, automático ou sob demanda.
  - **Chat** com seus feeds — a IA busca e lê artigos via ferramentas.
  - **Priorização**: nota 0–100 para artigos novos com base nos seus interesses.
  - Provedores **globais** (admin) e **pessoais** (cada usuário), chaves criptografadas (AES-256-GCM).
- **Usuários**: email + senha; o primeiro cadastro vira admin; cadastro aberto/fechado; admin cria usuários.
- **Temas** Light e Dark (ver `docs/design/`).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (SQLite / PostgreSQL via driver adapters) · Better Auth · AI SDK 7.

## Rodando com Docker

```bash
docker compose up -d --build
```

Acesse http://localhost:3000. Na primeira visita, o **assistente de instalação** pergunta qual banco usar:

- **SQLite** — nada a configurar; o arquivo fica em `/data/openrss.db`.
- **PostgreSQL** — informe host, porta, usuário, senha e nome do banco. O openRSS testa a conexão e, se o banco ainda não existir, oferece criá-lo (o usuário precisa da permissão `CREATEDB`).

Em seguida crie a conta de administrador. Tudo que o assistente gera (`config.json` com o banco escolhido e o `APP_SECRET`, além do SQLite) fica no volume `openrss-data`, montado em `/data`, e sobrevive a atualizações da imagem.

### PostgreSQL embutido

Para subir um Postgres junto com o app (o assistente é pulado, pois `DATABASE_URL` já vem definida):

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 32)
docker compose -f docker-compose.postgres.yml up -d --build
```

`POSTGRES_PASSWORD` não possui valor padrão: o Compose interrompe antes de subir os serviços se ela não for definida.

### Variáveis de ambiente

Todas são opcionais. Variáveis definidas no ambiente têm precedência sobre `config.json`.

| Variável | Padrão | Descrição |
|---|---|---|
| `OPENRSS_DATA_DIR` | `/data` (Docker) · `./data` (dev) | Pasta com `config.json` e o banco SQLite. |
| `APP_SECRET` | gerado no primeiro boot | Mínimo de 16 caracteres; placeholders são rejeitados. Protege sessões e criptografa chaves de IA. Salvo em `config.json` quando gerado. Não troque depois de cadastrar chaves. |
| `BETTER_AUTH_URL` | `http://localhost:3000` | URL pública do app. |
| `DATABASE_URL` | — | Defina para pular o assistente: `file:...` (SQLite) ou `postgresql://...`. O provider é inferido pela URL. |
| `DATABASE_PROVIDER` | inferido | `sqlite` ou `postgresql`; só necessário se a URL for ambígua. |
| `ALLOW_PRIVATE_FEEDS` | `false` | Permite feeds em IPs privados/localhost (ex.: RSS-Bridge na rede local). |
| `DISABLE_SCHEDULER` | `false` | Desliga o agendador interno. |

## Desenvolvimento

Requer Node.js 22.12+ e npm 10+.

```bash
cp .env.example .env
npm ci                        # instalação reproduzível; gera os clients Prisma
npm run dev
```

Sem `DATABASE_URL` no `.env`, o app abre o assistente de instalação em `/setup`, como no Docker; as migrations são aplicadas pelo próprio app na inicialização. Para pular o assistente, defina `DATABASE_URL=file:./data/openrss.db` no `.env`.

Scripts úteis:

| Script | O que faz |
|---|---|
| `npm run db:generate` | Regenera `prisma/sqlite` e `prisma/postgres` a partir de `prisma/schema.base.prisma` e os dois clients. |
| `npm run db:migrate -- --name <nome>` | Cria migration para o provider do `.env`/`config.json` (rode com cada provider). |
| `npm run db:deploy` | Aplica migrations manualmente (o app já faz isso ao iniciar). |
| `npm run typecheck` / `npm run lint` / `npm test` | Checagens. |

O CI executa `npm ci`, geração e verificação dos schemas, lint, typecheck, testes e build. Antes de abrir um PR, reproduza localmente com:

```bash
npm run db:generate
npm run lint
npm run typecheck
npm test
DISABLE_SCHEDULER=true npm run build
```

## Operação

- Verifique a saúde em `GET /api/health` ou com `docker compose ps`.
- Consulte logs com `docker compose logs -f openrss`.
- Atualize gerando backup do volume/banco, baixando a revisão desejada e executando `docker compose up -d --build`. As migrations são aplicadas automaticamente pelo app ao iniciar.
- Faça backup do volume `openrss-data` (contém `config.json` com o `APP_SECRET` e, no SQLite, o banco) e, no PostgreSQL, use as ferramentas de backup do próprio banco. Teste periodicamente a restauração.
- Para refazer o assistente de instalação, remova a chave `database` de `/data/config.json` (mantenha `appSecret`) e reinicie o container.
- Imagens publicadas no GHCR recebem uma tag imutável `sha-<commit completo>`, além da tag Git e de `latest` na branch padrão. Em produção, prefira a tag `sha-*` para rollback e implantação reproduzível.
- Para usar uma tag local específica no Compose, defina `OPENRSS_IMAGE_TAG`; o padrão de builds locais é `local`, não `latest`.
- Nunca versiona `.env`. Apenas `.env.example`, sem segredos reais, é mantido no repositório.

### Banco dual (SQLite / PostgreSQL)

O Prisma não aceita provider dinâmico, então:

- **Edite só** `prisma/schema.base.prisma`. `npm run db:generate` gera `prisma/sqlite/schema.prisma` e `prisma/postgres/schema.prisma`.
- Cada provider tem sua pasta de migrations. Ao mudar o schema, crie a migration nos dois:
  ```bash
  npm run db:migrate -- --name minha_mudanca                                   # SQLite
  DATABASE_PROVIDER=postgresql DATABASE_URL=postgresql://... npm run db:migrate -- --name minha_mudanca
  ```
- São gerados dois clients (`src/generated/prisma` e `src/generated/prisma-postgres`); `src/lib/db.ts` escolhe em runtime conforme `src/lib/env.ts` (ambiente > `config.json`).
- Mantenha os modelos portáveis: sem `@db.*` e sem arrays escalares.

### Migrando de SQLite para PostgreSQL

1. Exporte o OPML de cada usuário (Configurações → Feeds → Exportar).
2. Suba a instância com Postgres e recrie os usuários.
3. Importe os OPMLs. (Estado de lido/salvo e histórico não são migrados.)

## Configurando IA

Configurações → IA → **Adicionar**:

| Tipo | Base URL | Exemplo de modelo |
|---|---|---|
| OpenAI | opcional | `gpt-5-mini` |
| Anthropic | opcional | `claude-sonnet-5` |
| OpenRouter | opcional | `anthropic/claude-sonnet-5` |
| OpenAI-compatible | **obrigatória** — ex.: Ollama `http://host.docker.internal:11434/v1`, LM Studio `http://host.docker.internal:1234/v1` | `llama3.2` |

Use **Testar** para validar a conexão. Admins podem marcar o provedor como **global** para todos os usuários.

## Apoie o projeto

Se o openRSS é útil para você, considere apoiar o desenvolvimento:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-pcarinhena-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/pcarinhena)

## Licença

Distribuído sob a [Apache License 2.0](LICENSE). Veja também [NOTICE](NOTICE).
