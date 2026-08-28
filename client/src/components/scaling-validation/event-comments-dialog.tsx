/**
 * Comentários GERAIS do evento (28/08) — mural aberto: qualquer usuário logado
 * lê e escreve. Botão na Validação e no Histórico da Escala.
 *
 * Não confundir com `events.observations` (campo único da logística, editado no
 * cadastro do evento) nem com os comentários por vaga: aqui é a conversa do
 * EVENTO — "palco atrasou", "briefing às 7h", "mudou o portão de acesso".
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/utils";
import { formatDateBr } from "@/lib/dates";

export interface EventCommentRow {
  id: string;
  userId: string;
  userName: string | null;
  content: string;
  createdAt: string | null;
}

const key = (eventId: string) => [`/api/events/${eventId}/comments`] as const;

/** Botão + diálogo, autocontidos: só precisam do evento. Sem evento, nada. */
export function EventCommentsButton({ eventId, eventName, className }: {
  eventId: string;
  eventName?: string;
  className?: string;
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
        className={className ?? "h-9 rounded-lg border-slate-200 bg-white text-xs hover:bg-brand-soft hover:text-primary"}
        data-testid="event-comments-button"
      >
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Comentários do evento{comments.length > 0 ? ` (${comments.length})` : ""}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 flex flex-col max-h-[85vh] overflow-hidden rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 pr-12">
            <DialogTitle>Comentários do evento</DialogTitle>
            <DialogDescription>
              {eventName ?? "Evento"} — mural aberto: todo mundo lê e escreve.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {query.isLoading ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm italic text-slate-400">Nenhum comentário ainda — o primeiro conta o que o resto do time precisa saber.</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{c.content}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {c.userName ?? "Usuário"}{c.createdAt ? ` · ${formatDateBr(c.createdAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
            <div className="flex items-end gap-2">
              <Textarea
                rows={2} maxLength={2000} value={texto}
                placeholder="Escreva para todo mundo que acompanha este evento…"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && texto.trim()) enviar.mutate();
                }}
                className="rounded-lg bg-white text-sm"
                aria-label="Novo comentário do evento"
              />
              <Button
                type="button" onClick={() => enviar.mutate()}
                disabled={!texto.trim() || enviar.isPending}
                className="rounded-lg bg-primary hover:bg-primary-hover"
                aria-label="Enviar comentário"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Ctrl+Enter envia.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
