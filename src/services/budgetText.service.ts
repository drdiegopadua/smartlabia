import { env } from "../config/env";

interface BudgetTextItem {
  nome: string;
  preco: number;
}

interface BudgetTextInput {
  paciente: string;
  itens: BudgetTextItem[];
  data?: Date;
}

function formatarMoeda(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

export function formatBudgetText({ paciente, itens, data }: BudgetTextInput): string {
  const hoje = data ?? new Date();
  const dataStr = hoje.toLocaleDateString("pt-BR");
  const total = itens.reduce((s, e) => s + e.preco, 0);
  const totalPix = total * (1 - env.discounts.pixDebit);
  const totalCc = total * (1 - env.discounts.creditCard);
  const maxParc = env.discounts.maxInstallments;
  const valorMaxParc = totalCc / maxParc;
  const primeiroNome = paciente.trim().split(/\s+/)[0] || paciente;
  const pctPix = Math.round(env.discounts.pixDebit * 100);
  const pctCc = Math.round(env.discounts.creditCard * 100);

  const listaExames = itens.map((it, i) => `${i + 1}. ${it.nome}`).join("\n");

  return `🧾 Orçamento
👤 Paciente: ${paciente}
📅 ${dataStr}

Exames solicitados:

${listaExames}

💰 Valor total: ${formatarMoeda(total)}

Olá, ${primeiroNome}! É um prazer atender você! 😊 Aqui no ${env.lab.name}, pacientes que possuem convênio ou cartão fidelidade têm direito a descontos especiais. Você já possui algum convênio ou nosso cartão fidelidade?
Caso sim, os valores ficam assim:
📱 Pix, dinheiro ou débito (à vista) ${pctPix}% de desconto → ${formatarMoeda(totalPix)}
💳 Cartão de crédito ${pctCc}% de desconto → parcele em até ${maxParc}x de ${formatarMoeda(valorMaxParc)}
Se desejar saber mais sobre o nosso cartão fidelidade, é só perguntar, será um prazer explicar tudo!

E que tal já aproveitar para agendar sua coleta? 🗓️ Pacientes agendados têm mimos especiais:
✅ Atendimento sem fila 🛋️ Sala VIP com TV e ar-condicionado ☕ Café expresso 🍪 Biscoitinho Club Social

Estamos aqui para tornar sua experiência a mais confortável e agradável possível. Qualquer dúvida, pode perguntar à vontade! 💙`;
}
