import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isRhOrAdmin } from "@/lib/permissions";
import { fixEncoding, parseBrNumberOrNull } from "@/lib/utils";
import {
  PageHeader, MetricCard, MoneyDelta, Th, EmptyState, TableSkeleton,
  ErrorState, TableCard, formatMoney, formatDateBR,
} from "@/components/common/financial-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CollaboratorCombobox from "@/components/ui/collaborator-combobox";
import { Wallet, Search, Plus, X, Lock, TrendingDown } from "lucide-react";

/**
 * Conta corrente Flash — slide 6 do deck.
 *
 * Substitui a planilha "Conta Corrente - Alimentação Eventos.xlsx", que tem
 * 188 abas individuais mantidas à mão. Duas contas por pessoa (alimentação e
 * mobilidade), espelhando as duas tabelas lado a lado da aba individual.
 *
 * O débito do evento entra sozinho quando o RH aprova o realizado. Aqui só se
 * lança abertura, crédito complementar e ajuste.
 *
 * Notas de layout:
 * - A lista é a tela; os totais são contexto. Por isso os cards de métrica são
 *   compactos e a tabela ganha o espaço.
 * - Saldo negativo é o estado acionável (é o que dispara o crédito
 *   complementar), então tem destaque próprio no topo.
 * - A linha inteira é clicável e focável — extrato é a ação primária e não
 *   deveria exigir mirar num link.
 */

const FLASH = "#F97316";

type Balance = {
  collaboratorId: string;
  alimentacao: number;
  mobilidade: number;
  lastEntry: string | null;
};

type Entry = {
  id: string;
  account: "alimentacao" | "mobilidade";
  amount: number;
  referenceDate: string;
  description: string;
  notes: string | null;
  kind: string;
  balanceAfter: number;
};

const KIND_LABEL: Record<string, string> = {
  abertura: "Saldo de abertura",
  debito_evento: "Débito do evento",
  credito_complementar: "Crédito complementar",
  ajuste: "Ajuste",
};

const ACCOUNT_LABEL: Record<string, string> = {
  alimentacao: "Alimentação",
  mobilidade: "Mobilidade",
};

export default function FlashAccount() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEntry, setShowEntry] = useState(false);

  const canAccess = isRhOrAdmin(user);

  const balancesQuery = useQuery<Balance[]>({
    queryKey: ["/api/flash/balances"],
    enabled: canAccess,
  });
  const collaboratorsQuery = useQuery<any[]>({
    queryKey: ["/api/collaborators"],
    enabled: canAccess,
  });
  const statementQuery = useQuery<{ entries: Entry[] }>({
    queryKey: ["/api/flash/statement", selectedId],
    queryFn: () => apiRequest("GET", `/api/flash/statement/${selectedId}`).then(r => r.json()),
    enabled: !!selectedId && canAccess,
  });

  const balances = balancesQuery.data ?? [];
  const collaborators = collaboratorsQuery.data ?? [];

  const nameById = useMemo(
    () => new Map(collaborators.map((c: any) => [c.id, fixEncoding(c.fullName)])),
    [collaborators]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return balances
      .map(b => ({ ...b, name: nameById.get(b.collaboratorId) || "Colaborador removido" }))
      .filter(r => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [balances, nameById, search]);

  const totals = useMemo(() => ({
    alimentacao: balances.reduce((s, b) => s + b.alimentacao, 0),
    mobilidade: balances.reduce((s, b) => s + b.mobilidade, 0),
    negativos: balances.filter(b => b.alimentacao < 0 || b.mobilidade < 0).length,
  }), [balances]);

  if (!canAccess) {
    return (
      <EmptyState
        icon={<Lock className="w-5 h-5" />}
        title="Acesso restrito"
        description="A conta corrente Flash é acessível apenas ao RH e à administração."
      />
    );
  }

  const isLoading = balancesQuery.isLoading || collaboratorsQuery.isLoading;
  const hasError = balancesQuery.isError || collaboratorsQuery.isError;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        icon={<Wallet className="w-6 h-6" />}
        accent={FLASH}
        title="Conta Corrente Flash"
        subtitle="Adiantamento de alimentação e mobilidade por colaborador"
        actions={
          <Button
            onClick={() => setShowEntry(true)}
            className="rounded-xl text-white h-10 px-4 text-[13px] font-semibold shadow-sm hover:brightness-105 focus-visible:ring-2 focus-visible:ring-orange-300 transition-all"
            style={{ background: FLASH }}
          >
            <Plus className="w-4 h-4 mr-1.5" aria-hidden /> Novo lançamento
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Saldo — Alimentação" value={formatMoney(totals.alimentacao)} accent="#2563EB" />
        <MetricCard label="Saldo — Mobilidade" value={formatMoney(totals.mobilidade)} accent={FLASH} />
        <MetricCard
          label="Contas negativas"
          value={String(totals.negativos)}
          accent={totals.negativos > 0 ? "#DC2626" : "#64748B"}
          emphasis={totals.negativos > 0}
          hint={totals.negativos > 0 ? "Aguardando crédito complementar" : "Nenhuma pendência"}
        />
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar colaborador…"
          aria-label="Buscar colaborador"
          className="pl-9 h-10 rounded-xl border-slate-200 text-[13px] focus-visible:ring-2 focus-visible:ring-orange-200"
        />
      </div>

      <TableCard>
        {hasError ? (
          <ErrorState
            title="Não foi possível carregar os saldos"
            description="Verifique a conexão e tente novamente."
            onRetry={() => { balancesQuery.refetch(); collaboratorsQuery.refetch(); }}
          />
        ) : isLoading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="w-5 h-5" />}
            title={search ? "Nenhum colaborador encontrado" : "Nenhum lançamento ainda"}
            description={
              search
                ? "Ajuste a busca para ver outros nomes."
                : "Os débitos entram sozinhos quando o RH aprova um realizado. Para começar, lance o saldo de abertura de quem já tem crédito na Flash."
            }
            action={
              !search && (
                <Button
                  onClick={() => setShowEntry(true)}
                  className="rounded-xl text-white h-9 px-4 text-[13px] font-semibold"
                  style={{ background: FLASH }}
                >
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden /> Novo lançamento
                </Button>
              )
            }
          />
        ) : (
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50/70 border-b border-slate-100">
              <tr>
                <Th>Colaborador</Th>
                <Th align="right">Alimentação</Th>
                <Th align="right">Mobilidade</Th>
                <Th align="right">Último lançamento</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const negative = r.alimentacao < 0 || r.mobilidade < 0;
                return (
                  <tr
                    key={r.collaboratorId}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver extrato de ${r.name}`}
                    onClick={() => setSelectedId(r.collaboratorId)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(r.collaboratorId); }
                    }}
                    className="border-b border-slate-50 last:border-0 cursor-pointer transition-colors hover:bg-orange-50/50 focus:outline-none focus-visible:bg-orange-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {negative && (
                          <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="Saldo negativo" />
                        )}
                        <span className="text-[13px] font-medium text-slate-800 truncate">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px]">
                      <MoneyDelta cents={r.alimentacao} showSign={false} />
                    </td>
                    <td className="px-4 py-3 text-right text-[13px]">
                      <MoneyDelta cents={r.mobilidade} showSign={false} />
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] text-slate-400 tabular-nums whitespace-nowrap">
                      {formatDateBR(r.lastEntry)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      <StatementDialog
        collaboratorId={selectedId}
        name={selectedId ? nameById.get(selectedId) ?? "" : ""}
        query={statementQuery}
        onClose={() => setSelectedId(null)}
      />

      <NewEntryDialog
        open={showEntry}
        collaborators={collaborators}
        onClose={() => setShowEntry(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["/api/flash/balances"] });
          if (selectedId) qc.invalidateQueries({ queryKey: ["/api/flash/statement", selectedId] });
        }}
        toast={toast}
      />
    </div>
  );
}

/* ── Extrato ─────────────────────────────────────────────────────────────── */

function StatementDialog({ collaboratorId, name, query, onClose }: any) {
  const entries: Entry[] = query.data?.entries ?? [];

  return (
    <Dialog open={!!collaboratorId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0" aria-hidden>
            <Wallet className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">Extrato</DialogTitle>
            <DialogDescription className="text-[12px] text-slate-500 truncate mt-0.5">{name}</DialogDescription>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar extrato"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {query.isError ? (
            <ErrorState title="Não foi possível carregar o extrato" onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <TableSkeleton rows={6} />
          ) : entries.length === 0 ? (
            <EmptyState title="Sem lançamentos" description="Este colaborador ainda não tem movimentação na conta Flash." />
          ) : (
            <table className="w-full min-w-[600px]">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100">
                <tr>
                  <Th>Data</Th>
                  <Th>Referência</Th>
                  <Th>Conta</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums whitespace-nowrap align-top">
                      {formatDateBR(e.referenceDate)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-[13px] font-medium text-slate-800 leading-snug">{e.description}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {KIND_LABEL[e.kind] ?? e.kind}{e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap align-top">
                      {ACCOUNT_LABEL[e.account] ?? e.account}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] align-top">
                      <MoneyDelta cents={e.amount} />
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] align-top">
                      <MoneyDelta cents={e.balanceAfter} showSign={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Lançamento manual ───────────────────────────────────────────────────── */

function NewEntryDialog({ open, collaborators, onClose, onSaved, toast }: any) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [collaboratorId, setCollaboratorId] = useState("");
  const [account, setAccount] = useState<"alimentacao" | "mobilidade">("alimentacao");
  const [kind, setKind] = useState<"abertura" | "credito_complementar" | "ajuste">("credito_complementar");
  const [valor, setValor] = useState("");
  const [referenceDate, setReferenceDate] = useState(hoje);
  const [description, setDescription] = useState("");
  const [isDebit, setIsDebit] = useState(false);

  const reset = () => {
    setCollaboratorId(""); setAccount("alimentacao"); setKind("credito_complementar");
    setValor(""); setReferenceDate(hoje); setDescription(""); setIsDebit(false);
  };
  const close = () => { reset(); onClose(); };

  const parsed = parseBrNumberOrNull(valor);
  const cents = parsed === null ? 0 : Math.round(Math.abs(parsed) * 100) * (kind === "ajuste" && isDebit ? -1 : 1);
  const canSubmit = !!collaboratorId && parsed !== null && parsed !== 0 && description.trim().length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/flash/entries", {
        collaboratorId, account, kind, amount: cents,
        referenceDate, description: description.trim(),
      });
      return r.json();
    },
    onSuccess: () => { toast({ title: "Lançamento registrado" }); onSaved(); close(); },
    onError: (e: any) =>
      toast({ title: "Erro", description: e?.body?.message || e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-md rounded-2xl p-0 gap-0 border-0 shadow-2xl overflow-hidden [&>button:last-child]:hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0" aria-hidden>
            <Plus className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">Novo lançamento</DialogTitle>
            <DialogDescription className="text-[12px] text-slate-500 mt-0.5">
              Abertura, crédito complementar ou ajuste
            </DialogDescription>
          </div>
          <button
            onClick={close}
            aria-label="Fechar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <Field label="Colaborador" htmlFor="flash-collab">
            <CollaboratorCombobox
              collaborators={collaborators}
              value={collaboratorId}
              onValueChange={setCollaboratorId}
              placeholder="Selecione um colaborador"
              hideAll
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Conta">
              <Select value={account} onValueChange={v => setAccount(v as any)}>
                <SelectTrigger className="h-10 rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alimentacao">Alimentação</SelectItem>
                  <SelectItem value="mobilidade">Mobilidade</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={kind} onValueChange={v => { setKind(v as any); if (v !== "ajuste") setIsDebit(false); }}>
                <SelectTrigger className="h-10 rounded-xl text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credito_complementar">Crédito complementar</SelectItem>
                  <SelectItem value="abertura">Saldo de abertura</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor" htmlFor="flash-valor">
              <Input
                id="flash-valor"
                value={valor}
                onChange={e => setValor(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="h-10 rounded-xl text-[13px] tabular-nums"
              />
            </Field>
            <Field label="Data" htmlFor="flash-data">
              <Input
                id="flash-data"
                type="date"
                value={referenceDate}
                onChange={e => setReferenceDate(e.target.value)}
                className="h-10 rounded-xl text-[13px]"
              />
            </Field>
          </div>

          {/* Só o ajuste pode ser negativo — crédito e abertura são sempre entrada. */}
          {kind === "ajuste" && (
            <Field label="Direção">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direção do ajuste">
                {[
                  { debit: false, label: "Crédito (+)", cls: "bg-emerald-600 border-emerald-600" },
                  { debit: true, label: "Débito (−)", cls: "bg-red-600 border-red-600" },
                ].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={isDebit === opt.debit}
                    onClick={() => setIsDebit(opt.debit)}
                    className={`h-9 rounded-xl text-[12px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      isDebit === opt.debit
                        ? `${opt.cls} text-white`
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Descrição" htmlFor="flash-desc">
            <Input
              id="flash-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex.: Crédito complementar — Night Run BH"
              className="h-10 rounded-xl text-[13px]"
            />
          </Field>

          {/* Confirmação do que será gravado, antes de gravar. */}
          {canSubmit && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-slate-500">Será lançado</span>
              <MoneyDelta cents={cents} className="text-[15px]" />
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Os débitos de evento entram sozinhos quando o RH aprova o realizado.
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={close}
              className="h-10 px-4 text-[13px] font-medium text-slate-600 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit || mutation.isPending}
              className="rounded-xl text-white h-10 px-5 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: FLASH }}
            >
              {mutation.isPending ? "Salvando…" : "Lançar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
