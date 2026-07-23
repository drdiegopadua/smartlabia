import { prisma } from "../db/prisma";

export async function searchExams(query: string) {
  const normalized = query.trim().toLowerCase();
  const exams = await prisma.exam.findMany({ where: { active: true } });

  return exams.filter((exam) => {
    if (exam.name.toLowerCase().includes(normalized)) return true;
    return exam.aliases.some((alias) => alias.toLowerCase().includes(normalized));
  });
}

export async function getExamByExactName(name: string) {
  return prisma.exam.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, active: true },
  });
}

export async function listAllExamNames() {
  const exams = await prisma.exam.findMany({ where: { active: true }, select: { name: true } });
  return exams.map((e) => e.name);
}
