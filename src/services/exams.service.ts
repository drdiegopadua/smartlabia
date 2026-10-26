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

export async function listAllExamsDetailed() {
  return prisma.exam.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

interface UpdateExamInput {
  price?: number;
  preparation?: string;
  fastingHours?: number;
  sampleType?: string;
  turnaroundDays?: number;
  aliases?: string[];
}

export async function updateExam(examName: string, data: UpdateExamInput) {
  const exam = await getExamByExactName(examName);
  if (!exam) return null;
  return prisma.exam.update({ where: { id: exam.id }, data });
}

interface CreateExamInput {
  name: string;
  price: number;
  aliases?: string[];
  preparation?: string;
  fastingHours?: number;
  sampleType?: string;
  turnaroundDays?: number;
}

export async function createExam(input: CreateExamInput) {
  return prisma.exam.create({
    data: {
      name: input.name,
      price: input.price,
      aliases: input.aliases ?? [],
      preparation: input.preparation,
      fastingHours: input.fastingHours,
      sampleType: input.sampleType,
      turnaroundDays: input.turnaroundDays,
    },
  });
}

export async function deactivateExam(examName: string) {
  const exam = await getExamByExactName(examName);
  if (!exam) return null;
  return prisma.exam.update({ where: { id: exam.id }, data: { active: false } });
}
