/** A cloud naming/phone match cannot discard an unsent local identity. */
export class PendingSyncIdentityError extends Error {
  constructor() { super('Unacknowledged local identity requires review'); }
}
export function assertAcknowledgedIdentity(currentId: unknown, incomingId: unknown, status: unknown): void {
  if (currentId !== incomingId && (status === 'PENDING' || status === 'FAILED')) throw new PendingSyncIdentityError();
}
