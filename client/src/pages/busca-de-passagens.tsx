// Busca de passagens (09/10) — tela própria, logo abaixo de Passagens no menu.
// Só admin e Compras (ProtectedRoute + as rotas do servidor). Casca da família
// Passagens: barra de contexto de 56px (título · resumo · abas · consumo),
// conteúdo até 1560px. Filtros e aba na URL.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Lock } from "lucide-react";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, isAdmin } from "@/lib/role-utils";
import { hojeISO } from "@shared/hoje-sp";
import { lerUrl, escreverUrl, type AbaDaBusca, type FiltrosDaBusca } from "@/components/busca-de-passagens/filtros-da-busca";
import { AbasDaBusca, abasVisiveis, ROTULO_DA_ABA } from "@/components/busca-de-passagens/abas-da-busca";
import { AbaBuscar } from "@/components/busca-de-passagens/aba-buscar";
import { AbaConsumo, AbaEmConstrucao, ConsumoNaBarra, ConsumoNoRodape } from "@/components/busca-de-passagens/consumo";
import { useConsumoDaBusca } from "@/components/busca-de-passagens/use-busca-de-passagens";

const ANALISES: Partial<Record<AbaDaBusca, { titulo: string; pergunta: string; resumo: string }>> = {
  "preco-por-rota": { titulo: "Preço por rota", pergunta: "Menor preço visto por rota e data, a companhia mais barata de cada rota e como o menor preço muda entre as consultas.", resumo: "Quanto custa cada rota ao longo do tempo" },
  "pago-x-encontrado": { titulo: "Pago × encontrado", pergunta: "Para as passagens registradas pelo “Usar este voo”: o valor pago contra o menor preço encontrado na mesma rota e data — por evento, companhia e quem registrou.", resumo: "Quanto se pagou contra o que se achou" },
  "melhor-momento": { titulo: "Melhor momento", pergunta: "Quando comprar fica mais barato (antecedência), em que dia da semana e horário voar — pelo que foi pesquisado e pelo que foi pago.", resumo: "Quando está mais barato e mais caro" },
};

export default function BuscaDePassagens() {
  usePageTitle("Busca de passagens");
  const { user } = useAuth();
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const inicial = useMemo(() => lerUrl(typeof window !== "undefined" ? window.location.search : search), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [abaEscolhida, setAba] = useState<AbaDaBusca>(inicial.aba);
  const [filtros, setFiltros] = useState<FiltrosDaBusca>(inicial.filtros);
  const [resumo, setResumo] = useState("Carregando…");
  const abas = abasVisiveis(user);
  const aba = abas.includes(abaEscolhida) ? abaEscolhida : "buscar";
  const admin = isAdmin(user);
  const podeEntrar = hasPermission(user, "canAccessBuscaDePassagens");
  const consumo = useConsumoDaBusca(podeEntrar);

  // Filtros e aba na URL (replace). Os atalhos `vagas`/`idaDe` saem depois de lidos.
  useEffect(() => {
    const qs = escreverUrl(aba, filtros);
    const atual = (typeof window !== "undefined" ? window.location.search : "").replace(/^\?/, "");
    if (qs !== atual) setLocation(`${location}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [aba, filtros]); // eslint-disable-line react-hooks/exhaustive-deps
  // Voltar do navegador / link do menu: a URL manda.
  useEffect(() => {
    const u = lerUrl(search);
    if (u.vagas.length) return; // atalho recém-chegado: o estado inicial já o leu
    if (JSON.stringify(u.filtros) !== JSON.stringify(filtros)) setFiltros(u.filtros);
    if (u.aba !== abaEscolhida) setAba(u.aba);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const onResumo = useCallback((t: string) => setResumo(t), []);
  const subtitulo = aba === "buscar" ? resumo : aba === "consumo" ? "Consultas ao fornecedor, cache e teto do mês" : ANALISES[aba]?.resumo ?? "";

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
          {!podeEntrar ? (
            <div className="pas-entra flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="busca-sem-acesso">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><Lock className="h-5 w-5" /></span>
              <h2 className="m-0 text-base font-semibold text-foreground">Acesso negado</h2>
              <p className="m-0 mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">A busca de preços é de Compras e do administrador.</p>
            </div>
          ) : aba === "buscar" ? (
            <>
              <AbaBuscar user={user} filtros={filtros} onFiltros={setFiltros} vagasDaUrl={inicial.vagas} idaDeDaUrl={inicial.idaDe} onResumo={onResumo} />
              {admin && <ConsumoNoRodape consumo={consumo.data} mes={hojeISO().slice(0, 7)} />}
            </>
          ) : aba === "consumo" ? (
            <AbaConsumo />
          ) : (
            <AbaEmConstrucao titulo={ANALISES[aba]?.titulo ?? ROTULO_DA_ABA[aba].rotulo} pergunta={ANALISES[aba]?.pergunta ?? ""} />
          )}
        </div>
      </div>
    </div>
  );
}
