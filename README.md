# SmartLabIA

IA que atende o WhatsApp de um laboratório: horário de funcionamento, orçamento de exames (texto, imagem ou PDF de pedido médico), orientações de preparo, agendamento, ações de vendas e reengajamento de leads inativos.

## Stack

- Node.js + TypeScript
- Express (webhook)
- PostgreSQL + Prisma
- Anthropic Claude (via `@anthropic-ai/sdk`), com *tool use* para consultar exames, montar orçamentos e agendar
- WhatsApp Cloud API (Meta) para envio/recebimento de mensagens
- `node-cron` para o job de follow-up de leads inativos

## Setup

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e preencha:
   - `DATABASE_URL`: string de conexão PostgreSQL
   - `ANTHROPIC_API_KEY`: chave da API da Anthropic
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`: credenciais do app no Meta for Developers (WhatsApp Cloud API)
   - `LAB_NAME`, `LAB_RESULTS_URL`: nome do laboratório e link do site de resultados
3. Crie o banco e rode as migrações:
   ```bash
   npm run prisma:migrate
   ```
4. Popule dados de exemplo (exames, horários):
   ```bash
   npm run prisma:seed
   ```
5. Suba o servidor em modo dev:
   ```bash
   npm run dev
   ```

## Configurando o webhook no Meta for Developers

1. No painel do app WhatsApp Cloud API, configure a URL do webhook como `https://SEU_DOMINIO/webhook` (é preciso expor a porta local via túnel, ex: `ngrok http 3000`, durante o desenvolvimento).
2. Use o mesmo valor de `WHATSAPP_VERIFY_TOKEN` do `.env` no campo "Verify Token" da Meta.
3. Assine o campo `messages` do webhook.

## Estrutura

```
src/
  config/env.ts           # variáveis de ambiente centralizadas
  db/prisma.ts             # cliente Prisma
  whatsapp/client.ts        # envio de mensagens e download de mídia (Cloud API)
  whatsapp/webhook.ts       # recebimento de mensagens e orquestração da resposta
  ai/claude.ts              # loop de conversa com Claude (tool use, texto/imagem/PDF)
  ai/tools.ts                # definição e execução das ferramentas que a IA pode chamar
  services/                  # regras de negócio: exames, orçamentos, agendamentos, contatos
  jobs/followup.job.ts       # cron de reengajamento de orçamentos abertos sem fechamento
prisma/schema.prisma        # modelo de dados (exames, orçamentos, agendamentos, conversas)
prisma/seed.ts               # dados de exemplo
```

## Fluxo de reengajamento de leads

O job cron (`FOLLOWUP_CRON`, padrão a cada hora) busca orçamentos com status `OPEN` sem atualização há mais de `FOLLOWUP_INACTIVITY_HOURS` (padrão 24h) e envia até 3 mensagens de follow-up, espaçadas pela mesma janela de inatividade. Após a 3ª tentativa sem conversão, o orçamento é marcado como `ABANDONED`.

## Colocando em produção para um cliente real

Veja o guia passo a passo em **[DEPLOY.md](./DEPLOY.md)** — cobre criação de conta na Anthropic, configuração do WhatsApp Cloud API (Meta), hospedagem (Railway), configuração do webhook em produção e cadastro dos dados reais do laboratório sem precisar programar (Prisma Studio).

## Rodando com Docker

```bash
docker compose up --build
```

Sobe o Postgres e o app juntos. As migrações são aplicadas automaticamente ao iniciar o container (`docker-entrypoint.sh`). Depois, rode o seed uma vez: `docker compose exec app npm run prisma:seed`.

## Próximos passos sugeridos

- Trocar os dados mockados de exames/horários por integração com o sistema de gestão do laboratório (LIS/ERP), quando existir.
- Adicionar painel administrativo para visualizar conversas, orçamentos e agendamentos sem precisar do Prisma Studio.
- Implementar confirmação automática de agendamento (lembrete 1 dia antes).
- Testes automatizados para o loop de tool use e para os serviços de negócio.
