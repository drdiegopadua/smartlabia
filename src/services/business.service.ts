import { prisma } from "../db/prisma";
import { env } from "../config/env";

const DAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terca-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sabado",
];

export async function getBusinessHoursText(): Promise<string> {
  const hours = await prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } });
  if (hours.length === 0) {
    return "Horario de funcionamento ainda nao cadastrado.";
  }
  return hours
    .map((h) => {
      if (h.closed) return `${DAY_NAMES[h.dayOfWeek]}: fechado`;
      return `${DAY_NAMES[h.dayOfWeek]}: ${h.opensAt} as ${h.closesAt}`;
    })
    .join("\n");
}

export function getResultsUrl(): string {
  return env.lab.resultsUrl;
}

export async function upsertBusinessHours(dayOfWeek: number, opensAt: string, closesAt: string, closed: boolean) {
  const existing = await prisma.businessHours.findFirst({ where: { dayOfWeek } });
  if (existing) {
    return prisma.businessHours.update({ where: { id: existing.id }, data: { opensAt, closesAt, closed } });
  }
  return prisma.businessHours.create({ data: { dayOfWeek, opensAt, closesAt, closed } });
}
