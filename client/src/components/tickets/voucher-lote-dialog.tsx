/**
 * Registrar passagens a partir dos vouchers em PDF, em lote (pedido do dono,
 * 28/08). O comprador joga os arquivos aqui, o servidor lê cada um, a tela
 * casa com a vaga pelo nome do passageiro e ele CONFERE antes de gravar.
 *
 * Duas travas de propósito:
 * - nada é gravado sem o clique em "Registrar"; a leitura é sugestão;
 * - arquivo que o sistema não entende (ou é voucher de hotel) aparece na lista
 *   como não aproveitável, com o motivo, em vez de sumir em silêncio.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileUp, Loader2, CheckCircle2, AlertTriangle, X, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { fixEncoding } from "@/lib/utils";
import type { TicketFormValues } from "@/lib/ticket-form";
import type { TeamInclusion } from "@shared/schema";
import { casarVaga } from "./voucher-match";
import { juntarIdaEVolta, type IdaEVoltaJuntas } from "./juntar-trechos";
import VagaCombobox, { type VagaOpcao } from "./vaga-combobox";

interface LeituraDoServidor {
  arquivo: string;
  tipo: "passagem" | "hospedagem" | "desconhecido";
  formato?: string;
  campos: Record<string, string>;
  pessoa?: string;
  /** Voucher de grupo: o mesmo arquivo é o bilhete de várias pessoas. */
  pessoas?: string[];
  /** O voucher traz um trecho só (ida OU volta). */
  trechoUnico?: boolean;
  avisos: string[];
}

/** Uma linha da conferência: o que foi lido + em qual vaga vai entrar. */
interface Linha extends LeituraDoServidor {
  inclusionId: string | null;
  resultado?: "ok" | "erro";
  mensagem?: string;
}

export default function VoucherLoteDialog({
  open, onOpenChange, inclusions, getCollaboratorName, getEventName, onRegistrar, registrando, getPassagemAtual,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Vagas que ainda podem receber passagem. */
  inclusions: TeamInclusion[];
  getCollaboratorName: (id?: string | null) => string;
  getEventName: (id: string) => string;
  /** Grava uma vaga; devolve erro em texto se falhar. */
  onRegistrar: (inclusion: TeamInclusion, form: TicketFormValues) => Promise<void>;
  registrando: boolean;
  /** Passagem já gravada da vaga, no formato do formulário — para completar ida/volta. */
  getPassagemAtual?: (inclusionId: string) => Record<string, any> | null;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [gravando, setGravando] = useState(false);

  const vagas = useMemo<VagaOpcao[]>(
    () => inclusions.map((i) => ({
      id: i.id,
      nome: fixEncoding(getCollaboratorName(i.collaboratorId)) || "",
      numero: String(i.inclusionNumber ?? "—"),
      evento: getEventName(i.eventId),
      destino: i.city ?? undefined,
    })),
    [inclusions, getCollaboratorName, getEventName],
  );
  const vagaById = useMemo(() => new Map(inclusions.map((i) => [i.id, i])), [inclusions]);

  const ler = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const fd = new FormData();
      arquivos.forEach((a) => fd.append("files", a));
      const r = await fetch("/api/vouchers/ler", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Não foi possível ler os arquivos.");
      return (await r.json()) as { leituras: LeituraDoServidor[] };
    },
    onSuccess: ({ leituras }) => {
      setLinhas((atuais) => [
        ...atuais,
        // Um voucher de grupo é o bilhete de várias pessoas: vira uma linha por
        // passageiro, com os mesmos dados de voo e cada uma na sua vaga. Sem
        // isso, só o primeiro nome do arquivo seria registrado.
        ...leituras.flatMap((l): Linha[] => {
          if (l.tipo !== "passagem") return [{ ...l, inclusionId: null }];
          const nomes = l.pessoas?.length ? l.pessoas : l.pessoa ? [l.pessoa] : [];
          if (nomes.length <= 1) {
            return [{ ...l, inclusionId: casarVaga(l.pessoa, vagas) }];
          }
          return nomes.map((n) => ({ ...l, pessoa: n, inclusionId: casarVaga(n, vagas) }));
        }),
      ]);
    },
    onError: (e: unknown) =>
      toast({ title: "Erro ao ler os vouchers", description: apiErrorMessage(e, "Não foi possível ler os arquivos. Tente de novo."), variant: "destructive" }),
  });

  const escolher = (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    ler.mutate(Array.from(arquivos));
    if (inputRef.current) inputRef.current.value = "";
  };

  const prontas = linhas.filter((l) => l.tipo === "passagem" && l.inclusionId && l.resultado !== "ok");
  // Duas linhas apontando para a mesma vaga quase sempre é engano: a segunda
  // sobrescreveria a passagem da primeira. A lista marca, o operador decide.
  const idsJaUsados = useMemo(
    () => new Set(linhas.map((l) => l.inclusionId).filter((id): id is string => !!id)),
    [linhas],
  );

  /** Quantas linhas de passagem apontam para cada vaga — 2+ com trecho único viram ida e volta. */
  const vezesNaVaga = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) if (l.tipo === "passagem" && l.inclusionId) m.set(l.inclusionId, (m.get(l.inclusionId) ?? 0) + 1);
    return m;
  }, [linhas]);

  /**
   * Grava por VAGA, não por arquivo (15/09): dois vouchers da mesma pessoa —
   * ida num, volta no outro — antes gravavam um por cima do outro. Agora os
   * trechos se juntam, os valores somam e sai UMA passagem. A vaga que já tem
   * um trecho gravado também é completada em vez de sobrescrita.
   */
  const registrarTudo = async () => {
    setGravando(true);
    const atualizadas = [...linhas];
    const grupos = new Map<string, number[]>();
    atualizadas.forEach((linha, i) => {
      if (linha.tipo !== "passagem" || !linha.inclusionId || linha.resultado === "ok") return;
      grupos.set(linha.inclusionId, [...(grupos.get(linha.inclusionId) ?? []), i]);
    });
    for (const [vagaId, indices] of Array.from(grupos.entries())) {
      const vaga = vagaById.get(vagaId);
      if (!vaga) continue;
      const gravada = getPassagemAtual?.(vagaId) ?? null;
      let form: Record<string, any> | null = null;
      const resumos: string[] = [];
      for (const i of indices) {
        const linha = atualizadas[i];
        const base: Record<string, any> | null = form ?? gravada;
        const junto: IdaEVoltaJuntas | null = base ? juntarIdaEVolta(base, { campos: linha.campos, trechoUnico: linha.trechoUnico }) : null;
        if (junto) {
          form = { ...base, ...junto.campos };
          resumos.push(junto.resumo);
        } else {
          form = { ...linha.campos };
        }
      }
      try {
        await onRegistrar(vaga, form as TicketFormValues);
        for (const i of indices) {
          atualizadas[i] = { ...atualizadas[i], resultado: "ok", mensagem: resumos.length ? resumos[resumos.length - 1] : "Passagem registrada" };
        }
      } catch (e) {
        for (const i of indices) {
          atualizadas[i] = { ...atualizadas[i], resultado: "erro", mensagem: (e as Error)?.message || "Falhou ao registrar" };
        }
      }
      setLinhas([...atualizadas]);
    }
    setGravando(false);
    const ok = atualizadas.filter((l) => l.resultado === "ok").length;
    const falhas = atualizadas.filter((l) => l.resultado === "erro").length;
    toast({
      title: falhas ? "Lote concluído com pendências" : "Lote concluído",
      description: `${ok} voucher(s) registrado(s)${falhas ? ` · ${falhas} com erro — veja a lista` : ""}.`,
      variant: falhas ? "destructive" : undefined,
    });
  };

  const resumoCampos = (c: Record<string, string>) => {
    const partes: string[] = [];
    // Rodoviária chama o mesmo campo de "Bilhete" no formulário; o resumo
    // precisa falar a mesma língua de quem vai conferir.
    if (c.purchaseOrderNumber) partes.push(`${c.transportType === "rodoviario" ? "Bilhete" : "LOC"} ${c.purchaseOrderNumber}`);
    if (c.departureAirport && c.destinationAirport) partes.push(`${c.departureAirport}→${c.destinationAirport}`);
    if (c.actualDepartureDate) partes.push(`ida ${c.actualDepartureDate.split("-").reverse().join("/")} ${c.actualDepartureTime ?? ""}`.trim());
    if (c.actualReturnDate) partes.push(`volta ${c.actualReturnDate.split("-").reverse().join("/")} ${c.actualReturnTime ?? ""}`.trim());
    if (c.value) partes.push(`R$ ${c.value}`);
    return partes.join(" · ");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setLinhas([]); }}>
      <DialogContent className="max-w-5xl p-0 gap-0 flex flex-col max-h-[88vh] overflow-hidden rounded-xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border pr-12">
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-primary" aria-hidden="true" />
            Registrar passagens pelos vouchers
          </DialogTitle>
          <DialogDescription>
            Solte os PDFs aqui: eu leio cada um, encontro a vaga pelo nome do passageiro e mostro o que
            entendi. <strong>Nada é salvo até você clicar em registrar.</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); escolher(e.dataTransfer.files); }}
            className="rounded-xl border-2 border-dashed border-border bg-surface-muted/60 px-6 py-8 text-center"
          >
            <input
              ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
              onChange={(e) => escolher(e.target.files)}
              data-testid="input-vouchers"
            />
            <p className="text-sm text-slate-600">Arraste os vouchers em PDF ou</p>
            <Button
              type="button" variant="outline" className="mt-2 rounded-lg"
              onClick={() => inputRef.current?.click()}
              disabled={ler.isPending}
              data-testid="button-escolher-vouchers"
            >
              {ler.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Lendo…</>
                : "Escolher arquivos"}
            </Button>
            <p className="mt-2 text-2xs text-muted-foreground">Até 30 arquivos por vez.</p>
          </div>

          {linhas.length > 0 && (
            <ul className="space-y-2">
              {linhas.map((l, idx) => {
                const aproveitavel = l.tipo === "passagem";
                return (
                  <li
                    key={`${l.arquivo}-${idx}`}
                    className={`rounded-xl border px-4 py-3 ${
                      l.resultado === "ok" ? "border-success/25 bg-success-soft/50"
                      : l.resultado === "erro" ? "border-danger/25 bg-danger-soft/50"
                      : aproveitavel ? "border-border bg-card" : "border-warning/25 bg-warning-soft/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{l.arquivo}</p>
                        {aproveitavel ? (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {l.pessoa ? <>Passageiro: <strong>{l.pessoa}</strong> · </> : null}
                              {resumoCampos(l.campos)}
                            </p>
                            {l.trechoUnico && !l.resultado && l.inclusionId && (vezesNaVaga.get(l.inclusionId) ?? 0) > 1 && (
                              <p className="mt-1 text-2xs font-medium text-primary">
                                Outro voucher desta vaga: ida e volta serão juntadas numa passagem e os valores somados.
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-2xs text-muted-foreground shrink-0">Vaga:</span>
                              <VagaCombobox
                                vagas={vagas}
                                valor={l.inclusionId}
                                passageiro={l.pessoa}
                                idsJaUsados={idsJaUsados}
                                disabled={l.resultado === "ok" || gravando}
                                onChange={(id) =>
                                  setLinhas((atuais) => atuais.map((x, i) => (i === idx ? { ...x, inclusionId: id } : x)))
                                }
                              />
                              {!l.inclusionId && (
                                <span className="text-2xs text-warning">não achei a vaga pelo nome — escolha</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-warning">
                            {l.tipo === "hospedagem"
                              ? `Isto é um voucher de hotel${l.pessoa ? ` (${l.pessoa})` : ""} — registre pela tela de Hospedagens.`
                              : l.avisos[0] ?? "Não reconheci este arquivo."}
                          </p>
                        )}
                        {l.avisos.length > 0 && aproveitavel && (
                          <ul className="mt-1 space-y-0.5">
                            {l.avisos.map((a, i) => (
                              <li key={i} className="text-2xs text-warning flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />{a}
                              </li>
                            ))}
                          </ul>
                        )}
                        {l.mensagem && (
                          <p className={`mt-1 text-2xs font-medium ${l.resultado === "ok" ? "text-success" : "text-danger"}`}>
                            {l.mensagem}
                          </p>
                        )}
                      </div>
                      {l.resultado === "ok" ? (
                        <CheckCircle2 className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLinhas((atuais) => atuais.filter((_, i) => i !== idx))}
                          disabled={gravando}
                          className="text-muted-foreground hover:text-danger-strong shrink-0"
                          aria-label={`Tirar ${l.arquivo} da lista`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-surface-muted/60 px-6 py-3 flex items-center gap-3">
          <p className="text-xs text-muted-foreground mr-auto">
            {prontas.length > 0
              ? `${prontas.length} pronta(s) para registrar`
              : linhas.length > 0 ? "Nenhuma linha pronta — confira as vagas acima." : "Nenhum arquivo ainda."}
          </p>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={gravando}>
            <X className="w-4 h-4 mr-1.5" />Fechar
          </Button>
          <Button
            type="button"
            onClick={registrarTudo}
            disabled={prontas.length === 0 || gravando || registrando}
            className="rounded-lg bg-primary hover:bg-primary-hover"
            data-testid="button-registrar-lote-vouchers"
          >
            {gravando
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Registrando…</>
              : `Registrar ${prontas.length || ""}`.trim()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
