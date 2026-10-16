// Busca de passagens (09/10) — tela própria, logo abaixo de Passagens no menu.
// Só admin e Compras (ProtectedRoute + as rotas do servidor). Casca da família
// Passagens: barra de contexto de 56px (título · resumo · abas · consumo),
// conteúdo até 1560px. Filtros, aba e período na URL.
// Etapa 2 (09/10): abas de análise (só admin — regra única em
// shared/regras-da-busca.ts): Previsão, Melhor momento, Preço por rota,
// Pago × encontrado e Orçamento.
// 16/10 (dono): os RESULTADOS são outra tela (/busca-de-passagens/resultados);
// daqui saem "Buscar preços", a Previsão e os atalhos antigos (?idaDe, ?remarcar).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Lock } from "lucide-react";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, isAdmin } from "@/lib/role-utils";
import { hojeISO } from "@shared/hoje-sp";
import { lerUrl, escreverUrl, type AbaDaBusca, type FiltrosDaBusca, type PeriodoDaAnalise } from "@/components/busca-de-passagens/filtros-da-busca";
import { AbasDaBusca, abasVisiveis } from "@/components/busca-de-passagens/abas-da-busca";
import { AbaBuscar } from "@/components/busca-de-passagens/aba-buscar";
import { AbaConsumo, ConsumoNaBarra, ConsumoNoRodape } from "@/components/busca-de-passagens/consumo";
import { useConsumoDaBusca } from "@/components/busca-de-passagens/use-busca-de-passagens";
import { AbaMelhorMomento } from "@/components/busca-de-passagens/analises/melhor-momento";
import { AbaPrecoPorRota } from "@/components/busca-de-passagens/analises/preco-por-rota";
import { AbaPagoXEncontrado } from "@/components/busca-de-passagens/analises/pago-x-encontrado";
import { AbaPrevisao } from "@/components/busca-de-passagens/analises/previsao";
import { AbaOrcamento } from "@/components/busca-de-passagens/analises/orcamento";
import { linkDosResultados } from "@/components/busca-de-passagens/resultados/estado-dos-resultados";

const RESUMO: Partial<Record<AbaDaBusca, string>> = {
  previsao: "Vai subir ou vai baixar",
  "melhor-momento": "Quando está mais barato",
  "preco-por-rota": "Cada rota ao longo do tempo",
  "pago-x-encontrado": "Pago contra o encontrado",
  orcamento: "Falta gastar e custos ocultos",
  consumo: "Consultas, cache e teto do mês",
};

export default function BuscaDePassagens() {
  usePageTitle("Busca de passagens");
  const { user } = useAuth();
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const inicial = useMemo(() => lerUrl(search), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [abaEscolhida, setAba] = useState<AbaDaBusca>(inicial.aba);
  const [filtros, setFiltros] = useState<FiltrosDaBusca>(inicial.filtros);
  const [periodo, setPeriodo] = useState<PeriodoDaAnalise>(inicial.periodo);
  /** Seleção que volta da tela de resultados (`?vagas=&aj=`): a Buscar abre com ela marcada. */
  const vagasPedidas = inicial.vagas;
  // Atalhos antigos (trecho direto, aviso de alteração) levam direto à tela de resultados.
  const atalhoDeResultados = !!(inicial.vagas.length && (inicial.idaDe || inicial.remarcar));
  useEffect(() => {
    if (atalhoDeResultados) setLocation(linkDosResultados({ vagas: inicial.vagas, idaDe: inicial.idaDe, remarcar: inicial.remarcar }), { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [resumo, setResumo] = useState("Carregando…");
  const abas = abasVisiveis(user);
  const aba = abas.includes(abaEscolhida) ? abaEscolhida : "buscar";
  const admin = isAdmin(user);
  const podeEntrar = hasPermission(user, "canAccessBuscaDePassagens");
  const consumo = useConsumoDaBusca(podeEntrar);

  // Filtros, aba e período na URL (replace). A seleção (`vagas`/`aj`) sai depois de lida.
  useEffect(() => {
    if (atalhoDeResultados) return;
    const qs = escreverUrl(aba, filtros, periodo);
    const atual = search.replace(/^\?/, "");
    if (qs !== atual) setLocation(`${location}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [aba, filtros, periodo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Voltar do navegador / link do menu: a URL manda.
  useEffect(() => {
    const u = lerUrl(search);
    if (u.vagas.length) return; // atalho recém-chegado: o estado inicial já o leu
    if (JSON.stringify(u.filtros) !== JSON.stringify(filtros)) setFiltros(u.filtros);
    if (u.aba !== abaEscolhida) setAba(u.aba);
    if (u.periodo !== periodo) setPeriodo(u.periodo);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const onResumo = useCallback((t: string) => setResumo(t), []);
  const irParaBuscar = useCallback(() => setAba("buscar"), []);
  // "Buscar preços" da Previsão: abre os resultados dessas escalações (a prévia não gasta; buscar o que falta é um clique com o custo).
  const buscarVagas = useCallback((ids: string[]) => {
    setLocation(linkDosResultados({ vagas: ids.slice(0, 80) }));
  }, [setLocation]);
  const subtitulo = aba === "buscar" ? resumo : RESUMO[aba] ?? "";

  const barra = (
    <PageHeader
      variant="bar"
      title="Busca de passagens"
      subtitle={<span data-testid="resumo-busca">{subtitulo}</span>}
      className="mx-0 mt-0"
      tabs={<AbasDaBusca abas={abas} aba={aba} onAba={setAba} />}
      actions={podeEntrar ? <ConsumoNaBarra consumo={consumo.data} mes={hojeISO().slice(0, 7)} /> : undefined}
    />
  );

  return (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pb-6 pt-5">
        <div className="mx-auto flex max-w-[1560px] flex-col gap-4">
          {atalhoDeResultados ? null : !podeEntrar ? (
            <div className="pas-entra flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="busca-sem-acesso">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><Lock className="h-5 w-5" /></span>
              <h2 className="m-0 text-base font-semibold text-foreground">Acesso negado</h2>
              <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">A busca de preços é de Compras e do administrador.</p>
            </div>
          ) : aba === "buscar" ? (
            <>
              <AbaBuscar
                user={user}
                filtros={filtros}
                onFiltros={setFiltros}
                vagasDaUrl={vagasPedidas}
                ajustesDaUrl={inicial.ajustes}
                abrirAcompanhamentos={inicial.acompanhando}
                onResumo={onResumo}
                onVerPrevisao={() => setAba("previsao")}
              />
              {admin && <ConsumoNoRodape consumo={consumo.data} mes={hojeISO().slice(0, 7)} />}
            </>
          ) : aba === "consumo" ? (
            <AbaConsumo />
          ) : aba === "previsao" ? (
            <AbaPrevisao onBuscarVagas={buscarVagas} onIrParaBuscar={irParaBuscar} />
          ) : aba === "melhor-momento" ? (
            <AbaMelhorMomento periodo={periodo} onPeriodo={setPeriodo} onIrParaBuscar={irParaBuscar} />
          ) : aba === "preco-por-rota" ? (
            <AbaPrecoPorRota periodo={periodo} onPeriodo={setPeriodo} onIrParaBuscar={irParaBuscar} />
          ) : aba === "pago-x-encontrado" ? (
            <AbaPagoXEncontrado periodo={periodo} onPeriodo={setPeriodo} onIrParaBuscar={irParaBuscar} />
          ) : (
            <AbaOrcamento periodo={periodo} onPeriodo={setPeriodo} onVerPrevisao={() => setAba("previsao")} />
          )}
        </div>
      </div>
    </div>
  );
}
