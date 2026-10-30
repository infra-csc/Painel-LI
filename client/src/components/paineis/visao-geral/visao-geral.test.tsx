/**
 * Visão geral dos Painéis (30/10): os blocos contam pela régua do Quadro de
 * prazos, cada linha leva à tela de trabalho já no evento, e os estados de
 * erro/vazio aparecem no lugar certo.
 */
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import type { TeamInclusion } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { renderComTudo } from "@/test/render";
import { mockarFetch, respostaJson, usuarioFake } from "@/test/fixtures";
import { criarQueryClientComApi } from "@/test/query-client-api";
import { eventoFake, hospedagemFake, passagemFake, vagaFake } from "@/test/fixtures-dominio";
import VisaoGeral from "./visao-geral";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daqui = (dias: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + dias); return d; };

// Night Run daqui a 20 dias: passagem (D-37) e hotel (D-30) já venceram.
// Meia SP daqui a 39 dias: passagem vence em 2 dias.
const NR = eventoFake({ id: "nr", name: "Night Run Porto Alegre — Edição de Primavera com Nome Bem Comprido", startDate: iso(daqui(18)), endDate: iso(daqui(20)), diaEventoInicio: iso(daqui(20)), diaEventoFim: iso(daqui(20)) });
const SP = eventoFake({ id: "sp", name: "Meia de São Paulo", startDate: iso(daqui(37)), endDate: iso(daqui(39)), diaEventoInicio: iso(daqui(39)), diaEventoFim: iso(daqui(39)) });

const vaga = (o: Partial<TeamInclusion>) => vagaFake({
  status: "escalado", phase: "inclusao", deletedAt: null, needsTicket: false, needsAccommodation: false, ...o,
} as Partial<TeamInclusion>);

function montar(opcoes: { vagas?: number; role?: string } = {}) {
  const semPassagemNemHotel = vaga({ id: "v1", eventId: "nr", collaboratorId: "c1", needsTicket: true, needsAccommodation: true, scheduleStartDate: iso(daqui(18)), scheduleEndDate: iso(daqui(20)) });
  const comTudo = vaga({ id: "v2", eventId: "nr", collaboratorId: "c2", needsTicket: true, needsAccommodation: true, scheduleStartDate: iso(daqui(18)), scheduleEndDate: iso(daqui(20)) });
  const venceLogo = vaga({ id: "v3", eventId: "sp", collaboratorId: "c3", needsTicket: true, scheduleStartDate: iso(daqui(37)), scheduleEndDate: iso(daqui(39)) });
  const semNome = vaga({ id: "v4", eventId: "nr", collaboratorId: null, status: "planejado", scheduleStartDate: iso(daqui(18)), scheduleEndDate: iso(daqui(20)) });
  const aValidar = vaga({ id: "v5", eventId: "sp", collaboratorId: null, phase: "sugestao", status: "sugestao_pendente", scheduleStartDate: iso(daqui(37)), scheduleEndDate: iso(daqui(39)) });
  const cincoDiasAtras = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const fetchMock = mockarFetch((url) => {
    const caminho = url.split("?")[0];
    if (url === "/api/team-inclusions") return opcoes.vagas ? respostaJson({ message: "Falhou" }, opcoes.vagas, url) : respostaJson([semPassagemNemHotel, comTudo, venceLogo, semNome], 200, url);
    if (url === "/api/team-inclusions?phase=sugestao") return respostaJson([aValidar], 200, url);
    if (caminho === "/api/events") return respostaJson([NR, SP], 200, url);
    if (caminho === "/api/functions") return respostaJson([], 200, url);
    if (caminho === "/api/tickets") return respostaJson([passagemFake({ teamInclusionId: "v2", purchaseDate: "2026-10-01" })], 200, url);
    if (caminho === "/api/accommodations") return respostaJson([hospedagemFake({ teamInclusionId: "v2", hotelName: "Hotel Centro" })], 200, url);
    if (caminho === "/api/escala/prazos") return respostaJson({ dias: DIAS_PADRAO }, 200, url);
    if (caminho === "/api/swap-requests") return respostaJson([], 200, url);
    if (caminho === "/api/scaling-change-requests") {
      return respostaJson([{ id: "p1", eventId: "nr", eventName: NR.name, requestType: "ajuste", createdAt: cincoDiasAtras, functionName: "Staff", inclusionNumber: 4821, requestedByName: "Paula" }], 200, url);
    }
    if (caminho === "/api/paineis/atividade") {
      return respostaJson({
        itens: [{
          id: "a1", at: new Date().toISOString(), tipo: "inclusao", titulo: "Colaborador incluído: JOANA RIBEIRO", detalhe: null, linhas: [], comentario: null,
          autor: "Pedro", destaque: true, eventId: "nr", eventName: NR.name, quantidade: 1, funcoes: ["Staff"], precisaPassagem: true, precisaHotel: false,
          pedidoId: null, eventStartDate: NR.startDate,
          vagas: [{ id: "v1", numero: 4821, funcao: "Staff", colaborador: "JOANA RIBEIRO", fase: "escalacao", status: "escalado", excluida: false, precisaPassagem: true, precisaHotel: true, pedidoPendenteId: null, trocaPendente: false }],
        }],
        proximo: null, total: 1, resumo: { inclusao: 1, mudanca: 0, passagem: 0, hotel: 0, pedido: 0 },
        desde: new Date(Date.now() - 86_400_000).toISOString(), geradoEm: new Date().toISOString(), cortado: false,
      }, 200, url);
    }
    return respostaJson([], 200, url);
  });
  renderComTudo(<VisaoGeral />, { user: usuarioFake({ role: opcoes.role ?? "admin" }), rota: "/paineis", queryClient: criarQueryClientComApi() });
  return { fetchMock };
}

describe("Visão geral — blocos pela régua do Quadro de prazos", () => {
  it("passagens: o evento atrasado primeiro, depois o que vence em até 3 dias; a linha leva a Passagens no evento", async () => {
    montar();
    const bloco = await screen.findByTestId("bloco-passagens");
    const nr = await within(bloco).findByTestId("bloco-passagens-evento-nr");
    expect(nr).toHaveAttribute("href", "/tickets?event=nr&status=pending");
    expect(nr).toHaveTextContent("1 a emitir");
    expect(nr).toHaveTextContent("17 dias de atraso");
    const sp = within(bloco).getByTestId("bloco-passagens-evento-sp");
    expect(sp).toHaveTextContent("vence em 2 dias");
    const linhas = within(bloco).getAllByRole("link").filter((a) => a.getAttribute("data-testid")?.startsWith("bloco-passagens-evento-"));
    expect(linhas.map((a) => a.getAttribute("data-testid"))).toEqual(["bloco-passagens-evento-nr", "bloco-passagens-evento-sp"]);
    expect(screen.getByTestId("numero-passagens")).toHaveTextContent("1");
  });

  it("hotel com reserva válida não conta; sem reserva conta e leva à Hospedagem no evento", async () => {
    montar();
    const linha = await screen.findByTestId("bloco-hoteis-evento-nr");
    expect(linha).toHaveTextContent("1 a reservar");
    expect(linha).toHaveAttribute("href", "/accommodations?event=nr");
  });

  it("escala sem nome → Escalação no evento, bloco Escalar; validação atrasada → Validação no evento", async () => {
    montar();
    expect(await screen.findByTestId("bloco-escala-evento-nr")).toHaveAttribute("href", "/scaling?eventId=nr&fila=escalar");
    expect(screen.getByTestId("bloco-aprovacao-evento-sp")).toHaveAttribute("href", "/scaling-validation?eventId=sp");
  });

  it("pedidos de ajuste: o mais antigo com os dias esperando, direto na Aprovação", async () => {
    montar();
    const pedido = await screen.findByTestId("pedido-p1");
    expect(pedido).toHaveAttribute("href", "/scaling-approval?eventId=nr&request=p1");
    expect(pedido).toHaveTextContent("há 5 dias");
    expect(screen.getByTestId("bloco-pedidos-total")).toHaveTextContent("1");
  });

  it("últimas inclusões: o item do feed e o link para a Atividade recente", async () => {
    montar();
    expect(await screen.findByText("Colaborador incluído: JOANA RIBEIRO")).toBeInTheDocument();
    expect(screen.getByTestId("bloco-novidades-total")).toHaveTextContent("1");
    expect(screen.getByTestId("link-atividade-recente")).toHaveAttribute("href", "/paineis/atividade");
  });

  it("falha na lista de vagas → estado de erro com Tentar novamente", async () => {
    montar({ vagas: 500 });
    expect(await screen.findByText("Não foi possível carregar as vagas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("403 na lista de vagas → sem acesso, sem números", async () => {
    montar({ vagas: 403 });
    expect(await screen.findByText("Sem acesso às vagas")).toBeInTheDocument();
    expect(screen.queryByTestId("numero-passagens")).toBeNull();
  });
});
