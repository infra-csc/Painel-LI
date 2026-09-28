/**
 * Campos da empreita por empresa (dono, 10/09): empresa, quantidade de
 * pessoas (só informativa) e valor total sem centavos. Substituem a escolha
 * de colaborador quando o modo "Empreita" está ligado.
 * (25/09 — extraído de inclusion-details-dialog.tsx)
 */
import { validarEmpreita } from "@shared/cenotecnica-empreita";
import { RequiredMark } from "@/components/forms/required-mark";
import type { ModalData } from "../scaling-utils";

export function EmpreitaCampos({ modalData, setModalData, disabled }: {
  modalData: ModalData;
  setModalData: React.Dispatch<React.SetStateAction<ModalData>>;
  disabled?: boolean;
}) {
  const campo = "w-full px-3 py-2 text-sm border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60";
  const rotulo = "text-2xs font-semibold text-slate-600";
  const erro = validarEmpreita({
    empresa: modalData.empreitaEmpresa,
    pessoas: Number(modalData.empreitaPessoas || ""),
    valorCents: Math.round(Number(modalData.empreitaValor || "") * 100),
  });
  return (
    <div className="space-y-2.5 rounded-xl border border-primary/25 bg-brand-soft/40 p-3" data-testid="empreita-campos">
      <div className="space-y-1">
        <label htmlFor="empreita-empresa" className={rotulo}>Empresa<RequiredMark /></label>
        <input id="empreita-empresa" type="text" maxLength={120} value={modalData.empreitaEmpresa} disabled={disabled}
          placeholder="Nome da empresa que fornece a equipe"
          onChange={(e) => setModalData(prev => ({ ...prev, empreitaEmpresa: e.target.value }))} className={campo} data-testid="input-empreita-empresa" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor="empreita-pessoas" className={rotulo}>Pessoas<RequiredMark /></label>
          <input id="empreita-pessoas" type="number" min={1} step={1} inputMode="numeric" value={modalData.empreitaPessoas} disabled={disabled}
            onChange={(e) => setModalData(prev => ({ ...prev, empreitaPessoas: e.target.value }))} className={campo} data-testid="input-empreita-pessoas" />
        </div>
        <div className="space-y-1">
          <label htmlFor="empreita-valor" className={rotulo}>Valor total (R$)<RequiredMark /></label>
          <input id="empreita-valor" type="number" min={0} step={1} inputMode="numeric" value={modalData.empreitaValor} disabled={disabled}
            placeholder="sem centavos"
            onChange={(e) => setModalData(prev => ({ ...prev, empreitaValor: e.target.value }))} className={`${campo} tabular-nums`} data-testid="input-empreita-valor" />
        </div>
      </div>
      <p className="text-2xs text-muted-foreground">Sem passagem e hospedagem — a empresa se vira. O valor entra no Planejado como custo fechado da vaga; a quantidade de pessoas é só informativa.</p>
      {erro && <p className="text-2xs text-warning" role="status" data-testid="empreita-erro">{erro}</p>}
    </div>
  );
}
