import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.businessHours.deleteMany();
  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, opensAt: "", closesAt: "", closed: true },
      { dayOfWeek: 1, opensAt: "07:00", closesAt: "18:00" },
      { dayOfWeek: 2, opensAt: "07:00", closesAt: "18:00" },
      { dayOfWeek: 3, opensAt: "07:00", closesAt: "18:00" },
      { dayOfWeek: 4, opensAt: "07:00", closesAt: "18:00" },
      { dayOfWeek: 5, opensAt: "07:00", closesAt: "18:00" },
      { dayOfWeek: 6, opensAt: "07:00", closesAt: "12:00" },
    ],
  });

  const exams = [
    {
      name: "Hemograma completo",
      aliases: ["hemograma", "exame de sangue geral"],
      price: 35.0,
      preparation: "Nao e necessario jejum.",
      fastingHours: 0,
      sampleType: "Sangue",
      turnaroundDays: 1,
    },
    {
      name: "Glicemia em jejum",
      aliases: ["glicemia", "acucar no sangue", "glicose"],
      price: 20.0,
      preparation: "Jejum de 8 horas.",
      fastingHours: 8,
      sampleType: "Sangue",
      turnaroundDays: 1,
    },
    {
      name: "Colesterol total e fracoes",
      aliases: ["colesterol", "perfil lipidico"],
      price: 40.0,
      preparation: "Jejum de 12 horas.",
      fastingHours: 12,
      sampleType: "Sangue",
      turnaroundDays: 1,
    },
    {
      name: "TSH",
      aliases: ["tireoide", "hormonio tireoidiano"],
      price: 45.0,
      preparation: "Nao e necessario jejum.",
      fastingHours: 0,
      sampleType: "Sangue",
      turnaroundDays: 2,
    },
    {
      name: "Exame de urina tipo 1",
      aliases: ["urina", "eas"],
      price: 25.0,
      preparation: "Coletar a primeira urina da manha, em frasco esteril.",
      fastingHours: 0,
      sampleType: "Urina",
      turnaroundDays: 1,
    },
  ];

  for (const exam of exams) {
    await prisma.exam.upsert({
      where: { name: exam.name },
      update: exam,
      create: exam,
    });
  }

  console.log("Seed concluido.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
