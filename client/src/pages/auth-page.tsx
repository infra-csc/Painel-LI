import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { AlertTriangle, ExternalLink, Shield } from "lucide-react";
import norteLogo from "@assets/image_1776349526988.png";

export default function AuthPage() {
  const { user } = useAuth();
  const [ssoError, setSsoError] = useState<"not_registered" | "not_approved" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("sso_error");
    if (err === "not_registered" || err === "not_approved") {
      setSsoError(err);
    }
  }, []);

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #e8edf8 100%)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.08)",
          padding: 40,
        }}
      >
        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-8">
          <div style={{ height: 40, overflow: "hidden", display: "flex", alignItems: "flex-start" }}>
            <img
              src={norteLogo}
              alt="Norte"
              className="object-contain object-left"
              style={{
                maxWidth: 160,
                maxHeight: 54,
                clipPath: "inset(0 0 25% 0)",
              }}
            />
          </div>
          <h1
            className="mt-3 font-bold text-gray-900"
            style={{ fontSize: 24, letterSpacing: "-0.02em" }}
          >
            Logística Interna
          </h1>
          <p className="text-sm text-gray-400 mt-1">Sistema de gestão de eventos</p>
        </div>

        {/* Erro SSO */}
        {ssoError && (
          <div className="flex items-start gap-3 p-3 mb-5 rounded-xl" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#dc2626" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#991b1b" }}>
                {ssoError === "not_registered" ? "Acesso não autorizado" : "Conta inativa"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#b91c1c" }}>
                {ssoError === "not_registered"
                  ? "Seu e-mail não está cadastrado no sistema. Solicite acesso ao administrador."
                  : "Sua conta está inativa. Entre em contato com o administrador."}
              </p>
            </div>
          </div>
        )}

        {/* Portal access notice */}
        <div
          className="flex flex-col items-center text-center gap-4 py-6 px-4 rounded-2xl"
          style={{ background: "#f0f6ff", border: "1.5px solid #bfdbfe" }}
        >
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full"
            style={{ background: "#2563eb" }}
          >
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-800" style={{ fontSize: 15 }}>
              Acesso exclusivo pelo Portal
            </p>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              O acesso a este sistema é feito apenas pelo Portal Norte. Use o link abaixo para entrar.
            </p>
          </div>
          <a
            href="https://norte-app-hub.replit.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-all duration-150"
            style={{ background: "#2563eb", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1d4ed8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#2563eb"; }}
          >
            Acessar o Portal Norte <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center space-y-1.5">
          <p className="text-xs text-gray-400 leading-relaxed">
            Problemas para acessar? Entre em contato com o administrador do sistema.
          </p>
          <p className="text-[11px] text-gray-300 font-medium">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
