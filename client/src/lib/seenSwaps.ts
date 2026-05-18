interface SeenEntry {
  pendingSeen?: boolean;
  respondedSeen?: boolean;
}

type SeenState = Record<string, SeenEntry>;

function storageKey(userId: string) {
  return `swap_seen_${userId}`;
}

export function getSeenState(userId: string): SeenState {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || '{}');
  } catch {
    return {};
  }
}

export function markSwapSeen(userId: string, swapId: string, phase: 'pending' | 'responded') {
  const state = getSeenState(userId);
  if (!state[swapId]) state[swapId] = {};
  if (phase === 'pending') state[swapId].pendingSeen = true;
  else state[swapId].respondedSeen = true;
  localStorage.setItem(storageKey(userId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('swapSeenUpdated'));
}

export function isSwapPhaseSeen(userId: string, swapId: string, phase: 'pending' | 'responded'): boolean {
  const state = getSeenState(userId);
  if (phase === 'pending') return !!state[swapId]?.pendingSeen;
  return !!state[swapId]?.respondedSeen;
}
