import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import type { BudgetNote } from "@shared/schema";

interface BudgetChatProps {
  entityType: "planned" | "actual";
  entityId: string;
}

function avatarColor(name: string) {
  const palette = [
    "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-emerald-500",
    "bg-orange-500", "bg-rose-500", "bg-teal-500", "bg-cyan-500",
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

export function BudgetChat({ entityType, entityId }: BudgetChatProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: notes = [], isLoading } = useQuery<BudgetNote[]>({
    queryKey: ["/api/budget-notes", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/budget-notes?entityType=${entityType}&entityId=${entityId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 10000,
  });

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/budget-notes", {
        entityType,
        entityId,
        content,
        _userId: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/budget-notes", entityType, entityId] });
      qc.invalidateQueries({ queryKey: ["/api/budget-notes/by-event"] });
      setText("");
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes.length]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate(trimmed);
  };

  return (
    <div className="border-t border-slate-100">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center">
          <MessageSquare className="w-3 h-3 text-white" />
        </div>
        <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
          Observações
        </span>
        {notes.length > 0 && (
          <span className="ml-auto text-[10px] bg-blue-100 text-blue-600 font-semibold px-1.5 py-0.5 rounded-full">
            {notes.length}
          </span>
        )}
      </div>

      {/* Message list */}
      <div className="mx-5 mb-3 rounded-xl border border-slate-200 bg-slate-50/60 max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="w-5 h-5 text-slate-300 mx-auto mb-1" />
            <p className="text-[11px] text-slate-400">Nenhuma observação ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notes.map((note) => {
              const isMe = note.authorId === user?.id;
              return (
                <div key={note.id} className={`px-3 py-2.5 flex gap-2.5 ${isMe ? "bg-blue-50/60" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold mt-0.5 ${avatarColor(note.authorName)}`}>
                    {initials(note.authorName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="text-[11px] font-semibold text-slate-700 truncate">{note.authorName}</span>
                      <span className="text-[9px] text-slate-400 flex-shrink-0">
                        {formatDateTime(note.createdAt!)}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-600 leading-relaxed break-words">{note.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mx-5 mb-4 flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Digite uma observação… (Enter para enviar)"
          rows={2}
          className="flex-1 text-[12px] rounded-xl border border-slate-200 bg-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 placeholder:text-slate-400"
        />
        <button
          onClick={send}
          disabled={!text.trim() || createMutation.isPending}
          className="h-9 w-9 self-end rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}

// Card badge indicator — shows chat bubble + count
export function BudgetNotesBadge({ notes, entityId }: { notes: BudgetNote[]; entityId: string }) {
  const entityNotes = notes.filter(n => n.entityId === entityId);
  if (entityNotes.length === 0) return null;
  return (
    <div className="relative flex items-center">
      <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
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
      <MessageSquare className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
      <p className="text-[10px] text-slate-500 leading-snug line-clamp-1 flex-1">
        <span className="font-medium text-blue-600">{last.authorName.split(" ")[0]}: </span>
        {last.content}
      </p>
    </div>
  );
}
