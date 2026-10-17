import { Schema, model } from 'mongoose';
import { GATE_TYPES, PINS, type GateType } from '../../shared/types.js';

const NodeSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 64 },
    type: { type: String, required: true, enum: [...GATE_TYPES] },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    label: { type: String, maxlength: 32 },
    value: Boolean,
    period: { type: Number, min: 50, max: 600000 },
  },
  { _id: false },
);

const WireSchema = new Schema(
  {
    fromNode: { type: String, required: true },
    fromPin: { type: Number, required: true, min: 0 },
    toNode: { type: String, required: true },
    toPin: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/** O circuito é armazenado como um grafo: nós (componentes) + arestas (fios). */
const CircuitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nodes: { type: [NodeSchema], default: [] },
    wires: { type: [WireSchema], default: [] },
  },
  { timestamps: true },
);

// Integridade do grafo: IDs únicos, fios ligados a nós e pinos existentes.
CircuitSchema.pre('validate', function () {
  const types = new Map<string, GateType>();
  for (const n of this.nodes) {
    if (types.has(n.id)) this.invalidate('nodes', `ID de componente duplicado: ${n.id}`);
    types.set(n.id, n.type as GateType);
  }
  for (const w of this.wires) {
    const from = types.get(w.fromNode);
    const to = types.get(w.toNode);
    if (!from || !to) {
      this.invalidate('wires', 'Fio conectado a componente inexistente');
    } else if (w.fromPin >= PINS[from].outputs.length || w.toPin >= PINS[to].inputs.length) {
      this.invalidate('wires', 'Fio conectado a pino inexistente');
    }
  }
});

export const Circuit = model('Circuit', CircuitSchema);
