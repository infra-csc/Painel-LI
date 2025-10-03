import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import * as schema from "../shared/schema";
import * as fs from "fs";
import * as path from "path";
import ws from "ws";

// Configure WebSocket for Node.js environment
neonConfig.webSocketConstructor = ws;

// Conecta ao banco de desenvolvimento
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function exportData() {
  console.log("🔄 Iniciando exportação dos dados do banco de desenvolvimento...\n");

  const exportData: any = {
    timestamp: new Date().toISOString(),
    tables: {},
  };

  try {
    // 1. Users
    console.log("📥 Exportando users...");
    const usersData = await db.select().from(schema.users);
    exportData.tables.users = usersData;
    console.log(`✅ ${usersData.length} usuários exportados`);

    // 2. Events
    console.log("📥 Exportando events...");
    const eventsData = await db.select().from(schema.events);
    exportData.tables.events = eventsData;
    console.log(`✅ ${eventsData.length} eventos exportados`);

    // 3. Functions
    console.log("📥 Exportando functions...");
    const functionsData = await db.select().from(schema.functions);
    exportData.tables.functions = functionsData;
    console.log(`✅ ${functionsData.length} funções exportadas`);

    // 4. Function Users
    console.log("📥 Exportando function_users...");
    const functionUsersData = await db.select().from(schema.functionUsers);
    exportData.tables.functionUsers = functionUsersData;
    console.log(`✅ ${functionUsersData.length} atribuições de usuários às funções exportadas`);

    // 5. Function Managers
    console.log("📥 Exportando function_managers...");
    const functionManagersData = await db.select().from(schema.functionManagers);
    exportData.tables.functionManagers = functionManagersData;
    console.log(`✅ ${functionManagersData.length} gerentes de função exportados`);

    // 6. Collaborators
    console.log("📥 Exportando collaborators...");
    const collaboratorsData = await db.select().from(schema.collaborators);
    exportData.tables.collaborators = collaboratorsData;
    console.log(`✅ ${collaboratorsData.length} colaboradores exportados`);

    // 7. Team Inclusions
    console.log("📥 Exportando team_inclusions...");
    const teamInclusionsData = await db.select().from(schema.teamInclusions);
    exportData.tables.teamInclusions = teamInclusionsData;
    console.log(`✅ ${teamInclusionsData.length} inclusões de equipe exportadas`);

    // 8. Tickets
    console.log("📥 Exportando tickets...");
    const ticketsData = await db.select().from(schema.tickets);
    exportData.tables.tickets = ticketsData;
    console.log(`✅ ${ticketsData.length} passagens exportadas`);

    // 9. Accommodations
    console.log("📥 Exportando accommodations...");
    const accommodationsData = await db.select().from(schema.accommodations);
    exportData.tables.accommodations = accommodationsData;
    console.log(`✅ ${accommodationsData.length} hospedagens exportadas`);

    // 10. Financial
    console.log("📥 Exportando financial...");
    const financialData = await db.select().from(schema.financial);
    exportData.tables.financial = financialData;
    console.log(`✅ ${financialData.length} registros financeiros exportados`);

    // 11. Comments
    console.log("📥 Exportando comments...");
    const commentsData = await db.select().from(schema.comments);
    exportData.tables.comments = commentsData;
    console.log(`✅ ${commentsData.length} comentários exportados`);

    // Salvar em arquivo JSON
    const exportDir = path.join(process.cwd(), "scripts", "exports");
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = `database-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filepath = path.join(exportDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

    console.log("\n✅ Exportação concluída com sucesso!");
    console.log(`📁 Arquivo salvo em: ${filepath}`);
    console.log("\n📊 Resumo da exportação:");
    console.log(`   - ${exportData.tables.users.length} usuários`);
    console.log(`   - ${exportData.tables.events.length} eventos`);
    console.log(`   - ${exportData.tables.functions.length} funções`);
    console.log(`   - ${exportData.tables.collaborators.length} colaboradores`);
    console.log(`   - ${exportData.tables.teamInclusions.length} inclusões de equipe`);
    console.log(`   - ${exportData.tables.tickets.length} passagens`);
    console.log(`   - ${exportData.tables.accommodations.length} hospedagens`);
    console.log(`   - ${exportData.tables.financial.length} registros financeiros`);
    console.log(`   - ${exportData.tables.comments.length} comentários`);

  } catch (error) {
    console.error("❌ Erro ao exportar dados:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

exportData()
  .then(() => {
    console.log("\n✨ Processo finalizado!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro fatal:", error);
    process.exit(1);
  });
