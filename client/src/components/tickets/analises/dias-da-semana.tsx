/**
 * "Que dia fica mais caro, mais barato?" (pergunta do dono, 07/10).
 *
 * Preço médio das passagens pelo dia da semana da IDA ou da VOLTA. O valor
 * registrado é o da passagem inteira — o rodapé diz isso, para ninguém ler
 * "sexta é cara" como "o trecho de sexta é caro".
 */
import type { DiaDaSemana } from "@shared/analise-de-passagens";
import type { TrechoDoDia } from "./url-da-analise";
import { largura, moeda, plural } from "./formato";
import { LegendaDeDestaque, LinhaDeBarra, Painel, Segmentado } from "./partes";

/** "na segunda", "no sábado", "no domingo". */
const comArtigo = (rotulo: string) => {
  const r = rotulo.toLowerCase();
  return r === "sábado" || r === "domingo" ? `no ${r}` : `na ${r}`;
};

function Resposta({ dias, trecho, minimo }: { dias: DiaDaSemana[]; trecho: "ida" | "volta"; minimo: number }) {
  const caro = dias.find((d) => d.destaque === "caro");
  const barato = dias.find((d) => d.destaque === "barato");
  if (!caro || !barato || caro.media === null || barato.media === null) {
    return (
      <p className="m-0 text-muted-foreground">
        Ainda não dá para apontar o dia mais caro: é preciso ter ao menos {minimo} passagens com valor em dois dias diferentes.
      </p>
    );
  }
  return (
    <p className="m-0">
      Com {trecho} <strong className="font-semibold text-danger">{comArtigo(caro.rotulo)}</strong>, a passagem saiu em média por{" "}
      <strong className="font-semibold tabular-nums text-foreground">{moeda(caro.media)}</strong>;{" "}
      <strong className="font-semibold text-success">{comArtigo(barato.rotulo)}</strong>, por{" "}
      <strong className="font-semibold tabular-nums text-foreground">{moeda(barato.media)}</strong>.{" "}
      <span className="text-muted-foreground">
        Diferença de {moeda(caro.media - barato.media)} por passagem
        {/* Menos de 3%: o "mais caro" existe na conta, mas não muda decisão. */}
        {(caro.media - barato.media) / barato.media < 0.03 ? " — na prática, empatados." : "."}
      </span>
    </p>
  );
}

export function DiasDaSemana({ ida, volta, minimo, trecho, onTrecho }: {
  ida: DiaDaSemana[]; volta: DiaDaSemana[]; minimo: number; trecho: TrechoDoDia; onTrecho: (t: TrechoDoDia) => void;
}) {
  const dias = trecho === "ida" ? ida : volta;
  const maior = Math.max(0, ...dias.map((d) => d.media ?? 0));
  const temFraco = dias.some((d) => d.passagens > 0 && !d.comparavel);
  return (
    <Painel
      testid="analise-dias"
      titulo="Preço médio por dia da semana"
      pergunta={`Em que dia de ${trecho} a passagem fica mais cara e mais barata`}
      acao={<Segmentado rotulo="Dia da ida ou da volta" valor={trecho} onChange={onTrecho} opcoes={[["ida", "Ida"], ["volta", "Volta"]] as const} testid="dias-trecho" />}
      resposta={<Resposta dias={dias} trecho={trecho} minimo={minimo} />}
      rodape={
        <>
          O valor registrado é o da passagem inteira (ida e volta juntas): aqui comparamos passagens pelo dia da {trecho}, não cada trecho.
          Mais caro e mais barato só entre dias com {minimo} ou mais passagens com valor.
        </>
      }
    >
      <ul className="m-0 list-none p-0" aria-label={`Preço médio por dia da ${trecho}`}>
        {dias.map((d) => (
          <LinhaDeBarra
            key={d.dia}
            testid={`dia-${trecho}-${d.curto}`}
            rotulo={d.rotulo}
            rotuloCurto={d.curto}
            pct={largura(d.media, maior)}
            valor={d.media === null ? "—" : moeda(d.media)}
            quantidade={plural(d.comValor, "passagem", "passagens")}
            destaque={d.destaque}
            comparavel={d.comparavel}
            title={!d.comparavel && d.passagens > 0 ? `Só ${plural(d.comValor, "passagem", "passagens")} com valor — fica fora da comparação` : undefined}
          />
        ))}
      </ul>
      <LegendaDeDestaque minimo={minimo} mostrarFraco={temFraco} />
    </Painel>
  );
}
