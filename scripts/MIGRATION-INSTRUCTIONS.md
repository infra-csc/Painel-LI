# 📦 Guia de Migração de Dados: Desenvolvimento → Produção

Este guia explica como transferir todos os dados do banco de desenvolvimento para o banco de produção.

## 📋 Passo a Passo

### **Passo 1: Exportar Dados do Desenvolvimento**

Execute no ambiente de **desenvolvimento** (aqui no editor):

```bash
npx tsx scripts/export-data.ts
```

Isso criará um arquivo JSON com todos os dados em:
```
scripts/exports/database-export-[DATA-HORA].json
```

O arquivo conterá:
- ✅ 298+ colaboradores (com CPF e RG)
- ✅ Todos os usuários
- ✅ Todos os eventos
- ✅ Todas as funções
- ✅ Todas as inclusões de equipe
- ✅ Todas as passagens
- ✅ Todas as hospedagens
- ✅ Todos os registros financeiros
- ✅ Todos os comentários

---

### **Passo 2: Publicar a Aplicação**

1. Clique no botão **"Publish"** no topo do Replit
2. Configure:
   - **Tipo**: Autoscale
   - **CPU**: Baixa
   - **RAM**: Baixa/Média
   - **Max Machines**: 1
3. Clique em **"Deploy"**
4. Aguarde a publicação finalizar

---

### **Passo 3: Acessar o Banco de Produção**

Após publicar:

1. Vá na aba **"Database"** (Banco de Dados) no painel lateral
2. Alterne para a aba **"Production"** (Produção)
3. Copie a **CONNECTION STRING** do banco de produção

---

### **Passo 4: Importar Dados para Produção**

**IMPORTANTE:** Você precisa executar o import com a connection string de PRODUÇÃO!

**Opção A - Usando o Shell do Replit:**

```bash
# Defina a variável de ambiente com a connection string de PRODUÇÃO
export DATABASE_URL="postgresql://[SUA-CONNECTION-STRING-DE-PRODUCAO]"

# Execute o script de importação
npx tsx scripts/import-data.ts
```

**Opção B - Importar arquivo específico:**

```bash
export DATABASE_URL="postgresql://[SUA-CONNECTION-STRING-DE-PRODUCAO]"
npx tsx scripts/import-data.ts scripts/exports/database-export-2025-01-15.json
```

---

## ⚠️ Avisos Importantes

1. **Não execute o import com DATABASE_URL de desenvolvimento** - Isso não vai funcionar!
2. **O banco de produção deve estar vazio** - O script usa `.onConflictDoNothing()` para evitar duplicatas
3. **Faça backup** - Sempre bom ter o arquivo JSON guardado
4. **Teste após importar** - Acesse a aplicação publicada e verifique se os dados estão lá

---

## 🔄 Se Precisar Migrar Novamente

Para atualizar dados após novas alterações:

1. Execute novamente o **export** no desenvolvimento
2. Execute o **import** na produção (dados duplicados serão ignorados)

---

## 🆘 Problemas Comuns

### "Error: relation does not exist"
→ Execute `npm run db:push` no ambiente de PRODUÇÃO primeiro para criar as tabelas

### "Connection timeout"
→ Verifique se a connection string de produção está correta

### "Duplicate key value violates unique constraint"
→ Normal! Significa que alguns dados já existem. O script continua importando os outros.

---

## 📊 Verificação

Após importar, você pode verificar os dados:

1. Acesse sua aplicação publicada
2. Faça login
3. Vá em "Gerenciamento de Colaboradores"
4. Você deve ver todos os 298 colaboradores!

✅ Pronto! Seus dados foram migrados com sucesso!
