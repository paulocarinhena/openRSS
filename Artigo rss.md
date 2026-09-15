Lancei o openRSS — um leitor de RSS self-hosted com IA integrada

Depois de meses usando (e me frustrando com) leitores de feed genéricos, decidi construir o meu. O resultado é o openRSS: um leitor de RSS open source, rápido e com IA integrada no fluxo de leitura, não como um recurso isolado colado por cima.

Repositório: https://github.com/paulocarinhena/openRSS

Por que mais um leitor de RSS?

RSS nunca morreu. O que faltava era um leitor que tratasse IA como parte do produto, e que rodasse na sua própria infraestrutura, com seus próprios dados.

Integrações de IA

O openRSS se conecta a praticamente qualquer provedor do mercado: OpenAI, Anthropic, OpenRouter, ou qualquer API compatível com OpenAI, incluindo modelos locais via Ollama, LM Studio ou vLLM para quem quer zero dependência de nuvem.

E a IA não fica só no "resumir artigo". Ela é usada para:

- Resumo em streaming de qualquer artigo, com cache
- Digest diário dos não lidos, agrupado por tema, automático ou sob demanda
- Chat com os feeds, em que a IA busca e lê os artigos por conta própria para responder perguntas
- Priorização de artigos novos, com nota de 0 a 100 com base nos interesses do usuário
- Provedores globais (definidos pelo administrador) e pessoais (por usuário)
- Chaves de API criptografadas com AES-256-GCM

Você escolhe o provedor, o modelo e até se quer rodar tudo localmente, sem depender de nenhuma nuvem.

Outros recursos

- Descoberta automática de feeds a partir da URL do site
- Suporte a RSS, Atom e RDF
- Importação e exportação OPML
- Modo leitura com Readability, busca instantânea e atalhos de teclado
- Autenticação própria (Better Auth), com suporte a múltiplos usuários
- Temas Light e Dark

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Prisma 7, Better Auth, AI SDK 7

Instalação (Docker):

git clone https://github.com/paulocarinhena/openRSS.git
cd openRSS
docker compose up -d --build

SQLite para instâncias pequenas, PostgreSQL para escalar — a escolha é feita no assistente de instalação.

É um projeto open source, sob licença Apache 2.0, feito para quem quer controle total sobre os próprios feeds e sobre a IA que os acompanha. Se você tem interesse em RSS, self-hosting ou só quer conhecer o projeto, fica o convite para dar uma olhada e deixar um feedback.

#OpenSource #RSS #SelfHosted #InteligenciaArtificial #NextJS
