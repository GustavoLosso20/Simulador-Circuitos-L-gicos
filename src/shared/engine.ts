import { PINS, type CircuitNode, type Wire } from './types.js';

/**
 * Motor de simulação lógica (independente de DOM e de Node).
 *  - Lógica combinacional: propagação iterativa até estabilizar (suporta realimentação, ex.: latch SR).
 *  - Lógica sequencial: flip-flops disparados por borda de subida; todos os FFs amostram
 *    suas entradas antes de qualquer saída mudar (registradores de deslocamento funcionam).
 *  - Contadores assíncronos (ripple): novas bordas geradas por Q são processadas em rodadas seguintes.
 */
export class Simulator {
  nodes: CircuitNode[] = [];
  wires: Wire[] = [];

  private byId = new Map<string, CircuitNode>();
  private inWire = new Map<string, Wire>();
  private outputs = new Map<string, boolean[]>();
  private q = new Map<string, boolean>();
  private prevClk = new Map<string, boolean>();
  private clocks = new Map<string, { level: boolean; last: number }>();

  /** Informa ao motor a topologia atual (chamar após adicionar/remover nós ou fios). */
  rebuild(nodes: CircuitNode[], wires: Wire[]): void {
    this.nodes = nodes;
    this.wires = wires;
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    this.inWire = new Map(wires.map((w) => [`${w.toNode}:${w.toPin}`, w]));
    this.evaluate();
  }

  /** Zera flip-flops e clocks. */
  reset(): void {
    this.q.clear();
    this.prevClk.clear();
    this.clocks.clear();
    this.outputs.clear();
    this.evaluate();
  }

  pin(nodeId: string, pin: number): boolean {
    return this.outputs.get(nodeId)?.[pin] ?? false;
  }

  input(n: CircuitNode, pin: number): boolean {
    const w = this.inWire.get(`${n.id}:${pin}`);
    return w ? this.pin(w.fromNode, w.fromPin) : false;
  }

  wireValue(w: Wire): boolean {
    return this.pin(w.fromNode, w.fromPin);
  }

  /** Avança os clocks segundo o tempo `now` (ms). Retorna true se algum mudou. */
  update(now: number): boolean {
    let toggled = false;
    for (const n of this.nodes) {
      if (n.type !== 'CLOCK') continue;
      const c = this.clocks.get(n.id) ?? { level: false, last: now };
      if (now - c.last >= (n.period ?? 1000) / 2) {
        c.level = !c.level;
        c.last = now;
        toggled = true;
      }
      this.clocks.set(n.id, c);
    }
    if (toggled) this.evaluate();
    return toggled;
  }

  /** Inverte todos os clocks uma vez (execução passo a passo). */
  stepClocks(): void {
    for (const n of this.nodes) {
      if (n.type !== 'CLOCK') continue;
      const c = this.clocks.get(n.id) ?? { level: false, last: 0 };
      c.level = !c.level;
      this.clocks.set(n.id, c);
    }
    this.evaluate();
  }

  syncTimers(now: number): void {
    for (const c of this.clocks.values()) c.last = now;
  }

  /** Recalcula todo o circuito (chamar após alterar uma chave). */
  evaluate(): void {
    for (let round = 0; round < 16; round++) {
      this.settle();
      const pending = new Map<string, boolean>();
      for (const n of this.nodes) {
        if (n.type !== 'DFF' && n.type !== 'JKFF') continue;
        const clkPin = n.type === 'DFF' ? 1 : 2;
        const level = this.input(n, clkPin);
        const prev = this.prevClk.get(n.id) ?? level;
        this.prevClk.set(n.id, level);
        if (!(level && !prev)) continue;
        const s = this.q.get(n.id) ?? false;
        if (n.type === 'DFF') {
          pending.set(n.id, this.input(n, 0));
        } else {
          const j = this.input(n, 0), k = this.input(n, 1);
          pending.set(n.id, j && k ? !s : j ? true : k ? false : s);
        }
      }
      if (pending.size === 0) return;
      for (const [id, v] of pending) this.q.set(id, v);
    }
    this.settle();
  }

  private settle(): void {
    for (let i = 0; i < 64; i++) {
      let changed = false;
      for (const n of this.nodes) {
        const next = this.compute(n);
        const prev = this.outputs.get(n.id);
        if (!prev || next.length !== prev.length || next.some((v, k) => v !== prev[k])) {
          this.outputs.set(n.id, next);
          changed = true;
        }
      }
      if (!changed) return;
    }
  }

  private compute(n: CircuitNode): boolean[] {
    const a = PINS[n.type].inputs.length > 0 ? this.input(n, 0) : false;
    const b = PINS[n.type].inputs.length > 1 ? this.input(n, 1) : false;
    switch (n.type) {
      case 'INPUT':  return [!!n.value];
      case 'CLOCK':  return [this.clocks.get(n.id)?.level ?? false];
      case 'OUTPUT': return [];
      case 'AND':    return [a && b];
      case 'OR':     return [a || b];
      case 'NOT':    return [!a];
      case 'NAND':   return [!(a && b)];
      case 'NOR':    return [!(a || b)];
      case 'XOR':    return [a !== b];
      case 'DFF':
      case 'JKFF': {
        const s = this.q.get(n.id) ?? false;
        return [s, !s];
      }
    }
  }
}
