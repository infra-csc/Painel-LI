/**
 * Reduz a foto da câmera no navegador antes de enviar (27/10): a foto de um
 * celular passa fácil de 4 MB e o servidor aceita até 8 MB de JPG/PNG. Lado
 * maior em até 1280 px, JPEG 82% — sobra nitidez para conferir o rosto e o
 * uniforme e o envio cabe numa rede ruim de arena.
 *
 * Se o navegador não conseguir ler a imagem (HEIC no desktop, arquivo
 * corrompido), devolve o arquivo original: quem decide se aceita é o servidor
 * (que responde "A foto tem que ser JPG ou PNG").
 */
export const LADO_MAXIMO = 1280;
const QUALIDADE = 0.82;

async function carregar(arquivo: File): Promise<{ largura: number; altura: number; desenhar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; liberar: () => void }> {
  if (typeof createImageBitmap === "function") {
    // `imageOrientation: "from-image"` respeita a rotação EXIF da câmera.
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return { largura: bmp.width, altura: bmp.height, desenhar: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), liberar: () => bmp.close() };
  }
  const url = URL.createObjectURL(arquivo);
  const img = new Image();
  await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error("imagem")); img.src = url; });
  return { largura: img.naturalWidth, altura: img.naturalHeight, desenhar: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), liberar: () => URL.revokeObjectURL(url) };
}

/** Medidas finais para caber em `lado` mantendo a proporção. */
export function medidasReduzidas(largura: number, altura: number, lado = LADO_MAXIMO): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= lado) return { largura, altura };
  const f = lado / maior;
  return { largura: Math.round(largura * f), altura: Math.round(altura * f) };
}

export async function reduzirImagem(arquivo: File): Promise<File> {
  try {
    const fonte = await carregar(arquivo);
    try {
      const { largura, altura } = medidasReduzidas(fonte.largura, fonte.altura);
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) return arquivo;
      fonte.desenhar(ctx, largura, altura);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE));
      if (!blob) return arquivo;
      // Já pequena e em JPG/PNG: manda a original se a reduzida não ficou menor.
      if (blob.size >= arquivo.size && /^image\/(jpeg|png)$/.test(arquivo.type)) return arquivo;
      return new File([blob], "selfie.jpg", { type: "image/jpeg" });
    } finally {
      fonte.liberar();
    }
  } catch {
    return arquivo;
  }
}
