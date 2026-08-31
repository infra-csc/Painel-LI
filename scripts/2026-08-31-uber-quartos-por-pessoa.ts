/**
 * Migração 31/08 — o que faltava para a roteirização ser editável.
 *
 * 1. uber_groups.suggested_time / manual_time — sem separar o horário
 *    CALCULADO do ajustado À MÃO, "Refazer sugestões" recalculava tudo por
 *    cima e o trabalho de quem corrigiu o horário se perdia em silêncio.
 * 2. team_inclusions.skip_uber — quem não vai de Uber (carro próprio, já está
 *    na cidade) entrava em carro assim mesmo e gerava custo.
 * 3. hotel_room_group_members.check_in_date / check_out_date — a estadia era do
 *    grupo, e quem chega antes ou sai depois ficava com a data errada.
 *
 * Só ADICIONA colunas anuláveis (e uma booleana com default false): nenhuma
 * linha existente muda de comportamento, e rodar duas vezes não faz mal.
 *
 * Uso: DATABASE_URL=<banco> npx tsx scripts/2026-08-31-uber-quartos-por-pessoa.ts
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
const sql = neon(url);

async function main() {
  console.log("Aplicando colunas…");

  await sql`ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS suggested_time text`;
  await sql`ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS manual_time text`;
  await sql`ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS skip_uber boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE hotel_room_group_members ADD COLUMN IF NOT EXISTS check_in_date date`;
  await sql`ALTER TABLE hotel_room_group_members ADD COLUMN IF NOT EXISTS check_out_date date`;

  // O horário que já existe passa a valer como sugestão: sem isto, todo carro
  // antigo pareceria "sem cálculo" na primeira leitura da tela nova.
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM uber_groups
    WHERE suggested_time IS NULL AND manual_time IS NULL AND time IS NOT NULL
  `;
  if (count > 0) {
    await sql`
      UPDATE uber_groups SET suggested_time = time
      WHERE suggested_time IS NULL AND manual_time IS NULL AND time IS NOT NULL
    `;
    console.log(`  horário atual copiado para suggested_time em ${count} carro(s)`);
  }

  const conferencia = await sql`
    SELECT
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_name = 'uber_groups' AND column_name IN ('suggested_time','manual_time')) AS uber,
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_name = 'team_inclusions' AND column_name = 'skip_uber') AS inclusao,
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_name = 'hotel_room_group_members' AND column_name IN ('check_in_date','check_out_date')) AS quarto
  `;
  console.log("Conferência:", conferencia[0]);
  const ok = conferencia[0].uber === 2 && conferencia[0].inclusao === 1 && conferencia[0].quarto === 2;
  console.log(ok ? "OK — as 5 colunas existem." : "ATENÇÃO: alguma coluna não foi criada.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
