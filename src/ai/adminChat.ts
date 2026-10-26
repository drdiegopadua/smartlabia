import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { adminToolDefinitions, executeAdminTool } from "./adminTools";
import { runGeminiTurn } from "./gemini";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const ADMIN_SYSTEM_PROMPT = `Voce e o assistente de configuracao do SmartLabIA, o sistema de atendimento por IA do laboratorio "${env.lab.name}".

Voce conversa com um administrador do laboratorio (nao com clientes). Seu papel e manter atualizado, em linguagem natural, o banco de dados que a IA de atendimento ao WhatsApp usa: precos de exames, preparo/jejum, tipo de amostra, prazo de resultado, cadastro de novos exames, exames descontinuados e horario de funcionamento.

Regras:
- Sempre que o administrador informar uma mudanca (ex: "hemograma agora custa 20 reais", "fechamos aos sabados", "criar exame Vitamina B12 por 40 reais"), aplique a mudanca IMEDIATAMENTE usando as ferramentas disponiveis. Nao peca confirmacao antes — o administrador ja esta confirmando ao te dizer isso.
- Se o exame citado nao for encontrado por search_exams, pergunte o nome exato antes de desistir, mas se for claramente um exame novo, ofereca criar com create_exam.
- Depois de aplicar qualquer mudanca, responda com uma confirmacao curta e especifica, mostrando o que mudou (ex: "Hemograma completo atualizado: R$ 15,00 → R$ 20,00 ✅"). Nao repita instrucoes desnecessarias.
- Se a mensagem for ambigua (nao ficar claro qual exame, ou faltar um valor), pergunte antes de agir.
- Voce pode listar exames e horarios quando o administrador pedir, sem precisar de confirmacao.
- Seja direto e objetivo — este e um painel interno de trabalho, nao uma conversa de vendas.`;

interface AdminHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function runAdminChatTurn(params: {
  history: AdminHistoryMessage[];
  message: string;
}): Promise<string> {
  if (env.llmProvider === "gemini") {
    const text = await runGeminiTurn({
      system: ADMIN_SYSTEM_PROMPT,
      tools: adminToolDefinitions,
      history: params.history,
      userParts: [{ type: "text", text: params.message }],
      executeTool: (name, input) => executeAdminTool(name, input),
    });
    return text || "Nao consegui processar essa alteracao agora. Pode tentar reformular?";
  }

  const messages: Anthropic.MessageParam[] = params.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  messages.push({ role: "user", content: params.message });

  let finalText = "";

  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: env.claudeModel,
      max_tokens: 1024,
      system: ADMIN_SYSTEM_PROMPT,
      tools: adminToolDefinitions,
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
      const result = await executeAdminTool(block.name, block.input as Record<string, unknown>);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return finalText || "Nao consegui processar essa alteracao agora. Pode tentar reformular?";
}
