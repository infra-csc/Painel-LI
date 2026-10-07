/**
 * Comentários GERAIS do evento (28/08) — mural aberto: qualquer usuário logado
 * lê e escreve. Botão na Validação e no Histórico da Escala.
 *
 * Não confundir com `events.observations` (campo único da logística, editado no
 * cadastro do evento) nem com os comentários por vaga: aqui é a conversa do
 * EVENTO — "palco atrasou", "briefing às 7h", "mudou o portão de acesso".
 *
 * 07/10 (redesenho da Validação): cada comentário com as iniciais de quem
 * escreveu, o nome em destaque e a hora — lia como uma pilha de caixas cinza
 * iguais. Carregando vira esqueleto; erro ganha "Tentar de novo"; o envio
 * mostra o spinner no botão.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, MessageSquareText, RotateCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";
import { initials } from "@/lib/format";

/** "06/10/2026 14:32" — a hora ajuda a ler a conversa na ordem. */
function quando(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return formatDateBr(v);
  return `${formatDateBr(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export interface EventCommentRow {
  id: string;
  userId: string;
  userName: string | null;
  content: string;
  createdAt: string | null;
}

const key = (eventId: string) => [`/api/events/${eventId}/comments`] as const;

/** Botão + diálogo, autocontidos: só precisam do evento. Sem evento, nada. */
export function EventCommentsButton({ eventId, eventName, className, rotuloCurtoNoCelular = false }: {
  eventId: string;
  eventName?: string;
  className?: string;
  /** Validação (07/10): no celular o botão diz só "Comentários (N)" para caber ao lado da "Nota da logística". */
  rotuloCurtoNoCelular?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");

  const query = useQuery<EventCommentRow[]>({
    queryKey: key(eventId),
    enabled: !!eventId,
    staleTime: 15_000,
  });
  const comments = query.data ?? [];

  const enviar = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/events/${eventId}/comments`, { content: texto.trim() })).json(),
    onSuccess: () => {
      setTexto("");
      queryClient.invalidateQueries({ queryKey: key(eventId) });
    },
    onError: (err) => toast({
      title: "Não foi possível comentar",
      description: apiErrorMessage(err as Error, "Tente novamente."),
      variant: "destructive",
    }),
  });

  if (!eventId) return null;

  return (
    <>
      <Button
        type="button" variant="outline" size="sm"
        onClick={() => setOpen(true)}
        className={className ?? "h-9 rounded-lg border-border bg-card text-xs hover:bg-brand-soft hover:text-primary"}
        data-testid="event-comments-button"
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        <span>Comentários{rotuloCurtoNoCelular ? <span className="hidden sm:inline">{" do evento"}</span> : " do evento"}{comments.length > 0 ? ` (${comments.length})` : ""}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 flex flex-col max-h-[85vh] overflow-hidden rounded-xl">
          <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border pr-12 text-left">
            <DialogTitle>Comentários do evento</DialogTitle>
            <DialogDescription>
              {eventName ?? "Evento"} — mural aberto: todo mundo lê e escreve.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4" aria-busy={query.isLoading || undefined}>
            {query.isLoading ? (
              <ul className="space-y-4" aria-label="Carregando comentários">
                {[0, 1].map((i) => (
                  <li key={i} className="flex gap-3" aria-hidden="true">
                    <span className="val-osso h-8 w-8 shrink-0 !rounded-full" />
                    <span className="flex-1 space-y-2 pt-1"><span className="val-osso block h-3 w-32" /><span className="val-osso block h-3 w-4/5" /></span>
                  </li>
                ))}
              </ul>
            ) : query.isError ? (
              <div role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">Não foi possível carregar os comentários.</p>
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => query.refetch()}>
                  <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Tentar de novo
                </Button>
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center py-5 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
                  <MessageSquareText className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-medium text-foreground">Nenhum comentário ainda</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">O primeiro conta o que o resto do time precisa saber.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {comments.map((c) => (
                  <li key={c.id} className="val-entra flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xs font-semibold text-primary" aria-hidden="true">
                      {initials(c.userName ?? "Usuário") || "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-semibold text-foreground">{c.userName ?? "Usuário"}</span>
                        {c.createdAt && <span className="tabular-nums text-muted-foreground">{quando(c.createdAt)}</span>}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words rounded-lg rounded-tl-sm border border-border bg-card px-3 py-2 text-sm text-foreground">{c.content}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-surface-muted/60 px-5 py-3">
            <div className="flex items-end gap-2">
              <Textarea
                rows={2} maxLength={2000} value={texto}
                placeholder="Escreva para todo mundo que acompanha este evento…"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && texto.trim()) enviar.mutate();
                }}
                className="min-h-[60px] resize-none rounded-lg bg-card text-sm"
                aria-label="Novo comentário do evento"
                disabled={enviar.isPending}
              />
              <Button
                type="button" onClick={() => enviar.mutate()}
                disabled={!texto.trim() || enviar.isPending}
                className="val-alvo h-10 w-10 shrink-0 rounded-lg bg-primary p-0 hover:bg-primary-hover"
                aria-label="Enviar comentário"
              >
                {enviar.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  : <Send className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            <p className="mt-1.5 text-2xs text-muted-foreground">Ctrl+Enter envia.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
