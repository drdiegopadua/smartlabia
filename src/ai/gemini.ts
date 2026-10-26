import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";

// Adaptador do Google Gemini (REST), usado quando LLM_PROVIDER=gemini.
// Serve para testar sem custo: o plano gratuito do Gemini pode usar o conteudo enviado
// para melhorar produtos do Google — use SOMENTE dados ficticios nesse modo.

export interface GeminiInputPart {
  type: "text" | "image" | "document";
  text?: string;
  base64?: string;
  mimeType?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [key: string]: unknown;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// O Gemini aceita um subconjunto do JSON Schema: tipos em maiusculo e sem additionalProperties.
function convertSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(convertSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === "additionalProperties") continue;
      if (key === "type" && typeof value === "string") out[key] = value.toUpperCase();
      else out[key] = convertSchema(value);
    }
    return out;
  }
  return schema;
}

export function toGeminiFunctionDeclarations(tools: Anthropic.Tool[]) {
  return tools.map((tool) => {
    const schema = tool.input_schema as { properties?: Record<string, unknown> };
    const hasParams = schema.properties && Object.keys(schema.properties).length > 0;
    return {
      name: tool.name,
      description: tool.description ?? "",
      ...(hasParams ? { parameters: convertSchema(tool.input_schema) } : {}),
    };
  });
}

function toGeminiParts(parts: GeminiInputPart[]): GeminiPart[] {
  return parts.map((p) => {
    if (p.type === "text") return { text: p.text ?? "" };
    const mimeType = p.type === "document" ? "application/pdf" : (p.mimeType ?? "image/jpeg");
    return { inlineData: { mimeType, data: p.base64 ?? "" } };
  });
}

type GeminiResponse = { candidates?: Array<{ content?: GeminiContent }>; error?: { message: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tenta o modelo principal e, se estiver sobrecarregado (503/429) ou indisponivel (404),
// repete e cai para os modelos reserva.
async function callGemini(body: unknown): Promise<GeminiResponse> {
  const models = [env.gemini.model, ...env.gemini.fallbackModels.filter((m) => m !== env.gemini.model)];
  let lastError = "erro desconhecido";

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${env.gemini.baseUrl}/models/${model}:generateContent`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
        const data = (await res.json()) as GeminiResponse;
        if (res.ok) return data;
        lastError = `Gemini ${res.status} (${model}): ${data.error?.message ?? "erro desconhecido"}`;
        if (![404, 429, 500, 503].includes(res.status)) throw new Error(lastError);
        if (res.status === 404) break; // modelo indisponivel: vai direto para o proximo
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Gemini 4") && !err.message.startsWith("Gemini 429")) throw err;
        lastError = err instanceof Error ? err.message : String(err);
      }
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(lastError);
}

export async function runGeminiTurn(params: {
  system: string;
  tools: Anthropic.Tool[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userParts: GeminiInputPart[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
}): Promise<string> {
  const contents: GeminiContent[] = params.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  contents.push({ role: "user", parts: toGeminiParts(params.userParts) });

  let finalText = "";

  for (let turn = 0; turn < 6; turn++) {
    const data = await callGemini({
      systemInstruction: { parts: [{ text: params.system }] },
      contents,
      tools: [{ functionDeclarations: toGeminiFunctionDeclarations(params.tools) }],
      generationConfig: { maxOutputTokens: 1024 },
    });

    const content = data.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    finalText = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();

    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0 || !content) break;

    // Devolve o conteudo do modelo exatamente como veio (preserva assinaturas de raciocinio).
    contents.push(content);

    const responses: GeminiPart[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      let result: string;
      try {
        result = await params.executeTool(call.name, call.args ?? {});
      } catch (err) {
        // Falha na ferramenta (ex: envio do PDF): devolve o erro ao modelo para ele se recuperar.
        result = `ERRO ao executar ${call.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }

  return finalText;
}
