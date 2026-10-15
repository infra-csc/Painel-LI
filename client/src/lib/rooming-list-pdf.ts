/**
 * Desenha a rooming list (shared/rooming-list.ts) num PDF A4 retrato e baixa
 * o arquivo — 09/10, "PDF para o hotel" da aba Quartos do Espelho.
 *
 * Por que jsPDF no navegador (e não página de impressão): o arquivo sai com
 * nome certo, sem depender do diálogo de impressão de cada navegador, e o
 * mesmo layout em qualquer máquina. As bibliotecas só carregam no clique
 * (import dinâmico), então não pesam na abertura da tela.
 *
 * As fontes-padrão do PDF (Helvetica) só têm o alfabeto latino ocidental: a
 * seta "→" dos trechos vira "–" aqui (acentos, "ª" e "·" saem normalmente).
 */
import type { RoomingList } from "@shared/rooming-list";

type RGB = [number, number, number];
const COR = {
  texto: [15, 23, 42] as RGB,        // --foreground
  suave: [100, 116, 139] as RGB,     // --neutral / muted
  linha: [226, 232, 240] as RGB,     // --border
  linhaForte: [203, 213, 225] as RGB,
  fundo: [248, 250, 252] as RGB,     // --surface-muted
  cabecalho: [241, 245, 249] as RGB, // --neutral-soft
  marca: [0, 51, 204] as RGB,        // --primary #0033CC
};

/** Só caracteres que a Helvetica do PDF desenha. */
const pdfTexto = (s: string) => s.replace(/\s*→\s*/g, "–");
/** "12/11/2026 a 17/11/2026" → "12/11 a 17/11/2026" quando o ano é o mesmo (cabe na caixa do resumo). */
const periodoCurto = (s: string) => s.replace(/^(\d{2}\/\d{2})\/(\d{4}) a (\d{2}\/\d{2})\/\2$/, "$1 a $3/$2");

export async function gerarPdfDaRoomingList(r: RoomingList) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const util = W - 2 * M;
  doc.setProperties({ title: `Rooming list — ${r.hotel} — ${r.evento}`, subject: "Rooming list", creator: "Painel de Logística Interna" });

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  let y = M + 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COR.marca);
  doc.text("ROOMING LIST", M, y, { charSpace: 0.6 });
  y += 8;
  doc.setFontSize(19);
  doc.setTextColor(...COR.texto);
  const tituloHotel = doc.splitTextToSize(r.hotel, util) as string[];
  doc.text(tituloHotel, M, y);
  y += 7.5 * tituloHotel.length - 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COR.suave);
  doc.text([r.evento, r.cidade].filter(Boolean).join("  ·  "), M, y + 1.5);
  y += 7;

  // ── Resumo em quatro colunas ───────────────────────────────────────────
  const caixaY = y;
  const caixaH = 24;
  doc.setFillColor(...COR.fundo);
  doc.setDrawColor(...COR.linha);
  doc.setLineWidth(0.2);
  doc.roundedRect(M, caixaY, util, caixaH, 1.6, 1.6, "FD");
  const colW = util / 4;
  const resumo: { rotulo: string; valor: string; sub?: string; valorMenor?: boolean }[] = [
    { rotulo: "QUARTOS", valor: String(r.totalDeQuartos), sub: r.quartosPorTipo.map((t) => `${t.quantidade} ${t.tipo}`).join(" · ") },
    { rotulo: "HÓSPEDES", valor: String(r.totalDeHospedes) },
    { rotulo: "DIÁRIAS (ROOM-NIGHTS)", valor: String(r.totalDeDiarias), sub: r.diariasPorTipo.map((t) => `${t.tipo} ${t.quantidade}`).join(" · ") },
    { rotulo: "HOSPEDAGEM", valor: r.periodoDaHospedagem ? periodoCurto(r.periodoDaHospedagem) : "—", sub: r.periodoDoEvento ? `Evento: ${periodoCurto(r.periodoDoEvento)}` : undefined, valorMenor: true },
  ];
  resumo.forEach((c, i) => {
    const x = M + i * colW + 4.5;
    const largura = colW - 8;
    if (i > 0) { doc.setDrawColor(...COR.linha); doc.line(M + i * colW, caixaY + 4, M + i * colW, caixaY + caixaH - 4); }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...COR.suave);
    doc.text(c.rotulo, x, caixaY + 6, { charSpace: 0.3 });
    doc.setTextColor(...COR.texto);
    if (c.valorMenor) {
      doc.setFontSize(10.5);
      doc.text((doc.splitTextToSize(c.valor, largura) as string[]).slice(0, 1), x, caixaY + 12.6);
    } else {
      doc.setFontSize(15);
      doc.text(c.valor, x, caixaY + 13.2);
    }
    if (c.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor(...COR.suave);
      doc.text((doc.splitTextToSize(c.sub, largura) as string[]).slice(0, 2), x, caixaY + 18.6);
    }
  });
  y = caixaY + caixaH + 7;

  // ── Tabela: uma linha por hóspede; quarto, tipo e observação por quarto ──
  const comCpf = r.incluiCpf;
  const head = [["Quarto", "Tipo", "Hóspede", ...(comCpf ? ["CPF"] : []), "Check-in", "Check-out", "Observação"]];
  type Celula = { content: string; rowSpan?: number; styles?: Record<string, unknown> };
  const body: Celula[][] = [];
  const primeiraDoQuarto = new Set<number>();
  r.linhas.forEach((l) => {
    primeiraDoQuarto.add(body.length);
    l.hospedes.forEach((h, i) => {
      const linha: Celula[] = [];
      if (i === 0) {
        const span = l.hospedes.length;
        linha.push({ content: String(l.numero), rowSpan: span, styles: { fontStyle: "bold", fontSize: 10 } });
        linha.push({ content: pdfTexto(l.tipo).split("; ").join("\n"), rowSpan: span });
      }
      linha.push({ content: h.nome, styles: { fontStyle: "bold" } });
      if (comCpf) linha.push({ content: h.cpf ?? "—" });
      linha.push({ content: h.checkIn });
      linha.push({ content: h.checkOut });
      if (i === 0) linha.push({ content: l.observacao ?? "", rowSpan: l.hospedes.length, styles: { textColor: COR.suave } });
      body.push(linha);
    });
  });

  const rodape = () => {
    const yLinha = H - 13;
    doc.setDrawColor(...COR.linha);
    doc.setLineWidth(0.2);
    doc.line(M, yLinha, W - M, yLinha);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.setTextColor(...COR.suave);
    doc.text(`Gerado em ${r.geradoEm} (horário de Brasília)  ·  Contato da logística: ${r.contato}`, M, yLinha + 4.6, { maxWidth: util - 24 });
  };

  autoTable(doc, {
    head,
    body: body as never,
    startY: y,
    margin: { left: M, right: M, top: M, bottom: 20 },
    theme: "plain",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 8.6, textColor: COR.texto, cellPadding: { top: 2.4, bottom: 2.4, left: 2.2, right: 2.2 }, lineColor: COR.linha, lineWidth: { bottom: 0.15 }, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: COR.cabecalho, textColor: COR.suave, fontStyle: "bold", fontSize: 7.2, cellPadding: { top: 2.6, bottom: 2.6, left: 2.2, right: 2.2 }, lineWidth: 0 },
    columnStyles: comCpf
      ? { 0: { cellWidth: 14 }, 1: { cellWidth: 30 }, 3: { cellWidth: 27 }, 4: { cellWidth: 20 }, 5: { cellWidth: 20 }, 6: { cellWidth: 26 } }
      : { 0: { cellWidth: 15 }, 1: { cellWidth: 36 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 34 } },
    didParseCell: (d) => {
      // Um quarto começa com um fio mais forte: dá para ver onde cada um termina.
      if (d.section === "body" && primeiraDoQuarto.has(d.row.index) && d.row.index > 0) {
        d.cell.styles.lineWidth = { top: 0.35, bottom: 0.15 };
        d.cell.styles.lineColor = COR.linhaForte;
      }
    },
    didDrawPage: () => rodape(),
  });

  // Nota final curta: como ler o "Tipo" em trechos.
  const fimDaTabela = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  if (r.linhas.some((l) => l.tipo.includes(";")) && fimDaTabela + 12 < H - 20) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...COR.suave);
    doc.text("Quando os hóspedes de um quarto não chegam e saem juntos, o tipo aparece por trecho de noites (entrada–saída).", M, fimDaTabela + 7, { maxWidth: util });
  }

  // "Página N de T" depois de tudo desenhado (o total só se sabe no fim).
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.3);
    doc.setTextColor(...COR.suave);
    doc.text(`Página ${p} de ${total}`, W - M, H - 13 + 4.6, { align: "right" });
  }
  return doc;
}

/** Gera e baixa "Rooming list - <hotel> - <evento>.pdf". */
export async function baixarRoomingListPdf(r: RoomingList): Promise<void> {
  const doc = await gerarPdfDaRoomingList(r);
  doc.save(r.nomeDoArquivo);
}
