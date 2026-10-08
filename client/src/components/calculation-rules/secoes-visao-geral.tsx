/**
 * Visão geral das Regras de cálculo (redesenho 08/10): a ordem em que o
 * Planejado monta o valor de uma vaga e a matriz "quem recebe o quê". Cada
 * afirmação aqui espelha `shared/budget-engine.ts` (calcularPlanejadoDaVaga).
 */
import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Secao, Tabela, fmt, Nota } from "./rgc-ui";
import type { RegrasVigentes } from "./regras-vigentes";

const pct = (f: number) => `${Math.round(f * 100)}%`;

export function SecaoComoFunciona({ r, onIr }: { r: RegrasVigentes; onIr: (id: string) => void }) {
  const passos: { n: number; titulo: string; texto: ReactNode; alvo: string }[] = [
    { n: 1, titulo: "Diária", texto: "O valor do dia, pelo regime e pela função.", alvo: "diaria-casa" },
    { n: 2, titulo: "Dias com diária", texto: "Casa (CLT): só sábado e domingo. Demais: todos os dias do período.", alvo: "quem-recebe" },
    { n: 3, titulo: "Deflação", texto: <>Dia a dia: {pct(r.factors.ate4)}, {pct(r.factors.d5a8)} e {pct(r.factors.d9mais)} da diária.</>, alvo: "deflacao" },
    { n: 4, titulo: "Mobilidade", texto: "Por trecho de ida e de volta, pelo horário do voo.", alvo: "mobilidade" },
    { n: 5, titulo: "Alimentação", texto: "Por refeição, pelos horários da passagem.", alvo: "alimentacao" },
  ];
  return (
    <Secao
      id="como-funciona"
      grupo="Visão geral"
      titulo="Como o cálculo funciona"
      lede={<>O Planejado monta o valor de cada vaga nesta ordem. Os números desta página são os <strong className="font-semibold text-foreground">vigentes</strong>: vêm dos Valores Padrão, os mesmos que o cálculo usa agora.</>}
    >
      <ol className="rgc-passos m-0 p-0 list-none" data-testid="rgc-passos">
        {passos.map(p => (
          <li key={p.n}>
            <a
              href={`#${p.alvo}`}
              onClick={e => { e.preventDefault(); onIr(p.alvo); }}
              className="rgc-passo-item"
            >
              <span className="rgc-passo-n" aria-hidden="true">{p.n}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{p.titulo}</span>
                <span className="block mt-0.5 text-xs leading-5 text-muted-foreground">{p.texto}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      <div className="rgc-formula" aria-label="Total da vaga = diárias com deflação + mobilidade + alimentação">
        <span className="rgc-formula-termo rgc-formula-total">Total da vaga</span>
        <span className="rgc-formula-op" aria-hidden="true">=</span>
        <span className="rgc-formula-termo">diárias <span className="text-muted-foreground font-normal">(já com deflação)</span></span>
        <span className="rgc-formula-op" aria-hidden="true">+</span>
        <span className="rgc-formula-termo">mobilidade</span>
        <span className="rgc-formula-op" aria-hidden="true">+</span>
        <span className="rgc-formula-termo">alimentação</span>
      </div>
      {r.algumAlterado && (
        <Nota tom="aviso">
          <span data-testid="rgc-legenda-alterado">Há valores alterados nos Valores Padrão: aparecem <strong className="font-semibold">em âmbar</strong>, com o padrão do slide riscado embaixo.</span>
        </Nota>
      )}
      <Nota>
        Um ajuste digitado na vaga, no Planejado, vale no lugar da regra daquela parcela. Pacotes fechados (empreita e percurseiro) seguem regras próprias — veja em <a href="#empreita" onClick={e => { e.preventDefault(); onIr("empreita"); }} className="font-medium text-foreground underline underline-offset-2 hover:text-primary">Pacotes fechados</a>.
      </Nota>
    </Secao>
  );
}

type Marca = "sim" | "nao" | "parcial";
function Celula({ marca, children }: { marca: Marca; children: ReactNode }) {
  // "Não se aplica": só o traço, sem marca — o ícone repetido virava ruído.
  if (children === "—") return <span className="text-muted-foreground" aria-label="Não se aplica">—</span>;
  return (
    <span className="rgc-marca">
      <span className={cn("rgc-marca-icone", marca === "sim" && "bg-success-soft text-success", marca === "nao" && "bg-muted text-muted-foreground", marca === "parcial" && "bg-warning-soft text-warning")} aria-hidden="true">
        {marca === "nao" ? <Minus className="w-3 h-3" /> : <Check className="w-3 h-3" />}
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export function SecaoQuemRecebe({ r }: { r: RegrasVigentes }) {
  const util = fmt(r.almocoCasaUtil.demais);
  const utilCeno = fmt(r.almocoCasaUtil.ceno);
  const linhas = [
    {
      chave: "casa",
      celulas: [
        <span key="r"><span className="block">Time da Casa</span><span className="block text-2xs font-normal text-muted-foreground">colaborador CLT</span></span>,
        <Celula key="d" marca="sim">Tabela da casa, por função</Celula>,
        <Celula key="c" marca="parcial">Só sábado e domingo</Celula>,
        <Celula key="f" marca="sim">Sim</Celula>,
        <Celula key="a" marca="sim">Sim · almoço de dia útil {util}</Celula>,
        <Celula key="m" marca="sim">Sim, por trecho</Celula>,
      ],
    },
    {
      chave: "casa-ceno",
      celulas: [
        <span key="r"><span className="block">Cenotécnica da casa</span><span className="block text-2xs font-normal text-muted-foreground">CLT · Sup Ceno é produtor</span></span>,
        <Celula key="d" marca="nao">Não recebe diária</Celula>,
        <Celula key="c" marca="nao">—</Celula>,
        <Celula key="f" marca="nao">—</Celula>,
        <Celula key="a" marca="sim">Cenotécnica · almoço de dia útil {utilCeno}</Celula>,
        <Celula key="m" marca="sim">Sim, por trecho</Celula>,
      ],
    },
    {
      chave: "local",
      celulas: [
        <span key="r"><span className="block">Produção local</span><span className="block text-2xs font-normal text-muted-foreground">tipo “local” no cadastro</span></span>,
        <Celula key="d" marca="sim">Tabela da casa, por função</Celula>,
        <Celula key="c" marca="sim">Todos os dias</Celula>,
        <Celula key="f" marca="sim">Sim</Celula>,
        <Celula key="a" marca="sim">Sim</Celula>,
        <Celula key="m" marca="sim">Sim, por trecho</Celula>,
      ],
    },
    {
      chave: "freela",
      celulas: [
        <span key="r">Time Freela</span>,
        <Celula key="d" marca="sim">Local, em viagem ou Dir. de Prova</Celula>,
        <Celula key="c" marca="sim">Todos os dias</Celula>,
        <Celula key="f" marca="sim">Sim</Celula>,
        <Celula key="a" marca="nao">Não — o cachê cobre</Celula>,
        <Celula key="m" marca="sim">Sim, por trecho</Celula>,
      ],
    },
    {
      chave: "empreita",
      celulas: [
        <span key="r"><span className="block">Cenotécnico empreita</span><span className="block text-2xs font-normal text-muted-foreground">cenotécnica que não é da casa</span></span>,
        <Celula key="d" marca="parcial">Valor fechado por nº de dias</Celula>,
        <Celula key="c" marca="sim">Dias trabalhados</Celula>,
        <Celula key="f" marca="nao">Não</Celula>,
        <Celula key="a" marca="parcial">Pela regra do tipo (freela não recebe)</Celula>,
        <Celula key="m" marca="sim">Sim, por trecho</Celula>,
      ],
    },
    {
      chave: "percurseiro",
      celulas: [
        <span key="r"><span className="block">Percurseiro</span><span className="block text-2xs font-normal text-muted-foreground">função de percurso (motoqueiro)</span></span>,
        <Celula key="d" marca="parcial">Pacote fixo por tipo</Celula>,
        <Celula key="c" marca="parcial">2 em viagem · 1 sem passagem</Celula>,
        <Celula key="f" marca="nao">Não</Celula>,
        <Celula key="a" marca="nao">Dentro do pacote</Celula>,
        <Celula key="m" marca="nao">Dentro do pacote</Celula>,
      ],
    },
    {
      chave: "funcao-local",
      celulas: [
        <span key="r"><span className="block">Função “local”</span><span className="block text-2xs font-normal text-muted-foreground">“local” no nome da função</span></span>,
        <Celula key="d" marca="sim">Normal, pela regra do regime</Celula>,
        <Celula key="c" marca="sim">Pela regra do regime</Celula>,
        <Celula key="f" marca="sim">Sim</Celula>,
        <Celula key="a" marca="nao">Não — só diária</Celula>,
        <Celula key="m" marca="nao">Não — só diária</Celula>,
      ],
    },
  ];
  return (
    <Secao
      id="quem-recebe"
      grupo="Visão geral"
      titulo="Quem recebe o quê"
      lede="O que entra no valor de cada vaga, conforme o tipo do colaborador e o nome da função."
    >
      <Tabela
        legenda="O que cada regime recebe"
        cartao="largo"
        testid="rgc-matriz"
        colunas={[
          { rotulo: "Regime", largura: "19%" },
          { rotulo: "Diária", largura: "18%" },
          { rotulo: "Dias com diária", largura: "16%" },
          { rotulo: "Deflação", largura: "11%" },
          { rotulo: "Alimentação", largura: "19%" },
          { rotulo: "Mobilidade", largura: "17%" },
        ]}
        linhas={linhas}
      />
      <Nota>
        <strong className="font-semibold text-foreground">Atendimento:</strong> com o tipo escolhido na Escalação (Key Account ou Executivo de Contas), a diária é a do tipo, em qualquer regime — e Key Account também usa a refeição de gestão.
      </Nota>
    </Secao>
  );
}
