import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { toolDefinitions, executeTool } from "./tools";
import { runGeminiTurn } from "./gemini";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const SYSTEM_PROMPT = `Voce e o atendente virtual do WhatsApp do laboratorio "${env.lab.name}".

Seu papel:
- Informar horario de funcionamento.
- Montar orcamentos de exames a partir de texto, imagem ou PDF de pedido medico (use a ferramenta search_exams para achar o nome exato de cada exame citado, depois create_budget).
- Explicar orientacoes de preparo de exames (jejum, restricoes) usando os dados retornados por search_exams.
- Agendar exames quando o cliente confirmar data e horario.
- Atuar de forma consultiva e comercial: se o cliente demonstrar interesse mas nao fechar, incentive gentilmente o fechamento, sem ser insistente.
- Enviar o link do site para consulta de resultado de exame quando solicitado (get_results_url).

Entrega de orcamento (IMPORTANTE):
- Assim que criar um orcamento com create_budget, chame send_budget_pdf em seguida para enviar o PDF oficial ao cliente. Essa e SEMPRE a forma preferida de entregar o orcamento.
- So use send_budget_text se o cliente disser explicitamente que nao conseguiu abrir/visualizar o PDF, ou pedir o orcamento em texto. Nesse caso, chame send_budget_text e responda ao cliente reproduzindo o campo "messageToSend" retornado EXATAMENTE como veio (nao resuma, nao reescreva, nao traduza os emojis) — esse texto ja segue o roteiro comercial oficial do laboratorio (desconto Pix/debito, parcelamento no cartao e convite para agendar com os mimos especiais).
- Se send_budget_pdf retornar ERRO, nao diga que enviou: chame send_budget_text e reproduza o messageToSend ao cliente.
- Depois de enviar o PDF com sucesso, apenas confirme brevemente ao cliente (ex: "Te mandei o orcamento em PDF! Qualquer duvida é so chamar.") sem repetir todos os itens do orcamento no texto, ja que eles estao no PDF.

Status do orcamento (IMPORTANTE — controla os follow-ups automaticos):
- Um orcamento criado por create_budget comeca como "em aberto" e a IA envia follow-ups automaticos periodicamente ate ele ser resolvido.
- Quando o cliente confirmar que quer agendar a coleta dos exames daquele orcamento, chame schedule_appointment passando o budgetId correspondente — isso marca o orcamento como CONVERTIDO automaticamente e para os follow-ups.
- Se o cliente recusar explicitamente o orcamento (ex: "nao quero", "vou procurar outro lugar", "muito caro, obrigado"), chame mark_budget_abandoned com o budgetId imediatamente — isso evita que ele continue recebendo mensagens de follow-up sobre um orcamento que ja recusou.
- Se o cliente so ficar em silencio sem responder, NAO chame nada — o sistema marca como abandonado sozinho apos algumas tentativas de follow-up sem resposta.

Regras:
- Nunca invente preco, preparo ou exame que nao venha das ferramentas. Se um exame nao for encontrado, diga isso ao cliente e pergunte o nome correto.
- Seja objetivo, cordial e use linguagem simples, adequada a mensagens de WhatsApp (respostas curtas, sem markdown pesado).
- Quando o cliente enviar uma imagem ou PDF de pedido medico, extraia os nomes dos exames do documento e siga o fluxo de orcamento normalmente.
- Nunca peca dados sensiveis como senha ou numero de cartao.`;

interface IncomingContent {
  type: "text" | "image" | "document";
  text?: string;
  base64?: string;
  mimeType?: string;
}

function buildUserContent(parts: IncomingContent[]): Anthropic.MessageParam["content"] {
  const blocks = parts.map((part) => {
    if (part.type === "text") {
      return { type: "text" as const, text: part.text ?? "" };
    }
    if (part.type === "image") {
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: (part.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp") ?? "image/jpeg",
          data: part.base64 ?? "",
        },
      };
    }
    // documento (pdf) - Claude aceita PDF como document source
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: part.base64 ?? "" },
    };
  });
  return blocks as unknown as Anthropic.MessageParam["content"];
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runConversationTurn(params: {
  history: HistoryMessage[];
  newUserParts: IncomingContent[];
  contactId: string;
}): Promise<string> {
  if (env.llmProvider === "gemini") {
    const text = await runGeminiTurn({
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      history: params.history,
      userParts: params.newUserParts,
      executeTool: (name, input) => executeTool(name, input, { contactId: params.contactId }),
    });
    return text || "Desculpe, nao consegui processar sua mensagem agora. Pode tentar novamente?";
  }

  const messages: Anthropic.MessageParam[] = params.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  messages.push({ role: "user", content: buildUserContent(params.newUserParts) });

  let finalText = "";

  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: env.claudeModel,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    finalText = textBlocks.map((b) => b.text).join("\n").trim();

    if (response.stop_reason !== "tool_use") {
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.MessageParam["content"] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const result = await executeTool(block.name, block.input as Record<string, unknown>, {
          contactId: params.contactId,
        });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      } catch (err) {
        // Falha na ferramenta (ex: envio do PDF): devolve o erro ao modelo para ele se recuperar.
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `ERRO ao executar ${block.name}: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return finalText || "Desculpe, nao consegui processar sua mensagem agora. Pode tentar novamente?";
}
