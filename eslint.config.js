// ESLint (23/09). Até aqui o projeto tinha 20 comentários `eslint-disable`
// e nenhum ESLint instalado: as regras de hooks não eram verificadas em lugar
// nenhum. Duas frentes:
//  1. react-hooks: dependências de useEffect/useMemo e ordem dos hooks.
//  2. Design system: cores hex, `style={{}}` e tamanhos de fonte arbitrários
//     em .tsx contornam os tokens (940 hex e 2.387 `text-[Npx]` na auditoria).
//     Começam como AVISO para não travar o time; viram erro quando a base
//     estiver limpa.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "attached_assets/**", "scripts/tmp/**", "migrations/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      // Design system: tokens, não valores soltos (ver client/src/index.css).
      "no-restricted-syntax": [
        "warn",
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Cor hex em className: use um token (bg-primary, text-muted-foreground, bg-brand-soft…).",
        },
        {
          selector: "JSXAttribute[name.name='className'] TemplateLiteral > TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "Cor hex em className: use um token.",
        },
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/text-\\[(?:[0-9]|10)(?:\\.5)?px\\]/]",
          message: "Fonte abaixo de 11px é ilegível (WCAG). Use a escala: text-xs (12), text-[11px] só em rótulos.",
        },
      ],
    },
  },
  {
    files: ["server/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off", "no-console": "off" },
  },
);
