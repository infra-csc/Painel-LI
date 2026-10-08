// Extraído de invoices.tsx em 25/09 (modularização): tela-bloqueio "Confirme
// a empresa pagadora" que o RH/admin vê quando o evento ainda não tem CNPJ.
// O estado do formulário fica em `usePaymentCompanyForm`, chamado pela
// PÁGINA (não aqui): assim ele sobrevive quando o bloqueio some e volta ao
// trocar de evento — exatamente como antes da extração.
//
// 08/10 (redesenho): era um cartão de 448px com um `<select>` nativo e um
// botão laranja desbotado. Agora diz POR QUE a escolha importa (o texto de
// pagamento de cada nota sai com ela), mostra as empresas cadastradas como
// opções com nome e CNPJ à vista (rádio de verdade, teclado incluso), e
// "Outra empresa" abre os dois campos com rótulo. A confirmação continua: a
// escolha vale para todas as notas do evento — o diálogo repete nome e CNPJ.
import { useState } from "react";
import { Building2, Check, PenLine, Loader2 } from "lucide-react";
import type { PaymentCompany } from "@shared/schema";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import { digitosDoCnpj, erroDoCnpj, mascararCnpj } from "@shared/cnpj";

export function usePaymentCompanyForm() {
  // Company confirmation state (for the CNPJ blocking screen)
  // Vazio de propósito: o usuário deve escolher ativamente a empresa pagadora.
  const [confirmCompanyId, setConfirmCompanyId] = useState<string>("");
  const [confirmCustomName, setConfirmCustomName] = useState("");
  const [confirmCustomCnpj, setConfirmCustomCnpj] = useState("");
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  return {
    confirmCompanyId, setConfirmCompanyId,
    confirmCustomName, setConfirmCustomName,
    confirmCustomCnpj, setConfirmCustomCnpj,
    companyDialogOpen, setCompanyDialogOpen,
  };
}

export type PaymentCompanyForm = ReturnType<typeof usePaymentCompanyForm>;

export interface PaymentCompanyGateProps {
  paymentCompanies: PaymentCompany[];
  form: PaymentCompanyForm;
  mutation: {
    mutate: (v: { name: string; cnpj: string }) => void;
    isPending: boolean;
  };
}

const CAMPO =
  "pas-alvo w-full h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12";

/** Uma opção da lista (empresa cadastrada ou "Outra empresa"). */
function Opcao({ checked, onSelect, titulo, detalhe, icone }: {
  checked: boolean;
  onSelect: () => void;
  titulo: string;
  detalhe?: string;
  icone?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "group flex items-center gap-3 min-h-[52px] px-3.5 py-2.5 rounded-lg border cursor-pointer transition-colors duration-150 motion-reduce:transition-none",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-primary/50 bg-brand-soft" : "border-border bg-card hover:border-slate-300 hover:bg-surface-muted",
      )}
    >
      <input type="radio" name="nf-empresa-pagadora" className="sr-only" checked={checked} onChange={onSelect} />
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border shrink-0 transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card",
        )}
      >
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium leading-5 truncate", checked ? "text-primary" : "text-foreground")}>{titulo}</span>
        {detalhe && <span className="block text-xs leading-4 tabular-nums text-muted-foreground">{detalhe}</span>}
      </span>
      {icone}
    </label>
  );
}

// Definir a empresa pagadora é ação do RH/admin — só eles veem o formulário
export function PaymentCompanyGate({ paymentCompanies, form, mutation: setEventCompanyMutation }: PaymentCompanyGateProps) {
  const {
    confirmCompanyId, setConfirmCompanyId,
    confirmCustomName, setConfirmCustomName,
    confirmCustomCnpj, setConfirmCustomCnpj,
    companyDialogOpen, setCompanyDialogOpen,
  } = form;
  const pcs = paymentCompanies;
  const selectedPc = pcs.find(c => String(c.id) === confirmCompanyId);
  const isManual = confirmCompanyId === "__manual__" || pcs.length === 0;
  // CNPJ validado pelos dígitos verificadores (08/10) — a mesma regra do
  // servidor (@shared/cnpj). No campo, o erro aparece ao sair dele ou com os
  // 14 dígitos digitados; da empresa cadastrada, assim que ela é escolhida.
  const [tocouCnpj, setTocouCnpj] = useState(false);
  const erroCnpjManual = erroDoCnpj(confirmCustomCnpj);
  const mostraErroCnpj = !!erroCnpjManual && (tocouCnpj || digitosDoCnpj(confirmCustomCnpj).length >= 14);
  const erroCnpjCadastrado = !isManual && selectedPc ? erroDoCnpj(selectedPc.cnpj) : null;
  const canConfirm = isManual
    ? !!confirmCustomName.trim() && !!confirmCustomCnpj.trim() && !erroCnpjManual
    : !!selectedPc && !erroCnpjCadastrado;
  const chosenName = isManual ? confirmCustomName.trim() : (selectedPc?.name || "");
  const chosenCnpj = isManual ? confirmCustomCnpj.trim() : (selectedPc?.cnpj || "");
  const handleConfirm = () => {
    if (!chosenName || !chosenCnpj) return;
    setCompanyDialogOpen(false);
    setEventCompanyMutation.mutate({ name: chosenName, cnpj: chosenCnpj });
  };

  const oQueFalta = isManual
    ? (!confirmCustomName.trim() && !confirmCustomCnpj.trim() ? "Informe o nome e o CNPJ da empresa"
      : !confirmCustomName.trim() ? "Informe o nome da empresa"
      : !confirmCustomCnpj.trim() ? "Informe o CNPJ da empresa" : (erroCnpjManual ?? ""))
    : erroCnpjCadastrado ? "O CNPJ cadastrado desta empresa não confere" : "Escolha a empresa pagadora";

  return (
    <section
      aria-labelledby="nf-pagadora-titulo"
      className="pas-entra w-full max-w-[600px] mx-auto rounded-xl border border-border bg-card overflow-hidden"
      data-testid="nf-empresa-pagadora"
    >
      {/* Por que esta tela aparece */}
      <header className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-border">
        <span aria-hidden="true" className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warning-soft text-warning-strong shrink-0">
          <Building2 className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 id="nf-pagadora-titulo" className="m-0 text-base font-semibold text-foreground">Confirme a empresa pagadora</h2>
          <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
            Necessária para emissão das notas fiscais: o texto de pagamento de cada nota deste evento sai com o nome e o CNPJ escolhidos aqui.
          </p>
        </div>
      </header>

      <div className="px-5 sm:px-6 py-4 space-y-3">
        {pcs.length > 0 && (
          <fieldset className="m-0 p-0 border-0 space-y-2">
            <legend className="mb-2 text-xs font-medium text-slate-700">Empresa cadastrada<RequiredMark /></legend>
            <div className="space-y-2">
              {pcs.map(c => (
                <Opcao
                  key={c.id}
                  checked={confirmCompanyId === String(c.id)}
                  onSelect={() => setConfirmCompanyId(String(c.id))}
                  titulo={c.name}
                  detalhe={`CNPJ ${c.cnpj}`}
                />
              ))}
              <Opcao
                checked={confirmCompanyId === "__manual__"}
                onSelect={() => setConfirmCompanyId("__manual__")}
                titulo="Outra empresa"
                detalhe="Informar nome e CNPJ manualmente"
                icone={<PenLine className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
              />
            </div>
            {erroCnpjCadastrado && (
              <p role="alert" className="m-0 text-xs leading-relaxed text-danger" data-testid="nf-pagadora-cnpj-cadastrado-invalido">
                O CNPJ cadastrado desta empresa ({selectedPc?.cnpj}) não é válido. Corrija o cadastro em Valores padrão (Empresas pagadoras) ou use “Outra empresa”.
              </p>
            )}
          </fieldset>
        )}

        {/* Manual entry (when no companies registered or "manual" selected) */}
        {(isManual || pcs.length === 0) && (
          <div className={cn("grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]", pcs.length > 0 && "pas-entra pt-1")}>
            <div>
              <label htmlFor="nf-pagadora-nome" className="block mb-1 text-xs font-medium text-slate-700">
                Nome da empresa<RequiredMark />
              </label>
              <input
                id="nf-pagadora-nome"
                type="text"
                value={confirmCustomName}
                onChange={e => setConfirmCustomName(e.target.value)}
                placeholder="Ex.: Produtora XYZ Ltda"
                aria-required="true"
                autoFocus={pcs.length > 0}
                className={CAMPO}
              />
            </div>
            <div>
              <label htmlFor="nf-pagadora-cnpj" className="block mb-1 text-xs font-medium text-slate-700">
                CNPJ<RequiredMark />
              </label>
              <input
                id="nf-pagadora-cnpj"
                type="text"
                inputMode="numeric"
                value={confirmCustomCnpj}
                onChange={e => setConfirmCustomCnpj(mascararCnpj(e.target.value))}
                onBlur={() => setTocouCnpj(true)}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                aria-required="true"
                aria-invalid={mostraErroCnpj || undefined}
                aria-describedby={mostraErroCnpj ? "nf-pagadora-cnpj-erro" : undefined}
                className={cn(`${CAMPO} tabular-nums`, mostraErroCnpj && "border-danger focus:border-danger focus:ring-danger/15")}
              />
              {mostraErroCnpj && (
                <p id="nf-pagadora-cnpj-erro" className="m-0 mt-1 text-xs leading-4 text-danger">{erroCnpjManual}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-3 bg-surface-muted border-t border-border">
        <p className="m-0 text-xs text-muted-foreground mr-auto">Vale para todas as notas deste evento.</p>
        <MotivoDesabilitado motivo={!canConfirm ? oQueFalta : undefined} desabilitado={!canConfirm}>
          <button
            type="button"
            disabled={!canConfirm || setEventCompanyMutation.isPending}
            onClick={() => setCompanyDialogOpen(true)}
            className="pas-alvo inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-45 disabled:cursor-not-allowed"
            data-testid="nf-pagadora-confirmar"
          >
            {setEventCompanyMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Salvando…</>
              : "Confirmar e continuar"}
          </button>
        </MotivoDesabilitado>
      </footer>

      <AlertDialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <AlertDialogContent className="sm:max-w-[460px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar empresa pagadora</AlertDialogTitle>
            <AlertDialogDescription>
              Definir esta empresa como pagadora deste evento? Essa escolha vale para todas as NFs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3.5 py-3">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-foreground truncate">{chosenName}</p>
              <p className="m-0 text-xs tabular-nums text-muted-foreground">CNPJ {chosenCnpj}</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Definir empresa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
