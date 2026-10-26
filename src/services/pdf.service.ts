import { readFileSync, existsSync } from "fs";
import path from "path";
import { jsPDF } from "jspdf";
import { env } from "../config/env";

// Logo do laboratorio (PNG). Caminho configuravel por LOGO_PATH; padrao: assets/logo.png.
// Se o arquivo nao existir, o PDF usa as iniciais do laboratorio no lugar.
function loadLogo(): { dataUrl: string | null; ratio: number } {
  const file = process.env.LOGO_PATH ?? path.join(__dirname, "..", "..", "assets", "logo.png");
  if (!existsSync(file)) return { dataUrl: null, ratio: 1 };
  const buf = readFileSync(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { dataUrl: "data:image/png;base64," + buf.toString("base64"), ratio: height ? width / height : 1 };
}
const { dataUrl: LOGO_DATA_URL, ratio: LOGO_RATIO } = loadLogo();

interface BudgetPdfItem {
  nome: string;
  preco: number;
}

interface BudgetPdfInput {
  paciente: string;
  itens: BudgetPdfItem[];
  data?: Date;
}

function formatarMoeda(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

// Preenche um retangulo arredondado com um degrade horizontal entre duas cores.
// Usa clip() para respeitar os cantos arredondados; se o clip falhar, cai para cor solida.
function pdfGradiente(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  corA: [number, number, number],
  corB: [number, number, number],
  raio: number
) {
  try {
    doc.saveGraphicsState();
    doc.roundedRect(x, y, w, h, raio, raio, null as unknown as "S");
    doc.clip();
    doc.discardPath();
    const bandas = 48;
    const bw = w / bandas;
    for (let i = 0; i < bandas; i++) {
      const t = i / (bandas - 1);
      doc.setFillColor(
        Math.round(corA[0] + (corB[0] - corA[0]) * t),
        Math.round(corA[1] + (corB[1] - corA[1]) * t),
        Math.round(corA[2] + (corB[2] - corA[2]) * t)
      );
      doc.rect(x + i * bw - 0.4, y, bw + 0.8, h, "F");
    }
    doc.restoreGraphicsState();
  } catch {
    doc.setFillColor(corA[0], corA[1], corA[2]);
    doc.roundedRect(x, y, w, h, raio, raio, "F");
  }
}

// Selo circular com "check" vetorial.
function pdfSeloCheck(doc: jsPDF, cx: number, cy: number, r: number, cor: [number, number, number]) {
  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.circle(cx, cy, r, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.55);
  doc.lines(
    [
      [r * 0.35, r * 0.35],
      [r * 0.62, -r * 0.75],
    ],
    cx - r * 0.5,
    cy + r * 0.05,
    [1, 1],
    "S"
  );
}

export function generateBudgetPdf({ paciente, itens, data }: BudgetPdfInput): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const hoje = data ?? new Date();
  const dataStr = hoje.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const total = itens.reduce((s, e) => s + e.preco, 0);
  const totalPix = total * (1 - env.discounts.pixDebit);
  const totalCc = total * (1 - env.discounts.creditCard);

  const AZUL_ESCURO: [number, number, number] = [0, 89, 84];
  const AZUL_MEDIO: [number, number, number] = [93, 193, 185];
  const TEAL: [number, number, number] = [51, 139, 133];
  const TEAL_CLARO: [number, number, number] = [213, 255, 255];
  const TEXTO: [number, number, number] = [16, 22, 32];
  const MUTED: [number, number, number] = [100, 116, 139];
  const rodapeY = 289;

  const nExames = itens.length;
  const compacto = nExames > 8;
  const margin = compacto ? 14 : 16;

  const yTopo = compacto ? 8 : 10;
  const hCab = compacto ? 30 : 38;
  const gapA = compacto ? 5 : 8;
  const hPac = compacto ? 13 : 17;
  const gapB = compacto ? 4 : 8;
  const hTabHeader = compacto ? 7 : 8.5;
  const gapC = compacto ? 3 : 4;
  const hTotal = compacto ? 9 : 11.5;
  const gapD = compacto ? 4 : 6;
  const hPixRow = compacto ? 9 : 12;
  const parcRowH = compacto ? 4.4 : 5.4;
  const hDescontos = compacto
    ? 6 + 4 + (hPixRow + 3) + 5 + parcRowH * 5 + 7 + 6
    : 13 + 13 + 7 + 5.4 * 5 + 9;
  const gapE = compacto ? 4 : 6;
  const hBenef = compacto ? 22 : 30;
  const reservaRodape = compacto ? 10 : 12;

  // CABECALHO
  pdfGradiente(doc, margin, yTopo, W - margin * 2, hCab, AZUL_ESCURO, TEAL, compacto ? 5 : 6);

  const logoSize = compacto ? 22 : 28,
    logoPad = compacto ? 4 : 5;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + logoPad, yTopo + logoPad, logoSize, logoSize, logoSize * 0.18, logoSize * 0.18, "F");
  if (LOGO_DATA_URL) {
    // Encaixa o logo na caixa branca mantendo a proporcao original.
    const inner = logoSize - 4;
    const ratio = LOGO_RATIO;
    const w = ratio >= 1 ? inner : inner * ratio;
    const h = ratio >= 1 ? inner / ratio : inner;
    doc.addImage(
      LOGO_DATA_URL,
      "PNG",
      margin + logoPad + 2 + (inner - w) / 2,
      yTopo + logoPad + 2 + (inner - h) / 2,
      w,
      h
    );
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(compacto ? 12 : 16);
    doc.setTextColor(0, 89, 84);
    doc.text(
      env.lab.name.slice(0, 3).toUpperCase(),
      margin + logoPad + logoSize / 2,
      yTopo + logoPad + logoSize / 2 + 3,
      { align: "center" }
    );
  }

  const textX = margin + logoPad + logoSize + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 13 : 16);
  doc.setTextColor(255, 255, 255);
  doc.text(env.lab.name, textX, yTopo + (compacto ? 11 : 14));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(compacto ? 7.5 : 8.5);
  doc.setTextColor(220, 245, 245);
  doc.text(env.lab.tagline, textX, yTopo + (compacto ? 16.5 : 20.5));
  doc.setFontSize(compacto ? 7 : 8);
  const infoLinha = [env.lab.cityUf, env.lab.phone].filter(Boolean).join("  ·  ");
  if (infoLinha) doc.text(infoLinha, textX, yTopo + (compacto ? 22 : 25.5));

  // Selo "ORCAMENTO"
  const badgeW = compacto ? 32 : 38,
    badgeH = compacto ? 9 : 11;
  const badgeX = W - margin - badgeW - (compacto ? 4 : 5),
    badgeY = yTopo + (compacto ? 5 : 7);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeH / 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 7.5 : 9);
  doc.setTextColor(255, 255, 255);
  doc.text("ORÇAMENTO", badgeX + badgeW / 2, badgeY + badgeH / 2 + 2, { align: "center" });

  // CARD PACIENTE / DATA
  let y = yTopo + hCab + gapA;
  doc.setFillColor(248, 250, 251);
  doc.roundedRect(margin, y, W - margin * 2, hPac, 4, 4, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, y, W - margin * 2, hPac, 4, 4, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 6.5 : 7);
  doc.setTextColor(...MUTED);
  doc.text("PACIENTE", margin + 6, y + (compacto ? 5 : 6));
  doc.text("DATA", W - margin - 6, y + (compacto ? 5 : 6), { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 10 : 11.5);
  doc.setTextColor(...TEXTO);
  doc.text(paciente.toUpperCase(), margin + 6, y + (compacto ? 10 : 12.5));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(compacto ? 8 : 9);
  doc.setTextColor(55, 65, 81);
  doc.text(dataStr, W - margin - 6, y + (compacto ? 10 : 12.5), { align: "right" });
  y += hPac + gapB;

  // TABELA DE EXAMES
  doc.setFillColor(...AZUL_ESCURO);
  doc.roundedRect(margin, y, W - margin * 2, hTabHeader, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 7 : 8);
  doc.setTextColor(255, 255, 255);

  if (!compacto) {
    doc.text("#", margin + 4, y + 5.7);
    doc.text("EXAME", margin + 13, y + 5.7);
    doc.text("VALOR", W - margin - 3, y + 5.7, { align: "right" });
    y += hTabHeader;
    const restoAposTabelaNC = gapC + hTotal + gapD + hDescontos + gapE + hBenef + reservaRodape;
    const alturaDisponivelNC = rodapeY - y - restoAposTabelaNC;
    const exRowHeight = Math.min(9.5, Math.max(4.3, alturaDisponivelNC / nExames));
    const exFontSize = Math.max(5.5, Math.min(9, exRowHeight - 0.5));
    itens.forEach((ex, i) => {
      if (i % 2 !== 0) {
        doc.setFillColor(248, 250, 251);
        doc.rect(margin, y, W - margin * 2, exRowHeight, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(exFontSize);
      doc.setTextColor(55, 65, 81);
      doc.text(String(i + 1), margin + 4, y + exRowHeight / 2 + 1.3);
      const nomeTrunc = doc.splitTextToSize(ex.nome || "Exame", 122)[0];
      doc.text(nomeTrunc, margin + 13, y + exRowHeight / 2 + 1.3);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEAL);
      doc.text(formatarMoeda(ex.preco), W - margin - 3, y + exRowHeight / 2 + 1.3, { align: "right" });
      doc.setDrawColor(238, 242, 246);
      doc.setLineWidth(0.2);
      doc.line(margin, y + exRowHeight, W - margin, y + exRowHeight);
      y += exRowHeight;
    });
  } else {
    const colGap = 5;
    const colunas = nExames > 30 ? 3 : 2;
    const colW = (W - margin * 2 - (colunas - 1) * colGap) / colunas;
    for (let c = 0; c < colunas; c++) {
      const cx = margin + c * (colW + colGap);
      doc.text("EXAME", cx + 2, y + 4.8);
      doc.text("VALOR", cx + colW - 2, y + 4.8, { align: "right" });
    }
    y += hTabHeader;

    const restoAposTabela = gapC + hTotal + gapD + hDescontos + gapE + hBenef + reservaRodape;
    const linhasPorColuna = Math.ceil(nExames / colunas);
    const alturaDisponivel = rodapeY - y - restoAposTabela;
    const exRowHeight = Math.min(9, Math.max(4.3, alturaDisponivel / linhasPorColuna));
    const exFontSize = Math.max(5.5, Math.min(8.5, exRowHeight - 2));
    const yTabelaInicio = y;

    itens.forEach((ex, idx) => {
      const c = Math.floor(idx / linhasPorColuna);
      const r = idx % linhasPorColuna;
      const cx = margin + c * (colW + colGap);
      const ry = yTabelaInicio + r * exRowHeight;
      if (r % 2 !== 0) {
        doc.setFillColor(248, 250, 251);
        doc.rect(cx, ry, colW, exRowHeight, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(exFontSize);
      doc.setTextColor(55, 65, 81);
      const label = idx + 1 + ". " + (ex.nome || "Exame");
      const labelTrunc = doc.splitTextToSize(label, colW - 22)[0];
      doc.text(labelTrunc, cx + 2, ry + exRowHeight / 2 + exFontSize * 0.32);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEAL);
      doc.text(formatarMoeda(ex.preco), cx + colW - 2, ry + exRowHeight / 2 + exFontSize * 0.32, { align: "right" });
      doc.setDrawColor(238, 242, 246);
      doc.setLineWidth(0.15);
      doc.line(cx, ry + exRowHeight, cx + colW, ry + exRowHeight);
    });
    y = yTabelaInicio + linhasPorColuna * exRowHeight;
  }

  // TOTAL
  y += gapC;
  pdfGradiente(doc, margin, y, W - margin * 2, hTotal, AZUL_ESCURO, AZUL_MEDIO, 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 8.5 : 9.5);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL ESTIMADO (tabela particular)", margin + 5, y + hTotal / 2 + 1.5);
  doc.setFontSize(compacto ? 10.5 : 12);
  doc.text(formatarMoeda(total), W - margin - 4, y + hTotal / 2 + 1.7, { align: "right" });
  y += hTotal + gapD;

  // CAIXA DE DESCONTOS
  const maxParcelas = env.discounts.maxInstallments;
  const parcelas = Array.from({ length: maxParcelas }, (_, i) => ({ n: i + 1, valor: totalCc / (i + 1) }));
  doc.setFillColor(...TEAL_CLARO);
  doc.roundedRect(margin, y, W - margin * 2, hDescontos, 5, 5, "F");
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, W - margin * 2, hDescontos, 5, 5, "S");

  y += compacto ? 6 : 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 8.5 : 10);
  doc.setTextColor(...AZUL_ESCURO);
  doc.text(`Descontos Especiais ${env.lab.name}`, margin + 6, y);
  y += compacto ? 4 : 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(compacto ? 6.5 : 7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Pacientes com convênio ou Cartão Fidelidade têm direito a:`, margin + 6, y);

  // PIX
  y += compacto ? 5 : 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 5, y, W - margin * 2 - 10, hPixRow, 3.5, 3.5, "F");
  const pixBadgeW = compacto ? 15 : 17,
    pixBadgeH = compacto ? 5.5 : 6;
  doc.setFillColor(...AZUL_ESCURO);
  doc.roundedRect(margin + 8, y + (hPixRow - pixBadgeH) / 2, pixBadgeW, pixBadgeH, pixBadgeH / 2, pixBadgeH / 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 6.5 : 7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${Math.round(env.discounts.pixDebit * 100)}% OFF`, margin + 8 + pixBadgeW / 2, y + hPixRow / 2 + 1.3, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(compacto ? 7.5 : 8.5);
  doc.setTextColor(55, 65, 81);
  doc.text("Pix, dinheiro ou débito (à vista)", margin + 10 + pixBadgeW + 6, y + hPixRow / 2 + 1.3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 9 : 10.5);
  doc.setTextColor(...AZUL_ESCURO);
  doc.text(formatarMoeda(totalPix), W - margin - 8, y + hPixRow / 2 + 1.5, { align: "right" });
  y += hPixRow + (compacto ? 3 : 4);

  // CARTAO
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 7.5 : 8.5);
  doc.setTextColor(...AZUL_ESCURO);
  doc.text(
    `Cartão de crédito (${Math.round(env.discounts.creditCard * 100)}% OFF) — opções de parcelamento:`,
    margin + 6,
    y
  );
  y += compacto ? 5 : 6.5;

  const colW2 = (W - margin * 2 - 16) / 2;
  const col1x = margin + 8;
  const col2x = margin + 8 + colW2 + 6;
  const metade = Math.ceil(maxParcelas / 2);
  for (let i = 0; i < maxParcelas; i++) {
    const p = parcelas[i];
    const cx = i < metade ? col1x : col2x;
    const linha = i < metade ? i : i - metade;
    const ly = y + linha * parcRowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(compacto ? 7 : 8);
    doc.setTextColor(55, 65, 81);
    doc.text(p.n + "x de", cx, ly);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEAL);
    doc.text(formatarMoeda(p.valor), cx + colW2 - 2, ly, { align: "right" });
    if (linha < metade - 1) {
      doc.setDrawColor(210, 232, 232);
      doc.setLineWidth(0.2);
      doc.line(cx, ly + 1.8, cx + colW2 - 2, ly + 1.8);
    }
  }
  y += metade * parcRowH + (compacto ? 4 : 6);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(compacto ? 6.5 : 8);
  doc.setTextColor(...TEAL);
  doc.text("Cobrimos qualquer orçamento! Apresente uma proposta e faremos questão de superar.", W / 2, y, {
    align: "center",
  });

  // BENEFICIOS
  y += gapE;
  doc.setFillColor(...TEAL_CLARO);
  doc.roundedRect(margin, y, W - margin * 2, hBenef, 5, 5, "F");
  y += compacto ? 6 : 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(compacto ? 8 : 9);
  doc.setTextColor(...AZUL_ESCURO);
  doc.text("Agende e ganhe mimos especiais!", W / 2, y, { align: "center" });
  y += compacto ? 6.5 : 8;
  const selo = compacto ? 1.8 : 2.4,
    fonteBenef = compacto ? 7 : 8;
  const beneficios: [string, number][] = [
    ["Atendimento sem fila", margin + 12],
    ["Sala VIP com TV e ar-condicionado", W / 2 + 6],
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fonteBenef);
  doc.setTextColor(55, 65, 81);
  beneficios.forEach(([txt, tx]) => {
    pdfSeloCheck(doc, tx - 5, y - 1.3, selo, TEAL);
    doc.text(txt, tx, y);
  });
  y += compacto ? 6 : 7;
  const beneficios2: [string, number][] = [
    ["Café expresso", margin + 12],
    ["Biscoitinho Club Social", W / 2 + 6],
  ];
  beneficios2.forEach(([txt, tx]) => {
    pdfSeloCheck(doc, tx - 5, y - 1.3, selo, TEAL);
    doc.text(txt, tx, y);
  });

  // RODAPE
  doc.setDrawColor(220, 230, 235);
  doc.setLineWidth(0.3);
  doc.line(margin, rodapeY, W - margin, rodapeY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 160, 170);
  const rodapeInfo = [env.lab.name, env.lab.cityUf, env.lab.phone].filter(Boolean).join("  ·  ");
  doc.text(rodapeInfo, W / 2, rodapeY + 4, { align: "center" });
  doc.text("* Valores estimados da tabela particular. Sujeitos a confirmação. Convênios sob consulta.", W / 2, rodapeY + 8, {
    align: "center",
  });

  return Buffer.from(doc.output("arraybuffer"));
}
