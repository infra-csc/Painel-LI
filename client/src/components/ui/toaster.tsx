import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

/**
 * Ícone pela variante (23/09): sucesso e erro se distinguem também pela forma,
 * não só pela cor. Desde 07/10 todo toast tem ícone (o neutro é "Info"), e a
 * cor vai no ícone + filete — o cartão é sempre branco.
 */
const ICONES = {
  success: { Icone: CheckCircle2, cor: "text-success-strong" },
  destructive: { Icone: AlertCircle, cor: "text-danger-strong" },
  warning: { Icone: TriangleAlert, cor: "text-warning-strong" },
  default: { Icone: Info, cor: "text-primary" },
} as const

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const { Icone, cor } = ICONES[props.variant ?? "default"] ?? ICONES.default
        return (
          <Toast key={id} {...props}>
            <Icone className={`h-5 w-5 shrink-0 mt-px ${cor}`} aria-hidden="true" />
            {/* min-w-0: sem isto o texto não encolhe e o botão de ação
                espremia o título em três linhas. */}
            <div className="grid gap-0.5 min-w-0 flex-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
