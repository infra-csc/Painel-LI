/**
 * Escalação por Grade — diálogos (25/09, extraídos do formulário): escolher
 * função, escolher função para os horários copiados e colar do Excel.
 */
import { Upload } from "lucide-react";
import type { Function } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GridRows } from "./use-grid-rows";
import type { GridPaste } from "./use-grid-paste";

export function FunctionSelectDialog({ grid, functions, sortedFunctions }: { grid: GridRows; functions: Function[] | undefined; sortedFunctions: Function[] }) {
  const { showFunctionSelect, setShowFunctionSelect, addSystemFunction } = grid;
  return (
    <Dialog open={showFunctionSelect} onOpenChange={setShowFunctionSelect}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Selecionar Função</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escolha uma função das disponíveis no sistema:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedFunctions.map(func => (
              <Button
                key={func.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => addSystemFunction(func.id)}
              >
                <div className="text-left">
                  <div className="font-medium">{func.name}</div>
                  {func.description && (
                    <div className="text-xs text-muted-foreground">{func.description}</div>
                  )}
                </div>
              </Button>
            ))}
            {(!functions || functions.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {!functions ? "Carregando funções…" : "Não há funções cadastradas."}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => setShowFunctionSelect(false)} className="w-full">
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleCopyDialog({ grid, sortedFunctions }: { grid: GridRows; sortedFunctions: Function[] }) {
  const { showFunctionSelectForSchedule, setShowFunctionSelectForSchedule, selectedRowForScheduleCopy, createRowWithCopiedSchedule } = grid;
  return (
    <Dialog open={showFunctionSelectForSchedule} onOpenChange={setShowFunctionSelectForSchedule}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher Função para os Horários Copiados</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-brand-soft p-3 rounded-lg border">
            <p className="text-sm font-medium">
              Copiando horários de: <strong>{selectedRowForScheduleCopy?.functionName}</strong>
            </p>
            <div className="text-xs text-muted-foreground mt-1">
              ✅ Data Voo Ida: {selectedRowForScheduleCopy?.dataVooIda || "(vazio)"} •
              Horário Chegada: {selectedRowForScheduleCopy?.horarioChegadaSugerido || "(vazio)"} •
              Data Voo Retorno: {selectedRowForScheduleCopy?.dataVooRetorno || "(vazio)"} •
              Horário Partida: {selectedRowForScheduleCopy?.horarioPartidaSugerido || "(vazio)"}
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Escolha a nova função:</Label>
            <Select onValueChange={(functionId) => {
              createRowWithCopiedSchedule(functionId);
            }}>
              <SelectTrigger className="mt-2">
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
          <div className="bg-warning-soft p-3 rounded-lg border border-warning/25">
            <p className="text-xs text-warning">
              <strong>Importante:</strong> as quantidades por dia (quantas pessoas em cada célula) NÃO são copiadas — a nova linha começa vazia (–).
              Só os dados de viagem (datas/horários de voo, passagem e hospedagem) são copiados.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFunctionSelectForSchedule(false)}
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExcelPasteDialog({ paste }: { paste: GridPaste }) {
  const { showPasteModal, setShowPasteModal, pastedData, setPastedData, closePaste, handlePasteFromExcel } = paste;
  return (
    <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colar Dados do Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-brand-soft p-3 rounded-lg border border-primary/25">
            <p className="text-sm font-semibold text-primary mb-2">📋 Formato Esperado:</p>
            <div className="text-xs text-primary font-mono bg-card p-2 rounded">
              Função | Data Voo Ida | Horário Chegada | Data Voo Retorno | Horário Partida | Passagem | Hospedagem | [Diárias por dia...]
            </div>
            <p className="text-xs text-primary mt-2">
              <strong>Dica:</strong> Copie as linhas do Excel (sem cabeçalho) e cole abaixo. As diárias nas colunas extras serão aplicadas às datas correspondentes.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Cole os dados aqui:</Label>
            <Textarea
              value={pastedData}
              onChange={(e) => setPastedData(e.target.value)}
              placeholder="Cole os dados do Excel aqui (Ctrl+V)..."
              className="h-48 font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closePaste}>
              Cancelar
            </Button>
            <Button onClick={handlePasteFromExcel}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              Processar e Adicionar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
