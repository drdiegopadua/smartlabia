import Anthropic from "@anthropic-ai/sdk";
import { searchExams, listAllExamNames } from "../services/exams.service";
import { createBudget } from "../services/budgets.service";
import { scheduleAppointment, listUpcomingAppointments } from "../services/appointments.service";
import { getBusinessHoursText, getResultsUrl } from "../services/business.service";

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_business_hours",
    description: "Retorna o horario de funcionamento do laboratorio.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_results_url",
    description: "Retorna o link do site onde o cliente pode consultar/baixar o resultado do exame.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_exams",
    description:
      "Busca exames disponiveis pelo nome ou termo relacionado (ex: 'glicemia', 'hemograma'). Retorna preco, preparo e tipo de amostra.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca do exame" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_all_exam_names",
    description: "Lista os nomes de todos os exames disponiveis no laboratorio.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_budget",
    description:
      "Cria um orcamento formal para o cliente com uma lista de exames (usar nomes exatos obtidos via search_exams). Use isso sempre que o cliente pedir um orcamento, seja por texto, imagem ou PDF de pedido medico.",
    input_schema: {
      type: "object",
      properties: {
        examNames: {
          type: "array",
          items: { type: "string" },
          description: "Nomes exatos dos exames, conforme retornado por search_exams",
        },
        sourceType: {
          type: "string",
          enum: ["TEXT", "IMAGE", "PDF"],
          description: "Como o pedido de exame chegou",
        },
      },
      required: ["examNames", "sourceType"],
    },
  },
  {
    name: "schedule_appointment",
    description: "Agenda uma coleta/exame para o cliente em uma data e hora especificas.",
    input_schema: {
      type: "object",
      properties: {
        scheduledAtIso: { type: "string", description: "Data e hora no formato ISO 8601" },
        notes: { type: "string", description: "Observacoes adicionais, ex: quais exames" },
      },
      required: ["scheduledAtIso"],
    },
  },
  {
    name: "list_upcoming_appointments",
    description: "Lista os agendamentos futuros do cliente atual.",
    input_schema: { type: "object", properties: {} },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: { contactId: string }
): Promise<string> {
  switch (name) {
    case "get_business_hours":
      return getBusinessHoursText();

    case "get_results_url":
      return getResultsUrl() || "Link de resultados ainda nao configurado.";

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

    case "list_all_exam_names": {
      const names = await listAllExamNames();
      return JSON.stringify(names);
    }

    case "create_budget": {
      const examNames = Array.isArray(input.examNames) ? (input.examNames as string[]) : [];
      const sourceType = (input.sourceType as "TEXT" | "IMAGE" | "PDF") ?? "TEXT";
      const { budget, notFound } = await createBudget({
        contactId: context.contactId,
        examNames,
        sourceType,
      });
      return JSON.stringify({
        budgetId: budget.id,
        totalPrice: Number(budget.totalPrice),
        items: budget.items.map((i) => ({ exam: i.exam.name, price: Number(i.price) })),
        notFound,
      });
    }

    case "schedule_appointment": {
      const appointment = await scheduleAppointment({
        contactId: context.contactId,
        scheduledAt: new Date(String(input.scheduledAtIso)),
        notes: input.notes ? String(input.notes) : undefined,
      });
      return JSON.stringify({ appointmentId: appointment.id, scheduledAt: appointment.scheduledAt });
    }

    case "list_upcoming_appointments": {
      const appointments = await listUpcomingAppointments(context.contactId);
      return JSON.stringify(
        appointments.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt, notes: a.notes }))
      );
    }

    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
