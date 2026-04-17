# Spec: Tabela de Detalhes de Exames no Modal Admin

**Data:** 17/04/2026  
**Status:** Aprovado  
**Responsável:** Codex  

---

## Visão Geral

Adicionar um novo componente responsivo (`AttendanceExamsTable`) que exibe detalhes de exames (atendente e tempo de execução) no modal de detalhes do paciente, acessível pela busca no painel admin.

O componente adapta automaticamente entre:
- **Desktop/Tablet (≥768px):** Tabela com 4 colunas (Exame | Status | Atendente | Tempo)
- **Mobile (<768px):** Cards compactos em grid 2 colunas

---

## Requisitos Funcionais

### 1. Novo Componente: `AttendanceExamsTable`

**Arquivo:** `src/components/attendance-exams-table.tsx`

**Props:**
```typescript
{
  items: QueueItemRecord[]                    // Lista de exames do paciente
  profileMap: Map<string, ProfileRecord>      // Mapping de IDs de usuários para perfis
}
```

**Responsabilidades:**
- Renderizar tabela em viewport ≥768px
- Renderizar cards em viewport <768px
- Resolver nomes de atendentes via `profileMap`
- Calcular tempo de execução
- Mostrar "Pendente" para dados indisponíveis

---

### 2. Layout Desktop/Tablet (≥768px)

Tabela semântica com:

| Coluna | Conteúdo | Comportamento |
|--------|----------|---------------|
| **Exame** | Nome do exame (ex: "Panorâmica") | Texto simples, fonte semibold |
| **Status** | Badge com status (aguardando, chamado, em_atendimento, finalizado, cancelado) | Cores consistentes com `StageBadge` |
| **Atendente** | Nome do profissional ou "Pendente" | Resolvido de `queue_item.started_by` → `profileMap` |
| **Tempo** | Minutos formatados (ex: "12 min") ou "Pendente" | Cálculo: `(finished_at - started_at) / 60` |

**Estilos:**
- Usar Tailwind CSS
- Borders, padding e hover states consistentes
- Acessibilidade: `<thead>` semântico, `<tbody>`, `<tr>`, `<th>`, `<td>`

---

### 3. Layout Mobile (<768px)

Cards em layout responsivo:

**Estrutura por card:**
```
┌─────────────────────┐
│ Nome Exame | Badge  │
├─────────────────────┤
│ Atendente | Tempo   │
│ (2 cols)  | (2 cols)│
└─────────────────────┘
```

**Detalhes:**
- Cards com border e padding
- Cores de fundo leves (ex: `bg-emerald-50/40` para finalizado)
- Labels dos dados em uppercase, smaller font, e text-slate-500
- Valores em font-semibold

---

### 4. Mapeamento de Dados

#### Atendente
- Campo origem: `queue_item.started_by` (string UUID)
- Resolução: Buscar em `profileMap` usando a chave `started_by`
- Se não encontrado: Mostrar "Pendente"
- Fallback se `started_by` for null: "Pendente"

#### Tempo de Execução
- Campo origem: `queue_item.started_at` e `queue_item.finished_at`
- Cálculo: Se ambas existem: `Math.floor((new Date(finished_at) - new Date(started_at)) / 60000)` → "X min"
- Se qualquer uma for null: "Pendente"

#### Status
- Campo origem: `queue_item.status`
- Usar labels e cores existentes de `STATUS_LABELS` e styles em `StageBadge`
- Cores esperadas:
  - `aguardando`: amber
  - `chamado`: sky
  - `em_atendimento`: emerald
  - `finalizado`: emerald (lighter)
  - `cancelado`: rose

---

### 5. Integração no Admin Dashboard

**Localização:** Dentro do componente `SearchResultCard` (ou similar) do admin, ao expandir detalhes do paciente

**Substituição:**
```tsx
// Antes:
<AttendanceTimeline items={orderedItems} title="Exames vinculados" />

// Depois:
<AttendanceExamsTable 
  items={orderedItems} 
  profileMap={profileMap}
/>
```

O `profileMap` já é passado para componentes do admin (conforme linha 1824 do admin-dashboard.tsx), então está disponível.

---

### 6. Responsividade

**Breakpoint:** `md:` (768px) do Tailwind

```tsx
<div className="hidden md:block">
  {/* Tabela Desktop/Tablet */}
</div>

<div className="block md:hidden">
  {/* Cards Mobile */}
</div>
```

---

## Critérios de Aceite

- ✅ Componente criado em `src/components/attendance-exams-table.tsx`
- ✅ Tabela renderizada corretamente em desktop/tablet
- ✅ Cards renderizados corretamente em mobile
- ✅ Atendente resolvido corretamente via `profileMap`
- ✅ Tempo de execução calculado e formatado em minutos
- ✅ "Pendente" exibido para dados ausentes
- ✅ Cores de status consistentes com o projeto
- ✅ Integrado no modal de detalhes do admin
- ✅ Sem erros TypeScript
- ✅ Funciona com diferentes estados de exames (finalizado, em andamento, aguardando, cancelado)

---

## Entregáveis

1. **Novo componente:** `src/components/attendance-exams-table.tsx`
2. **Modificação:** `src/components/admin-dashboard.tsx` (substituir `AttendanceTimeline` pela nova tabela)
3. **Testes manuais no painel admin:**
   - Buscar paciente com exames completos
   - Expandir modal e verificar tabela/cards
   - Redimensionar viewport e verificar transição responsive
   - Verificar diferentes estados de exames

---

## Considerações Técnicas

- **Reutilização:** O componente pode ser reutilizado em outras views do admin no futuro (ex: relatórios)
- **Performance:** Usar memoização se `profileMap` for grande (React.memo)
- **Timezone:** Cálculos de tempo já respeitam o timezone do projeto (America/Manaus)
- **Não quebra:** AttendanceTimeline continua existindo para uso em outras partes (ex: recepção, atendimento)

---

## How to Test

1. Fazer login como admin
2. Ir para aba "Busca" no admin
3. Buscar um paciente com exames completos e parcialmente completos
4. Clicar em "Ver detalhes"
5. Verificar se a tabela (desktop) ou cards (mobile) aparecem
6. Validar:
   - Nomes dos atendentes aparecem corretamente
   - Tempo de execução mostra minutos
   - Exames incompletos mostram "Pendente"
   - Cores de status estão corretas
   - Layout responsivo funciona
