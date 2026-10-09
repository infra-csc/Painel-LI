/**
 * Escalação por grade — diálogos (25/09, extraídos do formulário): escolher
 * função, escolher função para os horários copiados e colar do Excel.
 *
 * 07/10 (redesenho, régua dos diálogos da tela): cabeçalho com ícone e o que
 * o diálogo faz; "Selecionar função" ganha busca (eram ~20 botões em fila);
 * "copiar horários" mostra os quatro dados de viagem lado a lado em vez de
 * uma frase com "✅ … • … •"; "Colar do Excel" mostra o formato como colunas
 * numeradas. Mesmos campos, mesmas ações, mesmos rótulos que os testes usam.
 */
import { useMemo, useState } from "react";
import { ClipboardPaste, Copy, Info, Layers, Search, Upload } from "lucide-react";
import type { Function } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CabecalhoDoDialogo, CorpoDoDialogo, LABEL, RodapeDoDialogo, moldura } from "@/components/tables/team-inclusion/inclusion-ui";
import { formatDateForDisplay } from "./grid-types";
import type { GridRows } from "./use-grid-rows";
import type { GridPaste } from "./use-grid-paste";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function FunctionSelectDialog({ grid, functions, sortedFunctions }: { grid: GridRows; functions: Function[] | undefined; sortedFunctions: Function[] }) {
  const { showFunctionSelect, setShowFunctionSelect, addSystemFunction } = grid;
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const q = normalizar(busca);
    return q ? sortedFunctions.filter(f => normalizar(`${f.name} ${f.description ?? ""}`).includes(q)) : sortedFunctions;
  }, [sortedFunctions, busca]);
  const fechar = () => { setShowFunctionSelect(false); setBusca(""); };
  return (
    <Dialog open={showFunctionSelect} onOpenChange={(v) => { if (!v) setBusca(""); setShowFunctionSelect(v); }}>
      <DialogContent className={moldura("sm:max-w-[480px]")}>
        <CabecalhoDoDialogo icone={Layers} titulo="Selecionar função" descricao="A função entra como uma nova linha vazia no fim da grade." onFechar={fechar} />
        <div className="shrink-0 px-4 sm:px-5 py-2.5 border-b border-border bg-card">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              autoFocus
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar função…"
              aria-label="Buscar função"
              className="w-full h-9 pl-[33px] pr-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 max-h-[360px] max-sm:max-h-none overflow-y-auto p-1.5 bg-card">
          {visiveis.map(func => (
            <button
              key={func.id}
              type="button"
              onClick={() => { addSystemFunction(func.id); setBusca(""); }}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{func.name}</span>
                {func.description && (
                  <span className="block text-xs text-muted-foreground mt-0.5">{func.description}</span>
                )}
              </span>
            </button>
          ))}
          {(!functions || functions.length === 0) ? (
            <p className="m-0 px-3 py-6 text-sm text-muted-foreground text-center">
              {!functions ? "Carregando funções…" : "Não há funções cadastradas."}
            </p>
          ) : visiveis.length === 0 && (
            <p className="m-0 px-3 py-6 text-sm text-muted-foreground text-center">Nenhuma função com esse nome.</p>
          )}
        </div>
        <RodapeDoDialogo>
          <Button variant="outline" onClick={fechar} className="h-9 rounded-lg px-4 text-sm font-medium">
            Cancelar
          </Button>
        </RodapeDoDialogo>
      </DialogContent>
    </Dialog>
  );
}

function DadoDeViagem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className={`m-0 mt-0.5 text-sm tabular-nums truncate ${valor ? "text-foreground font-medium" : "text-muted-foreground/70"}`}>{valor || "vazio"}</dd>
    </div>
  );
}

export function ScheduleCopyDialog({ grid, sortedFunctions }: { grid: GridRows; sortedFunctions: Function[] }) {
  const { showFunctionSelectForSchedule, setShowFunctionSelectForSchedule, selectedRowForScheduleCopy, createRowWithCopiedSchedule } = grid;
  const src = selectedRowForScheduleCopy;
  return (
    <Dialog open={showFunctionSelectForSchedule} onOpenChange={setShowFunctionSelectForSchedule}>
      <DialogContent className={moldura("sm:max-w-[520px]")}>
        <CabecalhoDoDialogo
          icone={Copy}
          titulo="Escolher função para os horários copiados"
          descricao={<>Copiando a viagem de <strong className="text-foreground font-semibold">{src?.functionName}</strong> para uma nova linha.</>}
          onFechar={() => setShowFunctionSelectForSchedule(false)}
        />
        <CorpoDoDialogo>
          <div className="flex flex-col gap-3">
            <dl className="m-0 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-border bg-card p-3.5">
              <DadoDeViagem rotulo="Voo de ida" valor={src?.dataVooIda ? formatDateForDisplay(src.dataVooIda) : ""} />
              <DadoDeViagem rotulo="Chegada" valor={src?.horarioChegadaSugerido ?? ""} />
              <DadoDeViagem rotulo="Voo de volta" valor={src?.dataVooRetorno ? formatDateForDisplay(src.dataVooRetorno) : ""} />
              <DadoDeViagem rotulo="Partida" valor={src?.horarioPartidaSugerido ?? ""} />
            </dl>
            <div className="rounded-xl border border-border bg-card p-3.5">
              <label className={LABEL} htmlFor="copiar-horarios-funcao">Escolha a nova função</label>
              <Select onValueChange={(functionId) => {
                createRowWithCopiedSchedule(functionId);
              }}>
                <SelectTrigger id="copiar-horarios-funcao" className="h-10 rounded-lg">
                  <SelectValue placeholder="Selecione uma função" />
                </SelectTrigger>
                <SelectContent>
                  {sortedFunctions.map((func) => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="m-0 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5 text-xs leading-5 text-warning">
              <Info className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" />
              <span>
                <strong>Importante:</strong> as quantidades por dia (quantas pessoas em cada célula) NÃO são copiadas — a nova linha começa vazia (–).
                Só os dados de viagem (datas/horários de voo, passagem e hospedagem) são copiados.
              </span>
            </p>
          </div>
        </CorpoDoDialogo>
        <RodapeDoDialogo>
          <Button variant="outline" onClick={() => setShowFunctionSelectForSchedule(false)} className="h-9 rounded-lg px-4 text-sm font-medium">
            Cancelar
          </Button>
        </RodapeDoDialogo>
      </DialogContent>
    </Dialog>
  );
}

const COLUNAS_DO_EXCEL = ["Função", "Data voo ida", "Horário chegada", "Data voo retorno", "Horário partida", "Passagem", "Hospedagem", "Diárias por dia…"];

export function ExcelPasteDialog({ paste }: { paste: GridPaste }) {
  const { showPasteModal, setShowPasteModal, pastedData, setPastedData, closePaste, handlePasteFromExcel } = paste;
  const linhas = pastedData.trim() ? pastedData.trim().split(/\r?\n/).length : 0;
  return (
    <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
      <DialogContent className={moldura("sm:max-w-[720px]")}>
        <CabecalhoDoDialogo
          icone={ClipboardPaste}
          titulo="Colar dados do Excel"
          descricao="Copie as linhas da planilha (sem o cabeçalho) e cole abaixo. As diárias das colunas extras vão para as datas da grade, na ordem."
          onFechar={closePaste}
        />
        <CorpoDoDialogo>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="m-0 mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Formato esperado — uma função por linha</p>
              <ol className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                {COLUNAS_DO_EXCEL.map((c, i) => (
                  <li key={c} className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-md border border-border bg-surface-muted text-xs text-slate-700">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-card border border-border text-2xs font-semibold tabular-nums text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                    {c}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="grid-colar-excel" className={LABEL}>Cole os dados aqui:</label>
                {linhas > 0 && <span className="text-xs text-muted-foreground tabular-nums">{linhas} {linhas === 1 ? "linha" : "linhas"}</span>}
              </div>
              <Textarea
                id="grid-colar-excel"
                value={pastedData}
                onChange={(e) => setPastedData(e.target.value)}
                placeholder="Cole os dados do Excel aqui (Ctrl+V)..."
                className="h-48 font-mono text-xs rounded-lg"
              />
            </div>
          </div>
        </CorpoDoDialogo>
        <RodapeDoDialogo>
          <Button variant="outline" onClick={closePaste} className="h-9 rounded-lg px-4 text-sm font-medium">
            Cancelar
          </Button>
          <Button onClick={handlePasteFromExcel} className="h-9 rounded-lg px-4 text-sm font-semibold gap-2 hover:bg-primary-hover">
            <Upload className="w-4 h-4" aria-hidden="true" />
            Processar e Adicionar
          </Button>
        </RodapeDoDialogo>
      </DialogContent>
    </Dialog>
  );
}
