import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import type { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TAMANHO_MINIMO = 8;

/**
 * Troca de senha obrigatória (23/09). Quando o usuário está com
 * `mustChangePassword`, o servidor responde 403 para a API inteira até ele
 * trocar a senha pelo `PATCH /api/users/:id` (o próprio id) com
 * `{ currentPassword, newPassword }`. Este diálogo cobre o app enquanto
 * `precisaTrocarSenha` (use-auth.tsx) for true: não fecha por Esc, clique fora
 * nem pelo "X" — a única saída é trocar a senha ou sair da conta.
 */
export default function TrocarSenhaObrigatoria() {
  const { user, precisaTrocarSenha, senhaTrocada, logout } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (!user || !precisaTrocarSenha) return null;

  const validar = (): string | null => {
    if (!senhaAtual) return "Informe a senha atual.";
    if (novaSenha.length < TAMANHO_MINIMO) return `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`;
    if (novaSenha === senhaAtual) return "A nova senha precisa ser diferente da atual.";
    if (novaSenha !== confirmacao) return "A confirmação não coincide com a nova senha.";
    return null;
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const invalido = validar();
    if (invalido) { setErro(invalido); return; }
    setErro(null);
    setSalvando(true);
    try {
      const res = await apiRequest("PATCH", `/api/users/${user.id}`, {
        currentPassword: senhaAtual,
        newPassword: novaSenha,
      });
      const atualizado = (await res.json().catch(() => null)) as User | null;
      // Tudo que falhou com 403 enquanto a senha era provisória recarrega.
      await queryClient.invalidateQueries();
      senhaTrocada(atualizado ?? undefined);
      setSenhaAtual(""); setNovaSenha(""); setConfirmacao("");
    } catch (err) {
      setErro(apiErrorMessage(err, "Não foi possível trocar a senha. Tente de novo."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        // O DialogContent padrão traz o "X" (único <button> filho direto);
        // aqui ele é escondido porque não existe "depois" sem trocar a senha.
        className="max-w-md [&>button]:hidden"
        onEscapeKeyDown={(ev) => ev.preventDefault()}
        onPointerDownOutside={(ev) => ev.preventDefault()}
        onInteractOutside={(ev) => ev.preventDefault()}
        data-testid="dialog-trocar-senha-obrigatoria"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </span>
            <DialogTitle>Troque sua senha para continuar</DialogTitle>
          </div>
          <DialogDescription>
            Sua senha atual é provisória. Defina uma nova senha com pelo menos {TAMANHO_MINIMO} caracteres — até lá, o Painel fica bloqueado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="troca-senha-atual">Senha atual</Label>
            <Input
              id="troca-senha-atual"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={senhaAtual}
              onChange={(ev) => setSenhaAtual(ev.target.value)}
              disabled={salvando}
              data-testid="input-senha-atual"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="troca-nova-senha">Nova senha</Label>
            <Input
              id="troca-nova-senha"
              type="password"
              autoComplete="new-password"
              minLength={TAMANHO_MINIMO}
              value={novaSenha}
              onChange={(ev) => setNovaSenha(ev.target.value)}
              disabled={salvando}
              data-testid="input-nova-senha"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="troca-confirmar-senha">Confirmar nova senha</Label>
            <Input
              id="troca-confirmar-senha"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(ev) => setConfirmacao(ev.target.value)}
              disabled={salvando}
              data-testid="input-confirmar-senha"
            />
          </div>

          {erro && (
            <p role="alert" className="text-sm text-destructive" data-testid="text-erro-troca-senha">
              {erro}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between sm:items-center">
            <Button type="button" variant="ghost" onClick={logout} disabled={salvando} data-testid="button-sair-troca-senha">
              Sair da conta
            </Button>
            <Button type="submit" disabled={salvando} data-testid="button-salvar-nova-senha">
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {salvando ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
