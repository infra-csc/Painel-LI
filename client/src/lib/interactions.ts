// Central rules for interaction with records based on their status
export function isReadOnly(
  inclusion: { status?: string; needsTicket?: boolean | null }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  if (inclusion.status === 'cancelado') return true;
  
  // Se precisa de passagem, bloqueia após comprar a passagem
  if (inclusion.needsTicket === true && hasTicket) return true;
  
  // Se NÃO precisa de passagem, bloqueia após comprar a hospedagem
  if (inclusion.needsTicket === false && hasAccommodation) return true;
  
  return false;
}

export function canView(inclusion: { status?: string }): boolean {
  return true; // Can always view records
}

export function canEdit(
  inclusion: { status?: string; needsTicket?: boolean | null }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}

export function canSelectForBatch(
  inclusion: { status?: string; needsTicket?: boolean | null }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}

export function canDelete(
  inclusion: { status?: string; needsTicket?: boolean | null }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}

export function canPerformActions(
  inclusion: { status?: string; needsTicket?: boolean | null }, 
  hasTicket?: boolean, 
  hasAccommodation?: boolean
): boolean {
  return !isReadOnly(inclusion, hasTicket, hasAccommodation);
}