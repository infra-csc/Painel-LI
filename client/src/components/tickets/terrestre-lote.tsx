// "Carro / van" no painel Aplicar em lote (16/10).
//
// Caso do print do dono: várias vagas do mesmo evento vão na mesma van. O
// valor pode ser o de CADA vaga ou o TOTAL da van, dividido entre as vagas
// marcadas (os centavos que sobram vão para as primeiras) — guardar o total
// em cada vaga somaria a van oito vezes.
import { useState } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import {
  FORMULARIO_TERRESTRE_VAZIO,
  NOME_DO_MODO,
  itensDoFormulario,
  pernasDaVaga,
  reaisDoTerrestre,
  type CampoDoFormulario,
  type FormularioTerrestre,
  type ItemTerrestre,
  type PernaDaViagem,
} from "@shared/transporte-terrestre";
import type { TeamInclusion } from "@shared/schema";
import CamposDoTerrestre from "./campos-do-terrestre";
import { useTerrestreMutations } from "./use-transporte-terrestre";

/** O formulário de UMA perna, no formato que `itensDoFormulario` lê. */
function formDaPerna(f: FormularioTerrestre, p: PernaDaViagem): FormularioTerrestre {
  if (p === "ida") return { ...f, ida: true, volta: false };
  if (f.ida && !f.voltaIgual) return { ...f, ida: false, volta: true, modo: f.modoVolta, empresa: f.empresaVolta, valor: f.valorVolta };
  return { ...f, ida: false, volta: true };
}

/**
 * Itens do lote: cada perna só nas vagas que a têm ("só ida" não ganha
 * volta), e o "dividir" reparte entre as vagas que recebem aquela perna.
 */
export function itensDoLote(f: FormularioTerrestre, vagas: readonly TeamInclusion[]): { itens: ItemTerrestre[]; semPerna: TeamInclusion[] } {
  const itens: ItemTerrestre[] = [];
  for (const p of ["ida", "volta"] as const) {
    if (!(p === "ida" ? f.ida : f.volta)) continue;
    const ids = vagas.filter((v) => pernasDaVaga(v).includes(p)).map((v) => v.id);
    if (ids.length === 0) continue;
    const r = itensDoFormulario(formDaPerna(f, p), ids);
    if (r.ok) itens.push(...r.itens);
  }
  const comItem = new Set(itens.map((i) => i.teamInclusionId));
  return { itens, semPerna: vagas.filter((v) => !comItem.has(v.id)) };
}

export default function TerrestreLote({ vagas, nomeDaVaga, canEdit, onConcluido }: {
  /** Vagas marcadas na lista (pendentes, não canceladas, evento aberto). */
  vagas: TeamInclusion[];
  nomeDaVaga: (v: TeamInclusion) => string;
  canEdit: boolean;
  /** Ids das vagas gravadas — a página tira da seleção. */
  onConcluido: (ids: string[]) => void;
}) {
  const { toast } = useToast();
  const { registrar } = useTerrestreMutations();
  const [form, setForm] = useState<FormularioTerrestre>({ ...FORMULARIO_TERRESTRE_VAZIO });
  const [erros, setErros] = useState<Partial<Record<CampoDoFormulario, string>>>({});
  const [confirmar, setConfirmar] = useState<{ itens: ItemTerrestre[]; semPerna: TeamInclusion[] } | null>(null);
  const n = vagas.length;

  const aplicar = () => {
    if (n === 0) return;
    const r = itensDoFormulario(form, vagas.map((v) => v.id));
    if (!r.ok) { setErros(r.erros); return; }
    setErros({});
    setConfirmar(itensDoLote(form, vagas));
  };

  const executar = async () => {
    const plano = confirmar;
    setConfirmar(null);
    if (!plano || plano.itens.length === 0) return;
    const gravadas: string[] = [];
    const falhas: string[] = [];
    // 400 itens por pedido (200 vagas × ida e volta) — o limite da rota.
    for (let i = 0; i < plano.itens.length; i += 400) {
      const fatia = plano.itens.slice(i, i + 400);
      try {
        const res = await registrar.mutateAsync(fatia);
        const falharam = new Set(res.falhas.map((f) => f.teamInclusionId));
        for (const id of Array.from(new Set(fatia.map((x) => x.teamInclusionId)))) if (!falharam.has(id)) gravadas.push(id);
        falhas.push(...res.falhas.map((f) => `#${f.numero ?? "?"}: ${f.mensagem}`));
      } catch (erro) {
        const corpo = (erro as { body?: { falhas?: { numero: number | null; mensagem: string }[] } } | null)?.body;
        if (corpo?.falhas?.length) falhas.push(...corpo.falhas.map((f) => `#${f.numero ?? "?"}: ${f.mensagem}`));
        else falhas.push(apiErrorMessage(erro, "Não foi possível registrar o lote."));
      }
    }
    for (const v of plano.semPerna) falhas.push(`#${v.inclusionNumber ?? "?"}: a vaga não tem o trecho marcado`);
    if (gravadas.length > 0) {
      onConcluido(Array.from(new Set(gravadas)));
      toast({ variant: "success", title: `Transporte terrestre registrado em ${new Set(gravadas).size} ${new Set(gravadas).size === 1 ? "vaga" : "vagas"}`, description: "Elas saíram da fila Comprar." });
      setForm({ ...FORMULARIO_TERRESTRE_VAZIO });
    }
    if (falhas.length > 0) {
      toast({
        variant: "destructive",
        title: `${falhas.length} ${falhas.length === 1 ? "vaga não registrada" : "vagas não registradas"}`,
        description: <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">{falhas.map((f, i) => <li key={i}>{f}</li>)}</ul>,
      });
    }
  };

  // Resumo do que será gravado (para a confirmação).
  const resumo = (() => {
    if (!confirmar) return null;
    const porVaga = new Map<string, number>();
    for (const i of confirmar.itens) porVaga.set(i.teamInclusionId, (porVaga.get(i.teamInclusionId) ?? 0) + i.valorCentavos);
    const total = confirmar.itens.reduce((s, i) => s + i.valorCentavos, 0);
    const pernas = Array.from(new Set(confirmar.itens.map((i) => i.trecho)));
    const modos = Array.from(new Set(confirmar.itens.map((i) => `${NOME_DO_MODO[i.modo]}${i.empresa ? ` · ${i.empresa}` : ""}`)));
    const valores = Array.from(new Set(porVaga.values()));
    return {
      linhas: [
        ["Trechos", pernas.length === 2 ? "Ida e volta" : pernas[0] === "ida" ? "Só a ida" : "Só a volta"],
        ["Transporte", modos.join(" / ")],
        ["Por vaga", valores.length === 1 ? reaisDoTerrestre(valores[0]) : `${reaisDoTerrestre(Math.min(...valores))} a ${reaisDoTerrestre(Math.max(...valores))}`],
        ["Total", reaisDoTerrestre(total)],
      ] as Array<[string, string]>,
      nomes: vagas.filter((v) => porVaga.has(v.id)).map(nomeDaVaga),
    };
  })();

  return (
    <>
      <div className="p-4 grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <CamposDoTerrestre
          valor={form}
          onChange={(patch) => {
            setForm((f) => ({ ...f, ...patch }));
            setErros((e) => {
              const resto = { ...e };
              for (const k of Object.keys(patch)) delete resto[(k === "ida" || k === "volta" ? "pernas" : k) as CampoDoFormulario];
              return resto;
            });
          }}
          erros={erros}
          pernas={["ida", "volta"]}
          nVagas={n}
          idBase="lote-terrestre"
          disabled={!canEdit}
        />
        {/* No celular a explicação sai: o botão de registrar fica perto dos campos. */}
        <aside className="hidden sm:block rounded-xl border border-border bg-surface-muted/60 p-3 text-xs leading-relaxed text-slate-700 self-start space-y-2">
          <p className="m-0 font-semibold text-foreground">Como fica</p>
          <p className="m-0">Cada vaga marcada ganha o transporte nos trechos escolhidos e sai da fila <span className="font-medium">Comprar</span>. Vaga “só ida” recebe só a ida.</p>
          <p className="m-0">Van de R$ 1.200 que leva 8 pessoas: digite 1.200,00 e escolha <span className="font-medium">“o total, dividido”</span> — cada vaga fica com R$ 150,00.</p>
          <p className="m-0 text-muted-foreground">Não entra no Planejado nem no Realizado. Dá para editar ou desfazer na linha da vaga.</p>
        </aside>
      </div>

      <div className="border-t border-border px-4 py-2.5 bg-surface-muted flex flex-wrap items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium tabular-nums ${n > 0 ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground"}`}>
          <Users className="h-4 w-4" aria-hidden="true" />
          <span><span className="font-semibold">{n}</span> {n === 1 ? "vaga marcada" : "vagas marcadas"}</span>
        </span>
        {canEdit && (
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" className="h-[34px] rounded-lg text-xs text-muted-foreground" onClick={() => { setForm({ ...FORMULARIO_TERRESTRE_VAZIO }); setErros({}); }} data-testid="lote-terrestre-limpar">
              Limpar
            </Button>
            <Button
              onClick={aplicar} disabled={n === 0 || registrar.isPending}
              className="h-[34px] px-4 font-semibold rounded-lg text-xs gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground disabled:bg-border disabled:text-muted-foreground disabled:opacity-100"
              data-testid="lote-terrestre-aplicar"
            >
              {registrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {registrar.isPending ? "Registrando…" : n === 0 ? "Marque vagas na lista" : `Registrar em ${n} ${n === 1 ? "vaga" : "vagas"}`}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-base font-semibold text-foreground">
              Registrar transporte terrestre em {resumo?.nomes.length ?? 0} {(resumo?.nomes.length ?? 0) === 1 ? "vaga" : "vagas"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Elas saem da fila Comprar. Confira antes de confirmar.</AlertDialogDescription>
          </AlertDialogHeader>
          {resumo && (
            <div className="space-y-3">
              <dl className="m-0 rounded-xl border border-border divide-y divide-border text-xs overflow-hidden">
                {resumo.linhas.map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 px-3 py-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="m-0 font-semibold text-foreground break-words tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {confirmar && confirmar.semPerna.length > 0 && (
                <p className="m-0 text-xs text-warning-strong">
                  {confirmar.semPerna.length} {confirmar.semPerna.length === 1 ? "vaga não tem" : "vagas não têm"} o trecho marcado e {confirmar.semPerna.length === 1 ? "fica" : "ficam"} de fora.
                </p>
              )}
              <ul className="m-0 p-0 list-none max-h-32 overflow-y-auto rounded-xl border border-border px-3 py-2 text-xs text-slate-700 space-y-0.5">
                {resumo.nomes.map((nm, i) => <li key={i}>{nm}</li>)}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={executar} className="bg-primary hover:bg-primary-hover text-primary-foreground" data-testid="lote-terrestre-confirmar">
              Confirmar e registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
