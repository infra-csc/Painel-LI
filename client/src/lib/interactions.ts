// Central rules for interaction with records based on their status
export function isReadOnly(inclusion: { status?: string }, user?: { role?: string } | null): boolean {
  // Purchasing and admin can always edit, even after saving/purchasing
  if (user?.role === 'purchasing' || user?.role === 'admin') return false;
  // Cannot edit after purchase (passagem_comprada, hospedagem_comprada, hospedagem_passagem_comprada) or if cancelled
  const purchasedStatuses = ['passagem_comprada', 'hospedagem_comprada', 'hospedagem_passagem_comprada', 'cancelado'];
  return purchasedStatuses.includes(inclusion.status || '');
}

export function canView(inclusion: { status?: string }): boolean {
  return true; // Can always view records
}

export function canEdit(inclusion: { status?: string }): boolean {
  return !isReadOnly(inclusion);
}

export function canSelectForBatch(inclusion: { status?: string }): boolean {
  return !isReadOnly(inclusion);
}

export function canDelete(inclusion: { status?: string }): boolean {
  return !isReadOnly(inclusion);
}

export function canPerformActions(inclusion: { status?: string }): boolean {
  return !isReadOnly(inclusion);
}