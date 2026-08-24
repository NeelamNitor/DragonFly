export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateRoomCode(): string {
  const segment = () => Math.random().toString(36).slice(2, 5);
  return `${segment()}-${segment()}-${segment()}`;
}
