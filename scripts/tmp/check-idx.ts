import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query("select indexname from pg_indexes where schemaname='public' and indexname like '%_idx' order by indexname");
  console.log(r.rows.map((x: any) => x.indexname).join("\n"));
  await pool.end();
}
main();
