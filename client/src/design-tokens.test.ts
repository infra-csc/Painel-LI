/**
 * Contraste dos tokens (03/11): a régua do redesign. Lê os valores reais de index.css;
 * trocar um token para um valor que reprova AA quebra aqui, e não só no olho de alguém.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "index.css"), "utf8");
const raiz = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));

function cor(nome: string): [number, number, number] {
  const m = raiz.match(new RegExp(`--${nome}: hsl\\(([\\d.]+),\\s*([\\d.]+)%,\\s*([\\d.]+)%\\)`));
  if (!m) throw new Error(`token --${nome} não encontrado`);
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
const luz = (c: number[]) => { const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a: string, b: string) => { const [x, y] = [luz(cor(a)), luz(cor(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("Marca (kit Trupp)", () => {
  const hex = (n: string) => "#" + cor(n).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  it("azul #0030CC e tinta #020817", () => {
    expect(hex("primary")).toBe("#0030CC");
    expect(hex("foreground")).toBe("#020817");
  });
});

describe("Contraste dos tokens", () => {
  it.each([
    ["foreground", "background"], ["foreground", "card"], ["primary-foreground", "primary"], ["primary", "card"], ["primary", "brand-soft"],
    ["muted-foreground", "card"], ["muted-foreground", "background"], ["muted-foreground", "muted"], ["muted-foreground", "surface-muted"],
    ["destructive-foreground", "destructive"], ["destructive", "card"],
    ["success", "success-soft"], ["warning", "warning-soft"], ["info", "info-soft"], ["danger", "danger-soft"], ["neutral", "neutral-soft"],
    ["success-strong", "card"], ["warning-strong", "card"], ["info-strong", "card"], ["danger-strong", "card"],
    ["success-strong", "background"], ["warning-strong", "background"], ["info-strong", "background"], ["danger-strong", "background"],
  ])("texto %s sobre %s: pelo menos 4,5", (a, b) => {
    expect(contraste(a, b)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([["input", "card"], ["input", "background"], ["ring", "card"], ["success-strong", "success-soft"], ["warning-strong", "warning-soft"], ["danger-strong", "danger-soft"], ["info-strong", "info-soft"]])(
    "borda ou ícone %s sobre %s: pelo menos 3", (a, b) => { expect(contraste(a, b)).toBeGreaterThanOrEqual(3); });
});
