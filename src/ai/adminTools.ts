import Anthropic from "@anthropic-ai/sdk";
import {
  searchExams,
  listAllExamsDetailed,
  updateExam,
  createExam,
  deactivateExam,
} from "../services/exams.service";
import { upsertBusinessHours, getBusinessHoursText } from "../services/business.service";

export const adminToolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_exams",
    description: "Busca exames existentes pelo nome ou termo relacionado, para localizar o exame antes de editar.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Termo de busca" } },
      required: ["query"],
    },
  },
  {
    name: "list_all_exams_detailed",
    description: "Lista todos os exames ativos com todos os detalhes (preco, preparo, jejum, amostra, prazo).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_exam",
    description:
      "Atualiza um ou mais campos de um exame existente (preco, preparo, horas de jejum, tipo de amostra, prazo, apelidos de busca). Use o nome exato do exame, obtido via search_exams se necessario.",
    input_schema: {
      type: "object",
      properties: {
        examName: { type: "string", description: "Nome exato do exame a atualizar" },
        price: { type: "number", description: "Novo preco, se estiver mudando" },
        preparation: { type: "string", description: "Novo texto de orientacao de preparo, se estiver mudando" },
        fastingHours: { type: "number", description: "Novas horas de jejum, se estiver mudando" },
        sampleType: { type: "string", description: "Novo tipo de amostra, se estiver mudando" },
        turnaroundDays: { type: "number", description: "Novo prazo em dias, se estiver mudando" },
        aliases: {
          type: "array",
          items: { type: "string" },
          description: "Nova lista de termos alternativos de busca, se estiver mudando",
        },
      },
      required: ["examName"],
    },
  },
  {
    name: "create_exam",
    description: "Cadastra um novo exame no catalogo do laboratorio.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do exame" },
        price: { type: "number", description: "Preco do exame" },
        aliases: { type: "array", items: { type: "string" }, description: "Termos alternativos de busca" },
        preparation: { type: "string", description: "Orientacao de preparo" },
        fastingHours: { type: "number", description: "Horas de jejum, se aplicavel" },
        sampleType: { type: "string", description: "Tipo de amostra (sangue, urina, fezes...)" },
        turnaroundDays: { type: "number", description: "Prazo estimado do resultado, em dias" },
      },
      required: ["name", "price"],
    },
  },
  {
    name: "deactivate_exam",
    description: "Remove um exame do catalogo ativo (ele deixa de aparecer para os clientes no WhatsApp).",
    input_schema: {
      type: "object",
      properties: { examName: { type: "string", description: "Nome exato do exame a desativar" } },
      required: ["examName"],
    },
  },
  {
    name: "get_business_hours",
    description: "Retorna o horario de funcionamento atual, dia a dia.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_business_hours",
    description: "Atualiza o horario de funcionamento de um dia da semana especifico.",
    input_schema: {
      type: "object",
      properties: {
        dayOfWeek: { type: "number", description: "0=domingo, 1=segunda, ..., 6=sabado" },
        opensAt: { type: "string", description: "Horario de abertura, formato HH:MM (ignorado se closed=true)" },
        closesAt: { type: "string", description: "Horario de fechamento, formato HH:MM (ignorado se closed=true)" },
        closed: { type: "boolean", description: "true se o laboratorio fica fechado nesse dia" },
      },
      required: ["dayOfWeek", "closed"],
    },
  },
];

export async function executeAdminTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_exams": {
      const exams = await searchExams(String(input.query ?? ""));
      if (exams.length === 0) return "Nenhum exame encontrado para esse termo.";
      return JSON.stringify(
        exams.map((e) => ({
          name: e.name,
          price: Number(e.price),
          preparation: e.preparation,
          fastingHours: e.fastingHours,
          sampleType: e.sampleType,
          turnaroundDays: e.turnaroundDays,
        }))
      );
    }

    case "list_all_exams_detailed": {
      const exams = await listAllExamsDetailed();
      return JSON.stringify(
        exams.map((e) => ({
          name: e.name,
          price: Number(e.price),
          preparation: e.preparation,
          fastingHours: e.fastingHours,
          sampleType: e.sampleType,
          turnaroundDays: e.turnaroundDays,
        }))
      );
    }

    case "update_exam": {
      const examName = String(input.examName ?? "");
      const before = await searchExams(examName);
      const updated = await updateExam(examName, {
        price: typeof input.price === "number" ? input.price : undefined,
        preparation: typeof input.preparation === "string" ? input.preparation : undefined,
        fastingHours: typeof input.fastingHours === "number" ? input.fastingHours : undefined,
        sampleType: typeof input.sampleType === "string" ? input.sampleType : undefined,
        turnaroundDays: typeof input.turnaroundDays === "number" ? input.turnaroundDays : undefined,
        aliases: Array.isArray(input.aliases) ? (input.aliases as string[]) : undefined,
      });
      if (!updated) {
        return `Exame "${examName}" nao encontrado. Use search_exams para localizar o nome exato, ou create_exam se for um exame novo.`;
      }
      return JSON.stringify({
        beforePrice: before[0] ? Number(before[0].price) : null,
        updated: {
          name: updated.name,
          price: Number(updated.price),
          preparation: updated.preparation,
          fastingHours: updated.fastingHours,
          sampleType: updated.sampleType,
          turnaroundDays: updated.turnaroundDays,
        },
      });
    }

    case "create_exam": {
      const exam = await createExam({
        name: String(input.name ?? ""),
        price: Number(input.price ?? 0),
        aliases: Array.isArray(input.aliases) ? (input.aliases as string[]) : undefined,
        preparation: typeof input.preparation === "string" ? input.preparation : undefined,
        fastingHours: typeof input.fastingHours === "number" ? input.fastingHours : undefined,
        sampleType: typeof input.sampleType === "string" ? input.sampleType : undefined,
        turnaroundDays: typeof input.turnaroundDays === "number" ? input.turnaroundDays : undefined,
      });
      return JSON.stringify({ created: { name: exam.name, price: Number(exam.price) } });
    }

    case "deactivate_exam": {
      const examName = String(input.examName ?? "");
      const deactivated = await deactivateExam(examName);
      if (!deactivated) return `Exame "${examName}" nao encontrado.`;
      return `Exame "${deactivated.name}" desativado — nao aparece mais para os clientes.`;
    }

    case "get_business_hours":
      return getBusinessHoursText();

    case "update_business_hours": {
      const dayOfWeek = Number(input.dayOfWeek ?? -1);
      const closed = Boolean(input.closed);
      const opensAt = typeof input.opensAt === "string" ? input.opensAt : "";
      const closesAt = typeof input.closesAt === "string" ? input.closesAt : "";
      if (dayOfWeek < 0 || dayOfWeek > 6) return "dayOfWeek invalido (use 0 a 6).";
      const updated = await upsertBusinessHours(dayOfWeek, opensAt, closesAt, closed);
      return JSON.stringify({
        dayOfWeek: updated.dayOfWeek,
        opensAt: updated.opensAt,
        closesAt: updated.closesAt,
        closed: updated.closed,
      });
    }

    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
