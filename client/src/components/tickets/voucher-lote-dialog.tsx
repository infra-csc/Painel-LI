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
import { fixEncoding } from "@/lib/utils";
import type { TicketFormValues } from "@/lib/ticket-form";
import type { TeamInclusion } from "@shared/schema";
import { casarVaga } from "./voucher-match";
import VagaCombobox, { type VagaOpcao } from "./vaga-combobox";

interface LeituraDoServidor {
  arquivo: string;
  tipo: "passagem" | "hospedagem" | "desconhecido";
  formato?: string;
  campos: Record<string, string>;
  pessoa?: string;
  /** Voucher de grupo: o mesmo arquivo é o bilhete de várias pessoas. */
  pessoas?: string[];
  avisos: string[];
}

/** Uma linha da conferência: o que foi lido + em qual vaga vai entrar. */
interface Linha extends LeituraDoServidor {
  inclusionId: string | null;
  resultado?: "ok" | "erro";
  mensagem?: string;
}

export default function VoucherLoteDialog({
  open, onOpenChange, inclusions, getCollaboratorName, getEventName, onRegistrar, registrando,
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
    onError: (e: Error) =>
      toast({ title: "Erro ao ler os vouchers", description: e.message, variant: "destructive" }),
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

  const registrarTudo = async () => {
    setGravando(true);
    const atualizadas = [...linhas];
    for (let i = 0; i < atualizadas.length; i++) {
      const linha = atualizadas[i];
      if (linha.tipo !== "passagem" || !linha.inclusionId || linha.resultado === "ok") continue;
      const vaga = vagaById.get(linha.inclusionId);
      if (!vaga) continue;
      try {
        await onRegistrar(vaga, linha.campos as TicketFormValues);
        atualizadas[i] = { ...linha, resultado: "ok", mensagem: "Passagem registrada" };
      } catch (e) {
        atualizadas[i] = { ...linha, resultado: "erro", mensagem: (e as Error)?.message || "Falhou ao registrar" };
      }
      setLinhas([...atualizadas]);
    }
    setGravando(false);
    const ok = atualizadas.filter((l) => l.resultado === "ok").length;
    const falhas = atualizadas.filter((l) => l.resultado === "erro").length;
    toast({
      title: falhas ? "Lote concluído com pendências" : "Lote concluído",
      description: `${ok} passagem(ns) registrada(s)${falhas ? ` · ${falhas} com erro — veja a lista` : ""}.`,
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
      <DialogContent className="max-w-5xl p-0 gap-0 flex flex-col max-h-[88vh] overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 pr-12">
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
            className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center"
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
            <p className="mt-2 text-[11px] text-slate-400">Até 30 arquivos por vez.</p>
          </div>

          {linhas.length > 0 && (
            <ul className="space-y-2">
              {linhas.map((l, idx) => {
                const aproveitavel = l.tipo === "passagem";
                return (
                  <li
                    key={`${l.arquivo}-${idx}`}
                    className={`rounded-xl border px-4 py-3 ${
                      l.resultado === "ok" ? "border-green-200 bg-green-50/50"
                      : l.resultado === "erro" ? "border-red-200 bg-red-50/50"
                      : aproveitavel ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-slate-800 truncate">{l.arquivo}</p>
                        {aproveitavel ? (
                          <>
                            <p className="text-[12px] text-slate-500">
                              {l.pessoa ? <>Passageiro: <strong>{l.pessoa}</strong> · </> : null}
                              {resumoCampos(l.campos)}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 shrink-0">Vaga:</span>
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
                                <span className="text-[11px] text-amber-700">não achei a vaga pelo nome — escolha</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-[12px] text-amber-800">
                            {l.tipo === "hospedagem"
                              ? `Isto é um voucher de hotel${l.pessoa ? ` (${l.pessoa})` : ""} — registre pela tela de Hospedagens.`
                              : l.avisos[0] ?? "Não reconheci este arquivo."}
                          </p>
                        )}
                        {l.avisos.length > 0 && aproveitavel && (
                          <ul className="mt-1 space-y-0.5">
                            {l.avisos.map((a, i) => (
                              <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />{a}
                              </li>
                            ))}
                          </ul>
                        )}
                        {l.mensagem && (
                          <p className={`mt-1 text-[11px] font-medium ${l.resultado === "ok" ? "text-green-700" : "text-red-600"}`}>
                            {l.mensagem}
                          </p>
                        )}
                      </div>
                      {l.resultado === "ok" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLinhas((atuais) => atuais.filter((_, i) => i !== idx))}
                          disabled={gravando}
                          className="text-slate-300 hover:text-red-500 shrink-0"
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

        <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-6 py-3 flex items-center gap-3">
          <p className="text-[12px] text-slate-500 mr-auto">
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
