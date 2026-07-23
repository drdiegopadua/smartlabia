# Guia passo a passo: colocando o SmartLabIA no ar

Este guia assume que você não é técnico. Vou te levar do zero até o primeiro laboratório cliente usando o sistema de verdade no WhatsApp dele.

Existem 4 contas que **só você pode criar** (exigem seus dados, cartão de pagamento ou verificação de identidade — não posso fazer isso por você):

1. **Anthropic** (a IA que atende o cliente)
2. **Meta for Developers** (o WhatsApp oficial da empresa)
3. Uma **hospedagem** para o sistema rodar 24h (ex: Railway)
4. Opcionalmente um **domínio** (ex: `smartlabia.com.br`) — não é obrigatório para começar

Depois de você criar essas contas e me passar as chaves/tokens, eu configuro o resto.

---

## Passo 1 — Criar a chave da IA (Anthropic)

1. Acesse **https://console.anthropic.com** e crie uma conta.
2. Adicione um cartão de crédito em "Billing" (a API é paga por uso; para o volume de um laboratório pequeno o custo mensal costuma ser baixo, poucos dólares).
3. Vá em **API Keys** → **Create Key**. Dê um nome como "SmartLabIA Producao".
4. Copie a chave (começa com `sk-ant-...`) e guarde — ela só aparece uma vez.

➡️ Essa chave vai na variável `ANTHROPIC_API_KEY`.

---

## Passo 2 — Criar o WhatsApp oficial da empresa (Meta Cloud API)

1. Acesse **https://developers.facebook.com** e crie uma conta de desenvolvedor (usa seu login do Facebook).
2. Clique em **Meus Apps** → **Criar App** → escolha o tipo **"Outro"** → **"Empresa"**.
3. Dentro do app criado, adicione o produto **WhatsApp**.
4. A Meta vai te dar um **número de teste** gratuito para começar a testar antes de usar o número real do laboratório.
5. Em **WhatsApp → Configuração da API**, anote:
   - **Token de acesso temporário** (dura 24h — depois você troca por um permanente, passo 2.1 abaixo)
   - **Phone Number ID**
6. Em **Configurações do app → Básico**, copie o **Chave Secreta do App (App Secret)** — clique em "Mostrar" (pode pedir sua senha do Facebook).

➡️ Essas informações vão em `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_APP_SECRET`.

### Passo 2.1 — Gerar um token permanente (não expira em 24h)

O token temporário é só para testes. Para produção:

1. Vá em **Configurações da Empresa** (Business Settings) no https://business.facebook.com.
2. Em **Usuários do Sistema**, crie um usuário do sistema com papel "Admin".
3. Gere um token para esse usuário com permissão `whatsapp_business_messaging` e `whatsapp_business_management`, sem data de expiração.

### Passo 2.2 — Ligar o número de WhatsApp real do laboratório

Quando o número de teste estiver funcionando, você troca pelo número real do laboratório em **WhatsApp → Configuração da API → Adicionar número de telefone**, seguindo a verificação por SMS/ligação.

### Passo 2.3 — Verificação de negócio (recomendado antes de vender)

Sem verificar o negócio na Meta, existe um limite de ~250 conversas iniciadas por dia. Para um laboratório com bom volume, vale fazer a **Verificação da Empresa** em Configurações da Empresa → Segurança → Verificação (envolve CNPJ e documentos).

---

## Passo 3 — Escolher onde o sistema vai rodar (hospedagem)

Recomendo o **Railway** (https://railway.app) por ser o mais simples: hospeda o app e o banco de dados PostgreSQL juntos, com poucos cliques, e tem plano pago barato por uso.

1. Crie uma conta no Railway (pode logar com GitHub).
2. Suba o código do SmartLabIA para um repositório no **GitHub** (posso te ajudar a criar e enviar o repositório quando você quiser — é só pedir).
3. No Railway: **New Project → Deploy from GitHub repo** → selecione o repositório do SmartLabIA.
4. Adicione um banco: **New → Database → PostgreSQL**. O Railway gera a `DATABASE_URL` automaticamente.
5. No serviço do app, vá em **Variables** e cole todas as variáveis do `.env.example` preenchidas (menos `DATABASE_URL`, que já vem do banco do Railway — você só precisa referenciar `${{Postgres.DATABASE_URL}}`).
6. O Railway detecta o `Dockerfile` do projeto automaticamente e faz o build.
7. Depois do primeiro deploy, o Railway te dá uma URL pública tipo `https://smartlabia-production.up.railway.app`.

*(Alternativas equivalentes: Render.com ou Fly.io — o processo é parecido.)*

---

## Passo 4 — Conectar o webhook da Meta ao seu sistema no ar

1. Copie a URL pública do Railway (passo 3.7) e complete com `/webhook`. Exemplo: `https://smartlabia-production.up.railway.app/webhook`.
2. No app da Meta, vá em **WhatsApp → Configuração → Webhook → Editar**.
3. Cole a URL no campo **Callback URL**.
4. No campo **Verify Token**, use o mesmo valor que você colocou em `WHATSAPP_VERIFY_TOKEN` nas variáveis de ambiente.
5. Clique em **Verificar e salvar**. Se aparecer erro, confira se o app está mesmo no ar (acesse `https://SEU_DOMINIO/health` no navegador — deve responder `{"status":"ok"}`).
6. Em **Campos do Webhook**, marque **messages** e clique em **Assinar**.

---

## Passo 5 — Colocar os dados reais do laboratório

O sistema já sobe com exames de exemplo (Hemograma, Glicemia, Colesterol, TSH, Urina). Você precisa trocar pelos exames, preços e horários reais do laboratório cliente.

**Forma mais fácil (sem programar):** rodar o **Prisma Studio**, uma tela visual tipo planilha:

```bash
npx prisma studio
```

Isso abre uma página no navegador onde você adiciona/edita exames (nome, preço, preparo, jejum) e horários de funcionamento direto, sem mexer em código. Rode esse comando com a `DATABASE_URL` do banco de produção configurada no `.env` local, ou peça para eu configurar um acesso remoto seguro para você usar isso continuamente.

---

## Passo 6 — Testar de ponta a ponta

1. No WhatsApp, mande uma mensagem para o número de teste/produção configurado: "Oi, qual o horário de vocês?"
2. O sistema deve responder com o horário cadastrado.
3. Teste um orçamento: "Quero saber o preço do hemograma e da glicemia".
4. Teste enviar uma foto de um pedido médico (pode ser uma foto de exemplo) e veja se a IA extrai os exames corretamente.
5. Teste um agendamento: "Quero marcar para amanhã às 9h".

Se algo não responder como esperado, me avise com o que você mandou e o que a IA respondeu — eu ajusto o comportamento.

---

## Checklist final antes de vender para o primeiro laboratório

- [ ] Conta Anthropic criada, com créditos/cartão configurado
- [ ] App Meta criado, token **permanente** gerado (não o temporário de 24h)
- [ ] Número de WhatsApp do laboratório verificado e conectado
- [ ] Verificação de negócio da Meta feita (evita limite de mensagens)
- [ ] Sistema no ar (Railway ou similar), `/health` respondendo
- [ ] Webhook configurado e assinado no painel da Meta
- [ ] Exames, preços, preparo e horários reais cadastrados (via Prisma Studio)
- [ ] Link de resultados (`LAB_RESULTS_URL`) apontando para o site real do laboratório
- [ ] Teste de ponta a ponta feito com mensagens reais

Quando tiver as contas do Passo 1 e 2 criadas, me passe as chaves (pode ser direto aqui, ou me pedir para gerar o repositório no GitHub primeiro) que eu sigo com o deploy e a configuração.
