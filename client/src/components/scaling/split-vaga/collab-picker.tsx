/**
 * Passo 1 · Novo colaborador (25/09 — extraído de split-vaga-modal.tsx): botão
 * que abre a lista em portal (para escapar do overflow do modal), com busca.
 */
import { createPortal } from "react-dom";
import { Search, Check, ChevronDown } from "lucide-react";
import { cn, fixEncoding } from "@/lib/utils";
import { capitalizeName } from "./split-shared";
import type { SplitState } from "./use-split-state";

export function CollabPicker({ s }: { s: SplitState }) {
  const { dropRef, inputRef, openDrop, collabDropOpen, setCollabDropOpen, selectedCollab, dropRect, collabSearch, setCollabSearch, filteredCollabs, selectedCollabId, setSelectedCollabId } = s;
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Novo colaborador</p>
      <div ref={dropRef}>
        <button
          onClick={openDrop}
          className={cn("flex items-center justify-between gap-2 w-full h-11 px-3 rounded-lg bg-card text-left cursor-pointer transition-all", (collabDropOpen ? "border border-primary ring-[3px] ring-primary/10" : "border border-border shadow-1"))}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedCollab ? (
              <>
                <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-2xs font-bold text-white bg-primary-hover">
                  {fixEncoding(selectedCollab.fullName || "?").charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-foreground truncate">
                  {capitalizeName(fixEncoding(selectedCollab.fullName || ""))}
                </span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">Buscar colaborador…</span>
              </>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform" style={{transform: collabDropOpen ? 'rotate(180deg)' : 'none'}} aria-hidden="true" />
        </button>

        {collabDropOpen && dropRect && createPortal(
          <div
            id="split-collab-portal"
            className="absolute bg-card rounded-xl overflow-hidden border border-border shadow-3"
            style={{
              top: dropRect.top,
              left: dropRect.left,
              width: dropRect.width,
              zIndex: 10000,
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <input
                ref={inputRef}
                value={collabSearch}
                onChange={e => setCollabSearch(e.target.value)}
                placeholder="Buscar colaborador…"
                className="flex-1 border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm text-sm text-foreground bg-transparent"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {filteredCollabs.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground text-sm">Nenhum colaborador encontrado</div>
              ) : filteredCollabs.map(c => {
                const name = capitalizeName(fixEncoding(c.fullName || ""));
                const isSel = c.id === selectedCollabId;
                const ini = fixEncoding(c.fullName || "?").charAt(0).toUpperCase();
                return (
                  <button
                    key={c.id}
                    onMouseDown={e => { e.preventDefault(); setSelectedCollabId(c.id); setCollabDropOpen(false); setCollabSearch(""); }}
                    className={cn("flex items-center gap-2.5 w-full px-3.5 py-2 border-0 border-b border-border cursor-pointer text-left transition-colors", (isSel ? "bg-brand-soft" : "bg-transparent"))}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--surface-muted)'; }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-2xs font-bold text-white", (isSel ? "bg-primary-hover" : "bg-neutral"))}>
                      {ini}
                    </div>
                    <span className={cn("text-sm truncate", (isSel ? "font-semibold" : "font-normal"), (isSel ? "text-primary" : "text-slate-700"))}>
                      {name}
                    </span>
                    {isSel && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
