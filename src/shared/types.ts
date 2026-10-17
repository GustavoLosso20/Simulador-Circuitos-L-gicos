/** Tipos compartilhados entre front-end, motor de simulação e back-end. */

export const GATE_TYPES = [
  'INPUT', 'OUTPUT', 'CLOCK',
  'AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR',
  'DFF', 'JKFF',
] as const;

export type GateType = (typeof GATE_TYPES)[number];

export interface CircuitNode {
  id: string;
  type: GateType;
  x: number;
  y: number;
  label?: string;
  /** Estado da chave (somente INPUT). */
  value?: boolean;
  /** Período completo do clock em ms (somente CLOCK). */
  period?: number;
}

/** Conexão: saída `fromPin` de `fromNode` → entrada `toPin` de `toNode`. */
export interface Wire {
  fromNode: string;
  fromPin: number;
  toNode: string;
  toPin: number;
}

export interface CircuitData {
  name: string;
  nodes: CircuitNode[];
  wires: Wire[];
}

export interface PinSpec {
  inputs: string[];
  outputs: string[];
}

export const PINS: Record<GateType, PinSpec> = {
  INPUT:  { inputs: [], outputs: [''] },
  OUTPUT: { inputs: [''], outputs: [] },
  CLOCK:  { inputs: [], outputs: [''] },
  AND:    { inputs: ['', ''], outputs: [''] },
  OR:     { inputs: ['', ''], outputs: [''] },
  NOT:    { inputs: [''], outputs: [''] },
  NAND:   { inputs: ['', ''], outputs: [''] },
  NOR:    { inputs: ['', ''], outputs: [''] },
  XOR:    { inputs: ['', ''], outputs: [''] },
  DFF:    { inputs: ['D', 'CLK'], outputs: ['Q', 'Q̅'] },
  JKFF:   { inputs: ['J', 'K', 'CLK'], outputs: ['Q', 'Q̅'] },
};
