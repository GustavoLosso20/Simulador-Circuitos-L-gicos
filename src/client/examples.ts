import type { CircuitData, CircuitNode, GateType } from '../shared/types.js';

type N = [id: string, type: GateType, x: number, y: number, label?: string, period?: number];
type L = [fromNode: string, fromPin: number, toNode: string, toPin: number];

const build = (name: string, ns: N[], ls: L[]): CircuitData => ({
  name,
  nodes: ns.map(([id, type, x, y, label, period]) => ({ id, type, x, y, label, period }) as CircuitNode),
  wires: ls.map(([fromNode, fromPin, toNode, toPin]) => ({ fromNode, fromPin, toNode, toPin })),
});

export const EXAMPLES: Record<string, CircuitData> = {
  'Meio somador': build(
    'Meio somador',
    [
      ['a', 'INPUT', 60, 80, 'A'], ['b', 'INPUT', 60, 180, 'B'],
      ['x', 'XOR', 260, 60], ['n', 'AND', 260, 180],
      ['s', 'OUTPUT', 460, 70, 'Soma'], ['c', 'OUTPUT', 460, 190, 'Carry'],
    ],
    [['a', 0, 'x', 0], ['b', 0, 'x', 1], ['a', 0, 'n', 0], ['b', 0, 'n', 1], ['x', 0, 's', 0], ['n', 0, 'c', 0]],
  ),
  'Latch SR (NOR)': build(
    'Latch SR (NOR)',
    [
      ['r', 'INPUT', 60, 60, 'R'], ['s', 'INPUT', 60, 200, 'S'],
      ['n1', 'NOR', 280, 60], ['n2', 'NOR', 280, 200],
      ['q', 'OUTPUT', 480, 70, 'Q'], ['qn', 'OUTPUT', 480, 210, 'Q̅'],
    ],
    [['r', 0, 'n1', 0], ['n2', 0, 'n1', 1], ['s', 0, 'n2', 0], ['n1', 0, 'n2', 1], ['n1', 0, 'q', 0], ['n2', 0, 'qn', 0]],
  ),
  'Contador assíncrono de 2 bits': build(
    'Contador assíncrono de 2 bits',
    [
      ['clk', 'CLOCK', 40, 110, 'CLK', 1600],
      ['f0', 'DFF', 200, 80], ['f1', 'DFF', 420, 80],
      ['q0', 'OUTPUT', 210, 230, 'Q0'], ['q1', 'OUTPUT', 430, 230, 'Q1'],
    ],
    [
      ['clk', 0, 'f0', 1], ['f0', 1, 'f0', 0], ['f0', 1, 'f1', 1], ['f1', 1, 'f1', 0],
      ['f0', 0, 'q0', 0], ['f1', 0, 'q1', 0],
    ],
  ),
};
