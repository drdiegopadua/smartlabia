import cron from "node-cron";
import { env } from "../config/env";
import { findStaleOpenBudgets } from "../services/budgets.service";
import { sendTextMessage } from "../whatsapp/client";
import { prisma } from "../db/prisma";

const MAX_ATTEMPTS = 3;

function buildFollowUpMessage(attempt: number, examNames: string[]): string {
  const examsText = examNames.join(", ");
  if (attempt === 1) {
    return `Oi! Vi que voce pediu um orcamento para ${examsText} e ainda nao fechamos o agendamento. Posso te ajudar a marcar um horario?`;
  }
  if (attempt === 2) {
    return `Passando para lembrar do seu orcamento de ${examsText}. Se preferir, posso verificar os horarios disponiveis agora mesmo.`;
  }
  return `Ainda temos seu orcamento de ${examsText} disponivel. Qualquer duvida sobre preco ou preparo, e so responder por aqui. Estamos a disposicao!`;
}

export async function runFollowUpSweep(): Promise<void> {
  const staleBudgets = await findStaleOpenBudgets(env.followUp.inactivityHours);

  for (const budget of staleBudgets) {
    const attempt = budget.followUps.length + 1;
    if (attempt > MAX_ATTEMPTS) {
      await prisma.budget.update({ where: { id: budget.id }, data: { status: "ABANDONED" } });
      continue;
    }

    const examNames = budget.items.map((i) => i.exam.name);
    const text = buildFollowUpMessage(attempt, examNames);

    try {
      await sendTextMessage(budget.contact.phone, text);
      await prisma.followUp.create({ data: { budgetId: budget.id, attempt } });
      // marca o budget como "tocado" para reiniciar a janela de inatividade
      await prisma.budget.update({ where: { id: budget.id }, data: { updatedAt: new Date() } });
    } catch (err) {
      console.error(`Falha ao enviar follow-up para budget ${budget.id}:`, err);
    }
  }
}

export function startFollowUpJob(): void {
  cron.schedule(env.followUp.cron, () => {
    runFollowUpSweep().catch((err) => console.error("Erro no job de follow-up:", err));
  });
  console.log(`Job de follow-up agendado com expressao cron "${env.followUp.cron}"`);
}
