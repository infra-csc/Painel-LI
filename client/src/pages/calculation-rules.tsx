/**
 * REGRAS DE CÁLCULO — referência de como o Planejado calcula cada vaga.
 *
 * Redesenho 08/10: a página deixa de ser quatro abas de cartões e vira uma
 * documentação — barra de contexto de 56px (a casca do Financeiro), índice
 * lateral grudado que acende a seção em leitura (faixa de atalhos quando falta
 * largura), visão geral com a ordem do cálculo e a matriz "quem recebe o quê",
 * tabelas limpas com o valor alterado nos Valores Padrão marcado, a
 * calculadora de deflação com a régua dos dias e exemplos numéricos feitos com
 * as mesmas funções do motor. Dados (inalterados): GET /api/system-settings;
 * regras: `@shared/*`. Apresentação: components/calculation-rules/**.
 */
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { useRegrasVigentes, type SystemSettings } from "@/components/calculation-rules/regras-vigentes";
import { IndiceEmFaixa, IndiceLateral, SECOES, useSecaoAtiva } from "@/components/calculation-rules/indice";
import { SecaoComoFunciona, SecaoQuemRecebe } from "@/components/calculation-rules/secoes-visao-geral";
import { SecaoDeflacao, SecaoDiariaCasa, SecaoDiariaFreela } from "@/components/calculation-rules/secoes-diarias";
import { SecaoAlimentacao, SecaoDiasAdicionais, SecaoMobilidade } from "@/components/calculation-rules/secoes-ajudas";
import { SecaoEmpreita, SecaoPercurseiro } from "@/components/calculation-rules/secoes-pacotes";
import { ErroDasRegras, EsqueletoDasRegras } from "@/components/calculation-rules/estados";

const IDS = SECOES.map(s => s.id);

export default function CalculationRulesPage() {
  usePageTitle("Regras de cálculo");

  // Valores vigentes: mesmos settings que o motor de cálculo usa (Valores Padrão)
  const qSettings = useQuery<SystemSettings>({ queryKey: ["/api/system-settings"] });
  const settings = qSettings.data;
  const r = useRegrasVigentes(settings);

  // Erro antes de carregando (23/09): um refetch depois da falha não pode
  // esconder o aviso; e sem os valores nada de tabela com a constante 2026.
  const pronto = !qSettings.isError && !qSettings.isLoading && !!settings;
  const [atual, irPara] = useSecaoAtiva(IDS, pronto);

  // Link com âncora (#empreita…) abre direto na seção, quando ela existe.
  useEffect(() => {
    if (!pronto) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !IDS.includes(id)) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [pronto]);

  const lidoAs = qSettings.dataUpdatedAt
    ? new Date(qSettings.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const barra = (
    <PageHeader
      variant="bar"
      title="Regras de cálculo"
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      // Curto de propósito: a barra fica numa linha até no tablet (a faixa de
      // atalhos gruda logo abaixo dela, a 56px).
      subtitle="como o Planejado calcula cada vaga"
      actions={(
        // No celular cada seção já traz o selo "Editável nos Valores Padrão"
        // (link): o botão de linha inteira só empurrava o documento para baixo.
        <Button asChild variant="outline" className="pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5 max-sm:hidden" data-testid="rgc-valores-padrao">
          <Link href="/system-settings">
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />Valores Padrão
          </Link>
        </Button>
      )}
    />
  );

  let conteudo: ReactNode;
  if (qSettings.isError) {
    conteudo = <ErroDasRegras error={qSettings.error} onRetry={() => qSettings.refetch()} tentando={qSettings.isFetching} />;
  } else if (!pronto) {
    conteudo = <EsqueletoDasRegras />;
  } else {
    conteudo = (
      <div className="rgc-casca pas-entra">
        <aside className="rgc-lateral">
          <IndiceLateral
            atual={atual}
            onIr={irPara}
            rodape={lidoAs ? (
              <p className="rgc-indice-rodape m-0">
                <span className="block">Valores lidos às {lidoAs}</span>
                <Link href="/system-settings" className="inline-block mt-1 font-medium text-foreground underline underline-offset-2 hover:text-primary">Editar nos Valores Padrão</Link>
              </p>
            ) : undefined}
          />
        </aside>
        <div className="min-w-0">
          <IndiceEmFaixa atual={atual} onIr={irPara} />
          <article className="rgc-documento" aria-label="Regras de cálculo" data-testid="rgc-documento">
            <SecaoComoFunciona r={r} onIr={irPara} />
            <SecaoQuemRecebe r={r} />
            <SecaoDiariaCasa r={r} />
            <SecaoDiariaFreela r={r} />
            <SecaoDeflacao r={r} />
            <SecaoAlimentacao r={r} />
            <SecaoMobilidade />
            <SecaoDiasAdicionais />
            <SecaoEmpreita r={r} settings={settings} />
            <SecaoPercurseiro r={r} />
          </article>
        </div>
      </div>
    );
  }

  return (
    // Margens pela variável do layout: a barra sangra até as bordas da página
    // e o conteúdo fica centralizado — a casca do Financeiro.
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pt-5 pb-10">
        <div className="rgc-pagina max-w-[1240px] mx-auto">{conteudo}</div>
      </div>
    </div>
  );
}
