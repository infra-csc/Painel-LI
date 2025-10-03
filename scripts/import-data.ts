import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import * as schema from "../shared/schema";
import * as fs from "fs";
import * as path from "path";
import ws from "ws";

// Configure WebSocket for Node.js environment
neonConfig.webSocketConstructor = ws;

// IMPORTANTE: Este script deve ser executado com a DATABASE_URL do banco de PRODUÇÃO
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function importData(filepath: string) {
  console.log("🔄 Iniciando importação dos dados para o banco de produção...\n");
  console.log(`📁 Arquivo: ${filepath}\n`);

  try {
    // Ler arquivo JSON
    const fileContent = fs.readFileSync(filepath, "utf-8");
    const exportData = JSON.parse(fileContent);

    console.log(`📅 Exportação realizada em: ${exportData.timestamp}\n`);

    // Importar na ordem correta (respeitando foreign keys)

    // 1. Users
    if (exportData.tables.users && exportData.tables.users.length > 0) {
      console.log("📥 Importando users...");
      for (const user of exportData.tables.users) {
        await db.insert(schema.users).values(user).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.users.length} usuários importados`);
    }

    // 2. Events
    if (exportData.tables.events && exportData.tables.events.length > 0) {
      console.log("📥 Importando events...");
      for (const event of exportData.tables.events) {
        await db.insert(schema.events).values(event).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.events.length} eventos importados`);
    }

    // 3. Functions
    if (exportData.tables.functions && exportData.tables.functions.length > 0) {
      console.log("📥 Importando functions...");
      for (const func of exportData.tables.functions) {
        await db.insert(schema.functions).values(func).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.functions.length} funções importadas`);
    }

    // 4. Function Users
    if (exportData.tables.functionUsers && exportData.tables.functionUsers.length > 0) {
      console.log("📥 Importando function_users...");
      for (const functionUser of exportData.tables.functionUsers) {
        await db.insert(schema.functionUsers).values(functionUser).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.functionUsers.length} atribuições importadas`);
    }

    // 5. Function Managers
    if (exportData.tables.functionManagers && exportData.tables.functionManagers.length > 0) {
      console.log("📥 Importando function_managers...");
      for (const manager of exportData.tables.functionManagers) {
        await db.insert(schema.functionManagers).values(manager).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.functionManagers.length} gerentes importados`);
    }

    // 6. Collaborators
    if (exportData.tables.collaborators && exportData.tables.collaborators.length > 0) {
      console.log("📥 Importando collaborators...");
      for (const collaborator of exportData.tables.collaborators) {
        await db.insert(schema.collaborators).values(collaborator).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.collaborators.length} colaboradores importados`);
    }

    // 7. Team Inclusions
    if (exportData.tables.teamInclusions && exportData.tables.teamInclusions.length > 0) {
      console.log("📥 Importando team_inclusions...");
      for (const inclusion of exportData.tables.teamInclusions) {
        await db.insert(schema.teamInclusions).values(inclusion).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.teamInclusions.length} inclusões importadas`);
    }

    // 8. Tickets
    if (exportData.tables.tickets && exportData.tables.tickets.length > 0) {
      console.log("📥 Importando tickets...");
      for (const ticket of exportData.tables.tickets) {
        await db.insert(schema.tickets).values(ticket).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.tickets.length} passagens importadas`);
    }

    // 9. Accommodations
    if (exportData.tables.accommodations && exportData.tables.accommodations.length > 0) {
      console.log("📥 Importando accommodations...");
      for (const accommodation of exportData.tables.accommodations) {
        await db.insert(schema.accommodations).values(accommodation).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.accommodations.length} hospedagens importadas`);
    }

    // 10. Financial
    if (exportData.tables.financial && exportData.tables.financial.length > 0) {
      console.log("📥 Importando financial...");
      for (const financial of exportData.tables.financial) {
        await db.insert(schema.financial).values(financial).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.financial.length} registros financeiros importados`);
    }

    // 11. Comments
    if (exportData.tables.comments && exportData.tables.comments.length > 0) {
      console.log("📥 Importando comments...");
      for (const comment of exportData.tables.comments) {
        await db.insert(schema.comments).values(comment).onConflictDoNothing();
      }
      console.log(`✅ ${exportData.tables.comments.length} comentários importados`);
    }

    console.log("\n✅ Importação concluída com sucesso!");
    console.log("\n📊 Resumo da importação:");
    console.log(`   - ${exportData.tables.users?.length || 0} usuários`);
    console.log(`   - ${exportData.tables.events?.length || 0} eventos`);
    console.log(`   - ${exportData.tables.functions?.length || 0} funções`);
    console.log(`   - ${exportData.tables.collaborators?.length || 0} colaboradores`);
    console.log(`   - ${exportData.tables.teamInclusions?.length || 0} inclusões de equipe`);
    console.log(`   - ${exportData.tables.tickets?.length || 0} passagens`);
    console.log(`   - ${exportData.tables.accommodations?.length || 0} hospedagens`);
    console.log(`   - ${exportData.tables.financial?.length || 0} registros financeiros`);
    console.log(`   - ${exportData.tables.comments?.length || 0} comentários`);

  } catch (error) {
    console.error("❌ Erro ao importar dados:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Pegar o arquivo como argumento ou usar o mais recente
const args = process.argv.slice(2);
let filepath: string;

if (args.length > 0) {
  filepath = args[0];
} else {
  // Buscar o arquivo mais recente na pasta exports
  const exportDir = path.join(process.cwd(), "scripts", "exports");
  const files = fs.readdirSync(exportDir).filter(f => f.endsWith(".json"));
  
  if (files.length === 0) {
    console.error("❌ Nenhum arquivo de exportação encontrado!");
    console.log("Execute primeiro: npm run export-data");
    process.exit(1);
  }

  files.sort().reverse(); // Mais recente primeiro
  filepath = path.join(exportDir, files[0]);
}

importData(filepath)
  .then(() => {
    console.log("\n✨ Processo finalizado!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro fatal:", error);
    process.exit(1);
  });
