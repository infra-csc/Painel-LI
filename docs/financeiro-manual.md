# Manual do Módulo Financeiro — Prestações de Contas

## Visão Geral

O módulo financeiro gerencia o fluxo completo de **prestações de contas** dos eventos. O processo passa por 4 telas principais e envolve dois perfis de usuário: o **RH** (responsável pelo planejamento e aprovação) e o **Responsável de Função** (responsável pelo preenchimento do realizado).

---

## Fluxo Completo

```
Escalação confirmada
      ↓
  [1. PLANEJADO]  ← RH cria o orçamento planejado
      ↓  (RH envia para o Realizado)
  [2. REALIZADO]  ← Resp. de Função preenche os valores reais
      ↓  (Resp. de Função envia para análise)
  [3. COMPARATIVO] ← RH analisa Planejado × Realizado
      ↓
  Aprovado ✅ / Devolvido 🔄 / Recusado ❌
      ↓
  [4. CONTROLE RH] ← Visão geral de todas as prestações
```

---

## Status das Prestações

| Status | Significado |
|--------|-------------|
| 🟡 **Planejamento pendente** | Escalação existe, mas o RH ainda não criou o orçamento planejado |
| 🔵 **Aguardando prestação** | Planejado criado; aguardando o Resp. de Função preencher o realizado |
| 🟠 **Prestação recebida** | Resp. de Função enviou o realizado; aguardando análise do RH |
| 🔄 **Devolvida para ajuste** | RH devolveu com observação; Resp. de Função precisa corrigir |
| ✅ **Aprovada para faturamento** | RH aprovou; processo concluído |
| ❌ **Recusada** | RH recusou a prestação |

---

## Tela 1 — Planejado

**Quem usa:** RH

**O que é:** Tela onde o RH define o orçamento previsto para cada colaborador escalado em um evento.

### Como usar

1. Selecione o **evento** no seletor no topo da tela
2. Os cards dos colaboradores escalados e confirmados aparecem automaticamente
3. Cada card exibe os valores calculados com base nos dias de trabalho:
   - **Diárias** (dias úteis e fins de semana separados)
   - **Mobilidade**
   - **Refeições** (almoço e jantar, dias úteis e fins de semana)
   - **Total final**

### Funcionalidades

| Ação | Como fazer |
|------|-----------|
| **Editar valores** | Clique no ícone de lápis ✏️ no card. Um modal abre com todos os campos editáveis |
| **Salvar alterações** | No modal de edição, clique em "Salvar Alterações" |
| **Enviar para Realizado** | Clique no ícone de envio ➤ no card individual, ou selecione vários cards e use "Enviar selecionados" |
| **Enviar todos de uma vez** | Clique no botão "Enviar todos" no topo |
| **Filtrar por função** | Use o filtro de função no cabeçalho |
| **Buscar por nome** | Use a barra de busca |

### Regras importantes

- Só aparecem colaboradores com status **confirmado ou superior** na escalação
- Após enviar para o Realizado, o card fica **bloqueado para edição** (ícone de cadeado 🔒)
- Os valores padrão (diária, mobilidade, refeições) vêm das **Configurações do sistema** e podem ser ajustados por colaborador

---

## Tela 2 — Realizado (Prestação de Contas)

**Quem usa:** Responsável de Função

**O que é:** Tela onde o Responsável de Função registra os valores reais gastos após o evento.

### Como usar

1. Selecione o **evento**
2. Os itens de prestação do seu evento aparecem listados
3. Para cada item, clique em **Editar** para preencher os valores reais:
   - Diárias realizadas
   - Mobilidade
   - Refeições (almoço/jantar, dias úteis/fins de semana)
4. Salve cada item
5. Quando todos estiverem corretos, **envie para análise do RH**

### Funcionalidades

| Ação | Como fazer |
|------|-----------|
| **Editar prestação** | Clique no ícone de lápis ✏️ no item |
| **Salvar prestação** | No modal, clique em "Salvar Prestação" |
| **Duplicar item** | Clique no ícone de duplicar 📋 (útil para colaboradores com perfil semelhante) |
| **Excluir item** | Clique no ícone de lixeira 🗑️ |
| **Enviar selecionados** | Marque os itens e clique em "Enviar selecionadas" |
| **Enviar todos** | Clique em "Enviar todas" no rodapé |

### Indicadores visuais nos itens

- **Verde** — Realizado está dentro do planejado (sem divergência)
- **Amarelo/Vermelho** — Realizado diverge do planejado (o RH verá a diferença)
- **Cadeado 🔒** — Item já enviado e bloqueado para edição
- **Devolvido 🔄** — RH devolveu; edição liberada para correção
- **Recusado ❌** — RH recusou; edição liberada para reenvio

### Regras de bloqueio

- Itens **enviados** ficam bloqueados enquanto aguardam análise
- Itens **devolvidos** ou **recusados** são desbloqueados para correção
- Após corrigir, envie novamente para análise

### Observação do RH

Se o RH devolver ou recusar, uma faixa colorida aparece no topo da tela com a mensagem/observação do RH.

---

## Tela 3 — Comparativo (Planejado × Realizado)

**Quem usa:** RH

**O que é:** Tela de análise e decisão final. O RH vê lado a lado o que foi planejado e o que foi realizado por cada colaborador, e toma a decisão formal.

### Como usar

1. Selecione o **evento**
2. Os cards de cada colaborador aparecem com:
   - Valores do **Planejado** (azul)
   - Valores do **Realizado** (verde/vermelho)
   - **Diferença** entre os dois
3. Expanda o card para ver o detalhamento por categoria (diárias, mobilidade, refeições)
4. Selecione os itens que deseja analisar
5. Tome a decisão

### Funcionalidades

| Ação | Como fazer |
|------|-----------|
| **Expandir card** | Clique na seta ▼ do card para ver o detalhamento |
| **Selecionar para análise** | Marque o checkbox do item |
| **Selecionar todos** | Clique em "Selecionar todos" |
| **Ordenar** | Ordene por maior diferença ou por maior total |
| **Aprovar** | Selecione os itens → clique em "Aprovar" → confirme |
| **Devolver para ajuste** | Selecione → "Devolver" → escreva a observação → confirme |
| **Recusar** | Selecione → "Recusar" → escreva o motivo → confirme |

### Indicadores do painel de resumo

No topo da tela aparece um resumo com:
- Total geral **Planejado**
- Total geral **Realizado**
- **Diferença** (positivo = gasto acima do planejado)
- Contadores: quantos itens aprovados / devolvidos / recusados

### Observações ao devolver ou recusar

Ao devolver ou recusar, é obrigatório escrever uma **observação** que o Responsável de Função receberá na tela do Realizado.

---

## Tela 4 — Controle RH

**Quem usa:** RH

**O que é:** Painel de controle geral que mostra **todas as prestações de contas de todos os eventos** em uma única tela, permitindo monitorar o progresso global.

### Como usar

1. A tela carrega automaticamente todas as prestações ativas
2. Use os **filtros de status** nos cards de resumo no topo para filtrar por categoria
3. A lista principal mostra evento, colaborador, função, status atual, responsável atual e data da última atividade

### Funcionalidades

| Ação | Como fazer |
|------|-----------|
| **Filtrar por status** | Clique nos cards coloridos de status no topo |
| **Ver apenas pendentes** | Padrão da tela (concluídos ficam ocultos) |
| **Ver concluídos** | Ative o filtro "Concluídos" |
| **Buscar** | Use a barra de busca por nome de colaborador ou evento |
| **Ir para detalhes** | Clique em um item para navegar diretamente ao Comparativo daquele evento |

### Visão padrão da tela

Por padrão, a tela **oculta** prestações concluídas (aprovadas e recusadas) para focar no que está pendente de ação. Para ver o histórico completo, ative o filtro "Concluídos".

### Prioridade de exibição

Os itens são ordenados por urgência:
1. **Prestação recebida** — aguardando ação do RH (prioridade máxima)
2. **Devolvida para ajuste** — aguardando correção
3. **Aguardando prestação** — colaborador ainda não enviou
4. **Planejamento pendente** — RH ainda não criou o planejado
5. **Concluídos** — aprovados e recusados (ocultos por padrão)

---

## Nota Fiscal (atualizado em 13/08/2026)

A NF é **liberada assim que o Realizado é enviado** — não é mais necessário
esperar a aprovação do Comparativo. Regras:

- Prestação **devolvida ou recusada** pausa a NF até o reenvio; nesse estado a
  aba Aprovação **bloqueia o Aprovar** da nota (o Devolver continua ativo)
- Escalados marcados como **"Não emite NF"** (definido no modal Detalhes da
  Escalação) não são cobrados — aparecem num card informativo próprio
- Lançamentos com a **mesma OC no evento** precisam ter a **mesma nota anexada**
- Fluxo da nota: `pendente → enviada → aprovada → check-in` (com devolvida/
  recusada como desvios); o servidor valida cada transição — aprovar exige
  status "enviada", check-in exige "aprovada" + data de pagamento

## Telas novas do módulo (13/08/2026)

- **Conta Corrente Flash** — saldo de Flash Benefícios por colaborador (alvo
  R$ 350 alimentação + R$ 150 mobilidade), extrato com saldo acumulado,
  crédito inicial de admissão em um clique e exportação CSV. Lançar/excluir é
  restrito a RH/admin; exclusões ficam na auditoria.
- **Regras de Cálculo** — tabelas 2026 de referência (Casa, Freela,
  Cenotécnicos Empreita, Percurseiro) e calculadora de diárias com a régua de
  deflação (até 4 dias 100% · 5º–8º 90% · 9º+ 80%). **Os valores desta tela
  são informativos** — o cálculo do Planejado usa os Valores Padrão e os
  valores por função.

## Perfis de Acesso

| Tela | RH | Responsável de Função | Outros |
|------|----|----------------------|--------|
| Planejado | ✅ Criar e editar | ✅ Visualizar | ❌ |
| Realizado | ✅ Visualizar | ✅ Preencher e enviar | ❌ |
| Comparativo | ✅ Aprovar/Devolver/Recusar | ✅ Visualizar resultado | ❌ |
| Controle RH | ✅ Acesso total | ❌ | ❌ |
| Notas Fiscais | ✅ Aprovar/Devolver/Check-in | ✅ Enviar nota | ❌ |
| Conta Corrente Flash | ✅ Lançar/excluir | 👁 Consultar | ❌ |

> Desde 13/08/2026 essas permissões são **verificadas também no servidor**
> (sessão obrigatória + papel nas ações de decisão), não apenas na interface.

---

## Dicas Práticas

- **Eventos sem escalação** não aparecem nas telas financeiras
- O RH pode editar os valores do Planejado antes de enviar; depois do envio, os valores ficam travados
- O Responsável de Função pode **duplicar itens** para agilizar o preenchimento quando vários colaboradores têm o mesmo perfil de gastos
- Ao devolver uma prestação, sempre escreva uma observação clara para o responsável saber exatamente o que corrigir
- Use o **Controle RH** como ponto de partida do dia para ver o que precisa de atenção
