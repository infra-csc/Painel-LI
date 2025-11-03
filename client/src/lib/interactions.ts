// Central rules for interaction with records based on their status
export function isReadOnly(inclusion: { status?: string }): boolean {
  return inclusion.status === 'cancelado';
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