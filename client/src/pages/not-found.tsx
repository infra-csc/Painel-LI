import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { usePageTitle } from "@/components/common/use-page-title";

export default function NotFound() {
  usePageTitle("Página não encontrada");
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center gap-4 bg-background text-foreground px-4 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        A página que você tentou acessar não existe ou foi movida.
      </p>
      <Button asChild>
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
