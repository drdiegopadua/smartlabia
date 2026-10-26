import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ExameJson {
  codigo: string;
  nome: string;
  preco: number;
  busca?: string;
}

// Apelidos extras (como o cliente costuma chamar) para os exames mais comuns, por codigo.
const APELIDOS_EXTRAS: Record<string, string[]> = {
  HG: ["hemograma", "exame de sangue geral"],
  EAS: ["urina", "exame de urina", "eas", "urina tipo 1"],
  GLI: ["glicemia", "glicose", "acucar no sangue"],
  COL: ["colesterol"],
  TSH: ["tireoide"],
  EPF: ["fezes", "exame de fezes", "parasitologico"],
  VITD: ["vitamina d"],
  HGS: ["hemoglobina glicada", "glicada"],
};

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

  const raw = readFileSync(path.join(__dirname, "data", "exames.json"), "utf8").replace(/^﻿/, "");
  const exames: ExameJson[] = JSON.parse(raw);

  const usados = new Set<string>();
  let criados = 0;

  for (const e of exames) {
    let name = e.nome.trim();
    // O nome do exame e unico no banco: repetidos recebem o codigo no final.
    if (usados.has(name.toLowerCase())) name = `${name} (${e.codigo})`;
    usados.add(name.toLowerCase());

    const aliases = [e.codigo, ...(APELIDOS_EXTRAS[e.codigo] ?? [])];
    const data = { aliases, price: e.preco };

    await prisma.exam.upsert({
      where: { name },
      update: data,
      create: { name, ...data },
    });
    criados++;
  }

  console.log(`Seed concluido: ${criados} exames carregados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
