import { AlertCircle, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        // Ícone pela variante (23/09): sucesso e erro se distinguem também
        // pela forma, não só pela cor.
        const Icone = props.variant === "success" ? CheckCircle2 : props.variant === "destructive" ? AlertCircle : null
        return (
          <Toast key={id} {...props}>
            {Icone && <Icone className="h-5 w-5 shrink-0 self-start" aria-hidden="true" />}
            {/* min-w-0: sem isto o texto não encolhe e o botão de ação
                espremia o título em três linhas. */}
            <div className="grid gap-1 min-w-0 flex-1">
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
