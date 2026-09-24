import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import type { BudgetNote } from "@shared/schema";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

interface BudgetChatProps {
  /** Tipo da entidade em budget_notes ('planned' | 'actual' no Financeiro; outros módulos usam o próprio). */
  entityType: string;
  entityId: string;
  eventId?: string;
  // When provided, notes from this secondary entity are merged into the thread (read-only)
  linkedEntityType?: "planned" | "actual";
  linkedEntityId?: string;
  /** Título do bloco (padrão "Observações"). */
  title?: string;
  /** Placeholder do campo de texto (padrão depende de `submitOnEnter`). */
  placeholder?: string;
  /**
   * true (padrão, Financeiro): Enter envia, Shift+Enter quebra linha.
   * false: só Ctrl/Cmd+Enter envia (Enter quebra linha) — para contextos em que o texto é mais longo.
   */
  submitOnEnter?: boolean;
  className?: string;
}

function avatarColor(name: string) {
  const palette = [
    "bg-primary", "bg-primary", "bg-primary", "bg-success-strong",
    "bg-warning-strong", "bg-danger-strong", "bg-info-strong", "bg-info-strong",
  ];
  const idx = name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatDateTime(dt: string | Date) {
  const d = new Date(dt);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function BudgetChat({
  entityType, entityId, eventId, linkedEntityType, linkedEntityId,
  title = "Observações", placeholder, submitOnEnter = true, className,
}: BudgetChatProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  /** O contêiner que rola (a lista de mensagens) — é ELE que vai ao fim, não a página. */
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const inputId = `budget-chat-${entityType}-${entityId}`;
  const inputPlaceholder = placeholder ?? (submitOnEnter ? "Digite uma observação… (Enter para enviar)" : "Digite uma mensagem…");

  const { data: primaryNotes = [], isLoading, isError: loadError, refetch } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Não foi possível carregar as mensagens.");
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 10000,
  });

  const { data: linkedNotes = [] } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes", linkedEntityType, linkedEntityId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes?entityType=${linkedEntityType}&entityId=${linkedEntityId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!linkedEntityId && !!linkedEntityType,
    staleTime: 10000,
  });

  // Merge and sort notes from both entities chronologically
  const allNotes: (BudgetNote & { isLinked?: boolean })[] = [
    ...primaryNotes.map(n => ({ ...n, isLinked: false })),
    ...linkedNotes.map(n => ({ ...n, isLinked: true })),
  ].sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/budget-notes", {
        entityType,
        entityId,
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/budget-notes", entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["/api/budget-notes/by-event"] });
      setText("");
      // Devolve o foco ao campo para escrever a próxima mensagem sem clicar de novo.
      // Só quando o foco ainda está no compositor (o campo em readOnly ou o botão
      // Enviar): se a pessoa já saiu para outro lugar da tela, não roubamos o foco.
      const el = inputRef.current;
      if (el && composerRef.current?.contains(document.activeElement)) el.focus();
    },
  });

  useEffect(() => {
    // Rola SÓ a lista de mensagens (04/09). `scrollIntoView` no marcador do fim
    // rolava também os ancestrais: dentro de um modal, abrir o pedido puxava
    // o corpo inteiro do diálogo para a conversa e escondia o de/para e o motivo.
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [allNotes.length]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (submitOnEnter ? !e.shiftKey : (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  };

  return (
    <section className={`border-t border-border ${className ?? ""}`} aria-labelledby={`${inputId}-title`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center" aria-hidden="true">
          <MessageSquare className="w-3 h-3 text-primary-foreground" aria-hidden="true" />
        </div>
        <h3 id={`${inputId}-title`} className="text-2xs font-semibold text-primary uppercase tracking-wide">
          {title}
        </h3>
        {allNotes.length > 0 && (
          <span className="ml-auto text-2xs bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">
            {allNotes.length}<span className="sr-only"> mensagem(ns)</span>
          </span>
        )}
      </div>

      {/* Message list */}
      <div ref={listRef} className="mx-5 mb-3 rounded-xl border border-border bg-surface-muted/60 max-h-48 overflow-y-auto" aria-live="polite">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 text-primary/60 animate-spin" aria-label="Carregando mensagens" />
          </div>
        ) : loadError ? (
          <div className="text-center py-5 px-3" role="alert">
            <p className="text-2xs text-danger">Não foi possível carregar as mensagens.</p>
            <button type="button" onClick={() => refetch()} className="mt-1 text-2xs font-semibold text-primary hover:underline">Tentar novamente</button>
          </div>
        ) : allNotes.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="w-5 h-5 text-muted-foreground mx-auto mb-1" aria-hidden="true" />
            <p className="text-2xs text-muted-foreground">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allNotes.map((note) => {
              const isMe = note.authorId === user?.id;
              return (
                <div key={note.id} className={`px-3 py-2.5 flex gap-2.5 ${isMe ? "bg-primary/5" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-2xs font-bold mt-0.5 ${avatarColor(note.authorName)}`}>
                    {initials(note.authorName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-2xs font-semibold text-slate-700 truncate">{note.authorName}</span>
                      {/* 9px era ilegível em qualquer tela — 10px é o mínimo do módulo. */}
                      <span className="text-2xs text-muted-foreground flex-shrink-0">
                        {formatDateTime(note.createdAt!)}
                      </span>
                      {note.isLinked && (
                        <span className="text-2xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Planejado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed break-words">{note.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mx-5 mb-4">
        <div className="flex gap-2" ref={composerRef}>
          <label htmlFor={inputId} className="sr-only">{title}</label>
          {/*
            Enquanto envia, o campo fica `readOnly` (e não `disabled`): um textarea
            desabilitado perde o foco, e no Financeiro — onde Enter envia — isso
            obrigava a clicar no campo de novo a cada mensagem. `readOnly` bloqueia a
            digitação do mesmo jeito, mantém o foco e `aria-busy` avisa o leitor de tela.
            Envios repetidos já são ignorados por `send()`.
          */}
          <textarea
            id={inputId}
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={inputPlaceholder}
            rows={2}
            maxLength={2000}
            readOnly={createMutation.isPending}
            aria-busy={createMutation.isPending || undefined}
            aria-describedby={submitOnEnter ? undefined : `${inputId}-hint`}
            className={`flex-1 text-xs rounded-xl border border-border bg-card px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary placeholder:text-muted-foreground ${createMutation.isPending ? "opacity-60" : ""}`}
          />
          <MotivoDesabilitado motivo="Enviar" desabilitado={!text.trim() || createMutation.isPending}>
            <button
            type="button"
            onClick={send}
            disabled={!text.trim() || createMutation.isPending}
            aria-label="Enviar mensagem"
           
            className="h-9 w-9 self-end rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-3.5 h-3.5 text-primary-foreground" aria-hidden="true" />
            )}
          </button>
          </MotivoDesabilitado>
        </div>
        {!submitOnEnter && (
          <p id={`${inputId}-hint`} className="mt-1 text-2xs text-muted-foreground">Ctrl+Enter envia · Enter quebra linha</p>
        )}
        {createMutation.isError && (
          <p role="alert" className="mt-1 text-2xs text-danger">
            Não foi possível enviar a mensagem.{" "}
            <button type="button" className="font-semibold underline" onClick={send}>Tentar de novo</button>
          </p>
        )}
      </div>
    </section>
  );
}

// Card badge indicator — shows chat bubble + count
export function BudgetNotesBadge({ notes, entityId }: { notes: BudgetNote[]; entityId: string }) {
  const entityNotes = notes.filter(n => n.entityId === entityId);
  if (entityNotes.length === 0) return null;
  return (
    <div className="relative flex items-center">
      <MessageSquare className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-primary text-primary-foreground text-2xs font-bold rounded-full flex items-center justify-center leading-none">
        {entityNotes.length > 9 ? "9+" : entityNotes.length}
      </span>
    </div>
  );
}

// Snippet of last comment for card display
export function BudgetNotesSnippet({ notes, entityId }: { notes: BudgetNote[]; entityId: string }) {
  const entityNotes = notes.filter(n => n.entityId === entityId).sort(
    (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
  );
  const last = entityNotes[0];
  if (!last) return null;
  return (
    <div className="flex items-start gap-1.5 mt-1 px-0">
      <MessageSquare className="w-3 h-3 text-primary/70 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-2xs text-muted-foreground leading-snug line-clamp-1 flex-1">
        <span className="font-medium text-primary">{last.authorName.split(" ")[0]}: </span>
        {last.content}
      </p>
    </div>
  );
}
