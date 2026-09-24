import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registrarZodPtBr } from "./lib/zod-pt-br";

// Mensagens de validação em pt-BR para todos os esquemas zod (uma vez só).
registrarZodPtBr();

createRoot(document.getElementById("root")!).render(<App />);
