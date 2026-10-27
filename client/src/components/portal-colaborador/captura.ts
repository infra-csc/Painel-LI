/**
 * Câmera e GPS do celular para o check-in/check-out.
 *
 * A foto do celular passa fácil de 4–8 MB. No sinal da arena isso não sobe
 * (e o servidor recusa acima de 8 MB). Aqui ela é reduzida NO NAVEGADOR para
 * um JPG de no máximo 1280 px no lado maior, qualidade 0,8 (~150–300 KB).
 */

export const LADO_MAXIMO = 1280;
export const QUALIDADE_JPG = 0.8;
const LIMITE_DO_SERVIDOR = 8 * 1024 * 1024;

/** Tamanho final mantendo a proporção (nunca aumenta). */
export function medidasReduzidas(largura: number, altura: number, lado = LADO_MAXIMO): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (!maior || maior <= lado) return { largura, altura };
  const f = lado / maior;
  return { largura: Math.round(largura * f), altura: Math.round(altura * f) };
}

async function decodificar(arquivo: Blob): Promise<{ origem: CanvasImageSource; largura: number; altura: number; liberar: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image": respeita a rotação EXIF (selfie de pé não vira deitada).
      const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
      return { origem: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() };
    } catch {
      // cai para o <img> (Safari antigo)
    }
  }
  const url = URL.createObjectURL(arquivo);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("nao_decodificou");
  }
  return { origem: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
}

/**
 * A selfie pronta para enviar: JPG reduzido. Se o navegador não conseguir
 * reduzir mas o arquivo original já servir (JPG/PNG até 8 MB), vai o original.
 */
export async function prepararFoto(arquivo: File | Blob): Promise<Blob> {
  try {
    const img = await decodificar(arquivo);
    try {
      const { largura, altura } = medidasReduzidas(img.largura, img.altura);
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("sem_canvas");
      ctx.drawImage(img.origem, 0, 0, largura, altura);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE_JPG));
      if (!blob) throw new Error("sem_blob");
      return blob;
    } finally {
      img.liberar();
    }
  } catch {
    if ((arquivo.type === "image/jpeg" || arquivo.type === "image/png") && arquivo.size <= LIMITE_DO_SERVIDOR) return arquivo;
    throw new Error("Não consegui ler essa foto. Tire outra.");
  }
}

export type ResultadoDaLocalizacao =
  | { ok: true; lat: number; lng: number; precisao: number | null }
  | { ok: false; motivo: "negada" | "indisponivel" | "tempo" | "sem_suporte" };

/** Pede a localização uma vez, com prazo curto. Nunca rejeita: sem GPS, o check-in segue sem. */
export function obterLocalizacao(prazoMs = 8000): Promise<ResultadoDaLocalizacao> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({ ok: false, motivo: "sem_suporte" });
  return new Promise((resolve) => {
    let resolvido = false;
    const fim = (r: ResultadoDaLocalizacao) => { if (!resolvido) { resolvido = true; resolve(r); } };
    // Alguns navegadores ignoram o `timeout` enquanto o pedido de permissão está na tela.
    const relogio = setTimeout(() => fim({ ok: false, motivo: "tempo" }), prazoMs + 1500);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(relogio); fim({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null }); },
      (err) => { clearTimeout(relogio); fim({ ok: false, motivo: err.code === 1 ? "negada" : err.code === 3 ? "tempo" : "indisponivel" }); },
      { enableHighAccuracy: true, timeout: prazoMs, maximumAge: 2 * 60_000 },
    );
  });
}
