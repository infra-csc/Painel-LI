/**
 * Análises da Escalação: um recorte só (23/10).
 *
 * Caso real: busca "5272", "Futuros", filtro "Precisa de passagem" — o
 * contador do filtro dizia 0 e os cartões seguiam mostrando "Em validação 1",
 * porque a vaga em validação (#5171, ativação local, não precisa de passagem)
 * entrava nas Análises sem passar pela busca nem pelos filtros do painel.
 *
 * Aqui o hook de verdade (useScalingFilters + useScalingRecorte) alimenta o
 * componente de verdade, como na página.
 */
import { describe, it, expect, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { TeamInclusion } from "@shared/schema";
import { DIAS_PADRAO } from "@shared/prazos-da-escala";
import { renderComTudo } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { eventoFake, funcaoFake, vagaFake } from "@/test/fixtures-dominio";
import ScalingAnalytics from "./scaling-analytics";
import { PRAZOS_QUERY_KEY } from "./scaling-analytics-quadro";
import { contadoresDasFlags } from "./scaling-queue";
import type { ScalingData } from "./use-scaling-data";
import { useScalingFilters, type ScalingFiltersState } from "./scaling-page/use-scaling-filters";
import { useScalingRecorte } from "./scaling-page/use-scaling-recorte";

// O motivo de bloqueio para confirmar varre conflito de agenda com o `data`
// inteiro; aqui não importa — nada é confirmado.
vi.mock("./scaling-validation", () => ({ getBulkConfirmBlockReason: () => null }));

const EV = eventoFake({ id: "ev-cwb", name: "Circuito das Estações - Verão - Curitiba", startDate: "2027-01-16", endDate: "2027-01-17" });
const FN = funcaoFake({ id: "fn-ativ", name: "Ativação local" });
const datas = { eventId: EV.id, functionId: FN.id, scheduleStartDate: "2027-01-16", scheduleEndDate: "2027-01-17" };

/** A vaga que a busca "5272" acha: na escalação, com nome, sem passagem. */
const v5272 = vagaFake({ ...datas, id: "v5272", inclusionNumber: 5272, collaboratorId: "c1", needsTicket: false, needsAccommodation: false });
/** A #5171 do print: em validação, sem nome, não precisa de passagem. */
const sugestao = (over: Partial<TeamInclusion> = {}) => vagaFake({
  ...datas, id: "s5171", inclusionNumber: 5171, collaboratorId: null, phase: "sugestao", status: "sugestao_pendente",
  needsTicket: false, needsAccommodation: false, ...over,
});

function dadosFake(escalacao: TeamInclusion[]): ScalingData {
  const eventById = new Map([[EV.id, EV]]);
  const functionById = new Map([[FN.id, FN]]);
  return {
    teamInclusions: escalacao, filteredTeamInclusions: escalacao, scalingInclusions: escalacao, vagasDasOpcoesDeEvento: escalacao,
    eventById, functionById, collaboratorById: new Map(), userFunctionIds: new Set(), isAdminRole: true,
    pendingSwapByInclusion: new Map(), pendingChangeByInclusion: new Map(),
    purchasedTicketByInclusion: new Map(), accommodationByInclusion: new Map(), accommodations: [],
    isCenotecnicaFunction: () => false, getResponsavelDaFuncao: () => null,
    getEventName: (id: string | null) => (id && eventById.get(id)?.name) || "Evento não encontrado",
    getFunctionName: (id: string | null) => (id && functionById.get(id)?.name) || "Função não encontrada",
    getCollaboratorName: (id?: string | null) => (id ? "MARIA CLAUDIA" : "Não escalado"),
    getCollaboratorCity: () => null,
  } as unknown as ScalingData;
}

let filtros: ScalingFiltersState;

function Tela({ data }: { data: ScalingData }) {
  const f = useScalingFilters();
  filtros = f;
  const r = useScalingRecorte({ data, filtros: f, user: null });
  const contadores = contadoresDasFlags(r.linhasSemFlags, f.flags, r.queueContext);
  return (
    <>
      <span data-testid="contador-precisa">{contadores["pass:precisa"]}</span>
      <span data-testid="contagem">{r.contagem}</span>
      <ScalingAnalytics
        linhas={r.comFlags}
        sugestoes={r.sugestoesDoRecorte}
        ctx={r.analyticsContext}
        hoje={f.hoje}
        onVerVagasDoEvento={() => {}}
        onVerFuncao={() => {}}
        onAbrirLinha={() => {}}
        temRecorte={f.temRecorte}
        nomesDosFiltrosAtivos={r.nomesDosFiltrosDoRecorte}
        onLimparFiltros={f.limpaFiltros}
      />
    </>
  );
}

function montar({ escalacao = [v5272], sugestoes = [sugestao()] }: { escalacao?: TeamInclusion[]; sugestoes?: TeamInclusion[] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  queryClient.setQueryData(["/api/team-inclusions?phase=sugestao"], sugestoes);
  queryClient.setQueryData(PRAZOS_QUERY_KEY, { dias: DIAS_PADRAO });
  const r = renderComTudo(<Tela data={dadosFake(escalacao)} />, { user: usuarioFake({ role: "admin" }), rota: "/scaling", queryClient });
  act(() => filtros.setAba("analises"));
  return r;
}

/** O número grande de um cartão do topo. */
const kpi = (rotulo: string) => screen.getByText(rotulo, { selector: "p" }).nextElementSibling?.textContent;

describe("Análises — a vaga em validação respeita os filtros (23/10)", () => {
  it("sem filtro, a vaga em validação entra nas Análises (o caminho inteiro da vaga)", () => {
    montar();
    expect(kpi("Em validação")).toBe("1");
    expect(screen.getByTestId("quadro-validacao-ev-cwb")).toHaveTextContent("1a validar");
    expect(screen.getByTestId("contagem")).toHaveTextContent("2 vagas");
  });

  it('caso real: busca "5272" + "Precisa de passagem" → contador 0 e estado vazio, sem números de fora', async () => {
    const { user } = montar();
    act(() => { filtros.setBusca("5272"); filtros.setFlags({ "pass:precisa": true }); });

    expect(screen.getByTestId("contador-precisa")).toHaveTextContent("0");
    expect(screen.getByTestId("analises-vazio")).toHaveTextContent("Nenhuma vaga neste recorte");
    expect(screen.getByTestId("analises-vazio")).toHaveTextContent("busca “5272” · Precisa de passagem");
    expect(screen.queryByText("Em validação", { selector: "p" })).toBeNull();
    expect(screen.queryByTestId("quadro-validacao-ev-cwb")).toBeNull();
    expect(screen.queryByText(/esperando a área validar/)).toBeNull();
    expect(screen.getByTestId("contagem")).toHaveTextContent("0 de 2 vagas");

    await user.click(screen.getByTestId("button-limpar-filtros-analises"));
    expect(kpi("Em validação")).toBe("1");
  });

  it('"Precisa de passagem" sozinho: a sugestão sem passagem sai dos cartões e do quadro', () => {
    montar({ escalacao: [v5272, vagaFake({ ...datas, id: "v-pass", collaboratorId: "c2", needsTicket: true })] });
    act(() => filtros.setFlags({ "pass:precisa": true }));
    expect(screen.getByTestId("contador-precisa")).toHaveTextContent("1");
    expect(kpi("Em validação")).toBe("0");
    expect(kpi("Escalação completa")).toBe("0");
    expect(screen.getByText("0% de 1 vaga")).toBeInTheDocument();
    expect(screen.queryByText(/a validar/)).toBeNull();
  });

  it("a sugestão que PRECISA de passagem entra — e o contador do filtro diz o mesmo número", () => {
    montar({ escalacao: [v5272], sugestoes: [sugestao({ needsTicket: true })] });
    act(() => filtros.setFlags({ "pass:precisa": true }));
    expect(screen.getByTestId("contador-precisa")).toHaveTextContent("1");
    expect(kpi("Em validação")).toBe("1");
    expect(screen.getByTestId("quadro-validacao-ev-cwb")).toHaveTextContent("1a validar");
  });

  it('busca "5272" sem filtro: só a vaga 5272 — a #5171 não casa por nenhum campo', () => {
    montar();
    act(() => filtros.setBusca("5272"));
    expect(kpi("Em validação")).toBe("0");
    expect(kpi("Em escalação")).toBe("1");
    expect(screen.getByTestId("contagem")).toHaveTextContent("1 de 2 vagas");
  });

  it("busca sem resultado → estado vazio com o botão de limpar", () => {
    montar();
    act(() => filtros.setBusca("zzz-nada"));
    expect(screen.getByTestId("analises-vazio")).toHaveTextContent("Nenhuma vaga neste recorte");
    expect(screen.getByTestId("button-limpar-filtros-analises")).toBeInTheDocument();
  });

  it("filtros combinados cruzam: passagem E hotel", () => {
    montar({ escalacao: [], sugestoes: [sugestao({ needsTicket: true, needsAccommodation: false })] });
    act(() => filtros.setFlags({ "pass:precisa": true, "hosp:precisa": true }));
    expect(screen.getByTestId("analises-vazio")).toBeInTheDocument();
    act(() => filtros.setFlags({ "pass:precisa": true, "hosp:nao-precisa": true }));
    expect(kpi("Em validação")).toBe("1");
  });

  it("um filtro de situação tira as vagas em validação", () => {
    montar();
    act(() => filtros.setFlags({ "sit:salvo": true }));
    expect(kpi("Em validação")).toBe("0");
    expect(kpi("Em escalação")).toBe("1");
  });

  it("sem nenhuma vaga e sem filtro, o vazio não oferece limpar", () => {
    montar({ escalacao: [], sugestoes: [] });
    expect(screen.getByTestId("analises-vazio")).toHaveTextContent("Nenhuma vaga neste recorte");
    expect(screen.queryByTestId("button-limpar-filtros-analises")).toBeNull();
  });
});
