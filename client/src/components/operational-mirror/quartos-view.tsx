/**
 * Visão Quartos do espelho operacional (25/09 — extraída da página).
 * Hotel e tipo aparecem uma vez por grupo, como na planilha, e são editáveis aqui mesmo.
 */
import { useState, useEffect } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RoomGroup } from "@shared/operational-mirror-types";
import { MoverPara } from "./mover-para";
import { FAIXA, diaSemana, fmtDate, memberInfo, type GroupViewProps } from "./mirror-shared";

/**
 * Texto editável no lugar, para os campos do grupo (hotel). Salva ao sair do
 * campo ou no Enter; Esc devolve o valor anterior.
 */
function TextoEditavel({ valor, placeholder, aoSalvar, rotulo }: {
  valor: string | null | undefined;
  placeholder: string;
  aoSalvar: (v: string) => void;
  rotulo: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => { setTexto(valor ?? ""); }, [valor]);
  return (
    <input
      value={texto}
      aria-label={rotulo}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { if ((valor ?? "") !== texto) aoSalvar(texto.trim()); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { e.preventDefault(); setTexto(valor ?? ""); (e.target as HTMLInputElement).blur(); }
      }}
      className="h-8 w-full min-w-[150px] rounded-md border border-input/60 bg-background/60 px-2.5 text-xs transition-colors hover:border-input hover:bg-background focus:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground/60"
    />
  );
}

/**
 * Data de entrada/saída de um ocupante. Só aparece como campo no hover e no
 * foco: numa tabela de leitura, seis inputs por linha viram ruído. Quando a
 * pessoa tem data própria (chegou antes, saiu depois), o valor fica destacado —
 * é o sinal de que ela NÃO segue o período do quarto.
 */
function DataDoOcupante({ valor, propria, canEdit, rotulo, aoSalvar }: {
  valor: string | null | undefined;
  propria: boolean;
  canEdit: boolean;
  rotulo: string;
  aoSalvar: (v: string) => void;
}) {
  const iso = valor ? String(valor).slice(0, 10) : "";
  if (!canEdit) {
    return <span className={`tabular-nums ${propria ? "font-semibold text-primary " : ""}`}>{fmtDate(valor)}</span>;
  }
  return (
    <input
      type="date"
      defaultValue={iso}
      aria-label={rotulo}
      title={propria ? "Estadia própria — diferente do período do quarto" : "Segue o período do quarto"}
      onBlur={(e) => { if (e.target.value !== iso) aoSalvar(e.target.value); }}
      className={`h-7 w-[126px] rounded-md border border-transparent bg-transparent px-1 text-xs tabular-nums hover:border-input focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        propria ? "font-semibold text-primary " : ""}`}
    />
  );
}

export type QuartosViewProps = GroupViewProps<RoomGroup> & {
  /** Estadia de UMA pessoa dentro do quarto — pode diferir do grupo. */
  onPatchMembro?: (membroId: string, campos: Record<string, unknown>) => void;
};

export function QuartosView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onSeparar, onMover, pendingId, onPatchMembro }: QuartosViewProps) {
  const emptyHint = canEdit ? ' Clique em "Sugestões".' : "";
  if (groups.length === 0) return <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center text-sm text-muted-foreground">Nenhuma sugestão de quarto ainda.{emptyHint}</div>;
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  /** Como cada quarto se descreve na lista de destinos: por quem está nele. */
  const descreve = (g: RoomGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    return nomes.length ? `Com ${nomes.join(", ")}` : "Quarto vazio";
  };
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 border-b">
            <tr className="text-left">
              <th scope="col" className="px-3 py-2 font-semibold">Nome</th>
              <th scope="col" className="px-3 py-2 font-semibold">Departamento</th>
              <th scope="col" className="px-3 py-2 font-semibold">Início</th>
              <th scope="col" className="px-3 py-2 font-semibold">Data ida</th>
              <th scope="col" className="px-3 py-2 font-semibold">Término</th>
              <th scope="col" className="px-3 py-2 font-semibold">Data volta</th>
              <th scope="col" className="px-3 py-2 font-semibold">Hotel</th>
              <th scope="col" className="px-3 py-2 font-semibold">Quarto</th>
              <th scope="col" className="px-3 py-2 font-semibold text-right">Situação</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const membros = (g.members || []).map((m) => memberInfo(m, collabById));
              const faixa = FAIXA[gi % FAIXA.length];
              return membros.map((m, mi) => {
                const r = m.id ? rowByCollab.get(m.id) : undefined;
                // Estadia DESTA pessoa, quando ela difere do grupo (montagem,
                // desmontagem). Vazio = segue o quarto.
                const bruto = (g.members || [])[mi] as { id?: string; checkInDate?: string | null; checkOutDate?: string | null } | undefined;
                const ini = bruto?.checkInDate || r?.accommodation?.checkInDate || r?.schedule.startDate || g.checkInDate;
                const fim = bruto?.checkOutDate || r?.accommodation?.checkOutDate || r?.schedule.endDate || g.checkOutDate;
                return (
                  <tr key={`${g.id}-${m.id ?? mi}`}
                    className={`group/linha ${faixa} ${mi === membros.length - 1 ? "border-b-2 border-border" : "border-b border-border/40"}`}
                    data-testid={`room-row-${g.id}-${mi}`}>
                    <td className="px-3 py-2 font-medium">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{m.name}</span>
                        {canEdit && m.id && (
                          <MoverPara pessoa={m.name} grupoAtual={g.id} rotuloNovo="Quarto individual"
                            consequencia="O tipo de cada quarto passa a seguir quantas pessoas sobram nele — e a hotelaria do evento muda junto."
                            destinos={groups.filter((o) => o.id !== g.id).map((o) => ({ id: o.id, descricao: descreve(o) }))}
                            onMover={(para) => onMover(m.id as string, g.id, para)} />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{r?.function.area || r?.function.name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{diaSemana(ini)}</td>
                    <td className="px-3 py-2">
                      <DataDoOcupante valor={ini} propria={!!bruto?.checkInDate} canEdit={canEdit && !!bruto?.id} rotulo={`Entrada de ${m.name}`}
                        aoSalvar={(v) => onPatchMembro?.(bruto!.id as string, { checkInDate: v })} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{diaSemana(fim)}</td>
                    <td className="px-3 py-2">
                      <DataDoOcupante valor={fim} propria={!!bruto?.checkOutDate} canEdit={canEdit && !!bruto?.id} rotulo={`Saída de ${m.name}`}
                        aoSalvar={(v) => onPatchMembro?.(bruto!.id as string, { checkOutDate: v })} />
                    </td>
                    {/* Hotel e tipo aparecem uma vez por grupo, como na planilha —
                        e são editáveis aqui mesmo, sem abrir outra tela. */}
                    {mi === 0 ? (
                      <td className="px-3 py-2 align-middle" rowSpan={membros.length}>
                        {canEdit ? (
                          <TextoEditavel
                            valor={g.hotelName}
                            placeholder="Definir hotel…"
                            aoSalvar={(v) => onPatch(g.id, { hotelName: v || null })}
                            rotulo="Hotel do quarto"
                          />
                        ) : (g.hotelName || <span className="text-muted-foreground">—</span>)}
                      </td>
                    ) : null}
                    {mi === 0 ? (
                      <td className="px-3 py-2 text-center align-middle" rowSpan={membros.length}>
                        <span className="inline-flex items-center gap-1.5 font-semibold uppercase">
                          {membros.length === 1 ? "Single" : membros.length === 2 ? "Duplo" : membros.length === 3 ? "Triplo" : `${membros.length} pessoas`}
                          <span className="rounded-full bg-background/70 px-1.5 text-2xs font-normal normal-case tabular-nums text-muted-foreground">
                            {membros.length} {membros.length === 1 ? "pessoa" : "pessoas"}
                          </span>
                        </span>
                        {canEdit && membros.length > 1 && onSeparar && (
                          <button type="button" onClick={() => onSeparar(g.id)}
                            className="mt-1 block mx-auto text-2xs text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                            data-testid={`separar-${g.id}`}>
                            Separar em individuais
                          </button>
                        )}
                        {g.notes && (
                          <span className="block mt-1 text-2xs font-normal normal-case text-muted-foreground leading-snug max-w-[190px] mx-auto">{g.notes}</span>
                        )}
                      </td>
                    ) : null}
                    {mi === 0 ? (
                      <td className="px-3 py-2 text-right align-middle" rowSpan={membros.length}>
                        {g.confirmed ? (
                          canEdit ? (
                            <Button size="sm" variant="outline" className="h-7 border-success/25 bg-success-soft text-xs text-success hover:bg-success-soft"
                              onClick={() => onPatch(g.id, { __reabrir: true })} data-testid={`reabrir-uber-${g.id}`}
                              title="Reabrir o carro para voltar a ser sugestão — confirmado, ele fica de fora do recálculo">
                              <CheckCheck className="h-3 w-3 mr-1" aria-hidden="true" /> Confirmado
                            </Button>
                          ) : <Badge className="bg-success hover:bg-success/90">Confirmado</Badge>
                        ) : canEdit ? (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-room-${g.id}`}>
                            {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3 w-3 mr-1" aria-hidden="true" />} Confirmar
                          </Button>
                        ) : <Badge variant="outline">Sugestão</Badge>}
                      </td>
                    ) : null}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
