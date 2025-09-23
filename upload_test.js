// Script para processar os 10 primeiros colaboradores do CSV
import fs from 'fs';

// Ler o arquivo CSV
const csvContent = fs.readFileSync('attached_assets/Coloabores_AppLI_1758658119067.csv', 'utf8');
const lines = csvContent.split('\n').filter(line => line.trim());

// Função para converter data DD/MM/AAAA para YYYY-MM-DD
const convertDate = (dateStr) => {
  if (!dateStr || !dateStr.trim()) return '';
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

// Processar apenas os 10 primeiros
const collaborators = [];
for (let i = 1; i <= Math.min(11, lines.length - 1); i++) { // Pular cabeçalho, pegar 10 linhas
  const values = lines[i].split(',').map(v => v.trim());
  
  // Pular se não tem nome
  if (!values[0] || !values[0].trim()) continue;
  
  // Formato: Nome,Tipo,Documento,Telefone,Cidade,Data Nascimento
  const collaborator = {
    fullName: values[0]?.trim() || '',
    officialDocument: values[2]?.trim() || '', // usar o campo correto
    documentType: 'rg',
    type: values[1]?.trim()?.toLowerCase() || 'freela',
    phone: values[3]?.trim() || undefined,
    city: values[4]?.trim() || '',
    birthDate: convertDate(values[5]?.trim() || '') || '1990-01-01', // garantir data válida
    area: 'Geral'
  };
  
  collaborators.push(collaborator);
}

console.log('Processando', collaborators.length, 'colaboradores...');
console.log('\n=== DADOS PROCESSADOS ===');
collaborators.forEach((c, index) => {
  console.log(`${index + 1}. ${c.fullName} (${c.type.toUpperCase()}) - RG: ${c.document} - ${c.city} - ${c.phone || 'Sem tel'}`);
});

// Debug: mostrar os primeiros dados
console.log('\n=== DEBUG - PRIMEIRO COLABORADOR ===');
console.log(JSON.stringify(collaborators[0], null, 2));

// Fazer upload via API
const uploadData = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/collaborators/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ collaborators })
    });
    
    const result = await response.json();
    
    console.log('\n=== RESULTADO DO UPLOAD ===');
    console.log('Total processados:', result.totalProcessed);
    console.log('Sucessos:', result.successful);
    console.log('Falhas:', result.failed);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\nErros:');
      result.errors.forEach(error => {
        console.log(`- Linha ${error.row} (${error.name}): ${error.error}`);
      });
    }
    
  } catch (error) {
    console.error('Erro no upload:', error.message);
  }
};

uploadData();