import type { PaymentTerminal, StatusListener, TerminalRequest, TerminalResult } from '../types.js';

/**
 * Simulated card machine: cashier training, demos and tests. The fils of the amount pick the behaviour:
 * .51 declined · .52 never answers (timeout / cancel) · .53 device error · .54 approved but the answer is lost
 * (only an inquiry finds it) · anything else approved.
 */
export class MockTerminal implements PaymentTerminal {
  readonly provider = 'MOCK' as const;
  private readonly memory = new Map<string, TerminalResult>();
  private seq = 0;

  constructor(private readonly stepMs = 700) {}

  async ping() {
    return { ok: true, message: 'Training terminal ready' };
  }

  async sale(req: TerminalRequest, signal: AbortSignal, onStatus: StatusListener): Promise<TerminalResult> {
    onStatus('Present card on the terminal');
    await this.wait(signal);
    onStatus('Authorising');
    const fils = Math.abs(req.amountMinor) % 100;
    if (fils === 52) {
      signal.addEventListener('abort', () => this.remember({ outcome: 'CANCELLED', ecrRef: req.ecrRef, amountMinor: req.amountMinor, message: 'Cancelled on the terminal' }), { once: true });
      return this.hang(signal);
    }
    await this.wait(signal);
    if (fils === 51) return this.remember({ outcome: 'DECLINED', ecrRef: req.ecrRef, amountMinor: req.amountMinor, responseCode: '05', message: 'Do not honour' });
    if (fils === 53) return { outcome: 'ERROR', ecrRef: req.ecrRef, amountMinor: req.amountMinor, message: 'Terminal error' };
    const approved = this.approve(req);
    if (fils === 54) throw new Error('Connection lost while waiting for the terminal');
    return approved;
  }

  async voidSale(req: TerminalRequest & { original: TerminalResult }, signal: AbortSignal) {
    await this.wait(signal);
    return this.approve(req);
  }

  async refund(req: TerminalRequest & { original?: TerminalResult }, signal: AbortSignal) {
    await this.wait(signal);
    return this.approve(req);
  }

  async inquire(ecrRef: string): Promise<TerminalResult> {
    return this.memory.get(ecrRef) ?? { outcome: 'UNKNOWN', ecrRef, amountMinor: 0, message: 'No such transaction on the terminal' };
  }

  async cancel() {}
  async close() {}

  private approve(req: TerminalRequest) {
    this.seq += 1;
    const n = String(this.seq).padStart(6, '0');
    return this.remember({
      outcome: 'APPROVED', ecrRef: req.ecrRef, amountMinor: req.amountMinor, authCode: n, rrn: `MOCK${n}`,
      terminalId: 'MOCK0001', maskedPan: '476173******0010', scheme: 'VISA', responseCode: '00', message: 'Approved',
    });
  }

  private remember(result: TerminalResult) {
    this.memory.set(result.ecrRef, result);
    return result;
  }

  private wait(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('aborted')); return; }
      const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, this.stepMs);
      const onAbort = () => { clearTimeout(timer); reject(new Error('aborted')); };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private hang(signal: AbortSignal) {
    return new Promise<TerminalResult>((_resolve, reject) => {
      if (signal.aborted) reject(new Error('aborted'));
      else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  }
}
