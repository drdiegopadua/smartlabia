import Anthropic from "@anthropic-ai/sdk";
import { searchExams, listAllExamNames } from "../services/exams.service";
import { createBudget, getBudgetForDelivery, markBudgetConverted, markBudgetAbandoned } from "../services/budgets.service";
import { scheduleAppointment, listUpcomingAppointments } from "../services/appointments.service";
import { getBusinessHoursText, getResultsUrl } from "../services/business.service";
import { generateBudgetPdf } from "../services/pdf.service";
import { formatBudgetText } from "../services/budgetText.service";
import { sendBudgetPdf } from "../whatsapp/client";

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
    name: "send_budget_pdf",
    description:
      "Envia o orcamento para o cliente no WhatsApp como um PDF formatado (layout oficial do laboratorio, com tabela de exames, total e descontos). Este e o formato PREFERIDO de entrega de orcamento — use sempre que criar um orcamento novo.",
    input_schema: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "ID do orcamento retornado por create_budget" },
      },
      required: ["budgetId"],
    },
  },
  {
    name: "send_budget_text",
    description:
      "Envia o orcamento para o cliente como mensagem de texto formatada (com emojis, lista de exames, valor total e as opcoes de desconto/parcelamento). Use isso APENAS se o cliente disser que nao conseguiu abrir o PDF ou pedir explicitamente o orcamento em texto — nunca como primeira opcao.",
    input_schema: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "ID do orcamento retornado por create_budget" },
      },
      required: ["budgetId"],
    },
  },
  {
    name: "schedule_appointment",
    description:
      "Agenda uma coleta/exame para o cliente em uma data e hora especificas. Se o agendamento for para realizar exames de um orcamento existente, SEMPRE passe o budgetId — isso marca automaticamente o orcamento como CONVERTIDO.",
    input_schema: {
      type: "object",
      properties: {
        scheduledAtIso: { type: "string", description: "Data e hora no formato ISO 8601" },
        notes: { type: "string", description: "Observacoes adicionais, ex: quais exames" },
        budgetId: {
          type: "string",
          description: "ID do orcamento que este agendamento esta concretizando, se houver um (retornado por create_budget)",
        },
      },
      required: ["scheduledAtIso"],
    },
  },
  {
    name: "list_upcoming_appointments",
    description: "Lista os agendamentos futuros do cliente atual.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mark_budget_abandoned",
    description:
      "Marca um orcamento como ABANDONADO imediatamente. Use quando o cliente recusar explicitamente (ex: 'nao quero', 'muito caro, vou procurar outro lugar', 'obrigado, mas nao vou fazer') — assim ele para de receber mensagens de follow-up automaticas sobre esse orcamento.",
    input_schema: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "ID do orcamento recusado pelo cliente" },
      },
      required: ["budgetId"],
    },
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

    case "send_budget_pdf": {
      const budgetId = String(input.budgetId ?? "");
      const budget = await getBudgetForDelivery(budgetId);
      if (!budget) return "Orcamento nao encontrado.";
      const paciente = budget.contact.name || "Cliente";
      const pdfBuffer = generateBudgetPdf({
        paciente,
        itens: budget.items.map((i) => ({ nome: i.exam.name, preco: Number(i.price) })),
        data: budget.createdAt,
      });
      await sendBudgetPdf(budget.contact.phone, pdfBuffer, "orcamento.pdf", "Segue seu orçamento em anexo 🧾");
      return "PDF do orcamento enviado com sucesso.";
    }

    case "send_budget_text": {
      const budgetId = String(input.budgetId ?? "");
      const budget = await getBudgetForDelivery(budgetId);
      if (!budget) return "Orcamento nao encontrado.";
      const paciente = budget.contact.name || "Cliente";
      const text = formatBudgetText({
        paciente,
        itens: budget.items.map((i) => ({ nome: i.exam.name, preco: Number(i.price) })),
        data: budget.createdAt,
      });
      return JSON.stringify({ messageToSend: text });
    }

    case "schedule_appointment": {
      const budgetId = input.budgetId ? String(input.budgetId) : undefined;
      const appointment = await scheduleAppointment({
        contactId: context.contactId,
        scheduledAt: new Date(String(input.scheduledAtIso)),
        notes: input.notes ? String(input.notes) : undefined,
        budgetId,
      });
      if (budgetId) {
        await markBudgetConverted(budgetId);
      }
      return JSON.stringify({ appointmentId: appointment.id, scheduledAt: appointment.scheduledAt });
    }

    case "list_upcoming_appointments": {
      const appointments = await listUpcomingAppointments(context.contactId);
      return JSON.stringify(
        appointments.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt, notes: a.notes }))
      );
    }

    case "mark_budget_abandoned": {
      const budgetId = String(input.budgetId ?? "");
      await markBudgetAbandoned(budgetId);
      return "Orcamento marcado como abandonado.";
    }

    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
