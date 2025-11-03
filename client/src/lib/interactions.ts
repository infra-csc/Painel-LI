// Central rules for interaction with records based on their status
export function isReadOnly(
  inclusion: { status?: string }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  if (inclusion.status === 'cancelado') return true;
  if (hasTicket) return true;
  if (hasAccommodation) return true;
  return false;
}

export function canView(inclusion: { status?: string }): boolean {
  return true; // Can always view records
}

export function canEdit(
  inclusion: { status?: string }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}

export function canSelectForBatch(
  inclusion: { status?: string }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}

export function canDelete(
  inclusion: { status?: string }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}

export function canPerformActions(
  inclusion: { status?: string }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}