import { prisma } from "../db/prisma";
import { BudgetSourceType } from "@prisma/client";

interface CreateBudgetInput {
  contactId: string;
  examNames: string[];
  sourceType: BudgetSourceType;
}

export async function createBudget({ contactId, examNames, sourceType }: CreateBudgetInput) {
  const exams = await prisma.exam.findMany({
    where: {
      active: true,
      OR: examNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
    },
  });

  const foundNames = new Set(exams.map((e) => e.name.toLowerCase()));
  const notFound = examNames.filter((name) => !foundNames.has(name.toLowerCase()));

  const totalPrice = exams.reduce((sum, e) => sum + Number(e.price), 0);

  const budget = await prisma.budget.create({
    data: {
      contactId,
      sourceType,
      totalPrice,
      items: {
        create: exams.map((exam) => ({ examId: exam.id, price: exam.price })),
      },
    },
    include: { items: { include: { exam: true } } },
  });

  return { budget, notFound };
}

export async function getBudgetForDelivery(budgetId: string) {
  return prisma.budget.findUnique({
    where: { id: budgetId },
    include: { contact: true, items: { include: { exam: true } } },
  });
}

export async function markBudgetConverted(budgetId: string) {
  return prisma.budget.update({ where: { id: budgetId }, data: { status: "CONVERTED" } });
}

export async function markBudgetAbandoned(budgetId: string) {
  return prisma.budget.update({ where: { id: budgetId }, data: { status: "ABANDONED" } });
}

export async function findStaleOpenBudgets(inactivityHours: number) {
  const threshold = new Date(Date.now() - inactivityHours * 60 * 60 * 1000);
  return prisma.budget.findMany({
    where: {
      status: "OPEN",
      updatedAt: { lt: threshold },
    },
    include: { contact: true, items: { include: { exam: true } }, followUps: true },
  });
}
