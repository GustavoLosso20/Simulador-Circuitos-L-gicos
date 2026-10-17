import { PINS, type CircuitData, type CircuitNode, type GateType, type Wire } from '../shared/types.js';
import { Simulator } from '../shared/engine.js';
import { EXAMPLES } from './examples.js';
import * as api from './api.js';

// ───────────────────────── DOM e estado ─────────────────────────
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const board = $<HTMLCanvasElement>('#board');
const wave = $<HTMLCanvasElement>('#wave');
const ctx = board.getContext('2d')!;
const wctx = wave.getContext('2d')!;
const nameInput = $<HTMLInputElement>('#name');
const savedSel = $<HTMLSelectElement>('#saved');
const toastEl = $<HTMLElement>('#toast');
const runBtn = $<HTMLButtonElement>('#run');

const C = {
  bg: '#eef2f5', grid: '#c9d4de', wire: '#9badbd', on: '#0b7285', node: '#ffffff',
  ink: '#1f2d3d', dim: '#5d6f82', accent: '#d9480f', led: '#f59f00',
};
const FONT = '13px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

let nodes: CircuitNode[] = [];
let wires: Wire[] = [];
let currentId: string | null = null;
let selected: string | null = null;
let selectedWire: Wire | null = null;
let running = true;

type PinRef = { node: CircuitNode; kind: 'in' | 'out'; i: number };
let link: (PinRef & { x: number; y: number }) | null = null;
let drag: { node: CircuitNode; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null = null;

const sim = new Simulator();
const HIST = 160;
const SAMPLE_MS = 80;
const history = new Map<string, boolean[]>();

const uid = () => Math.random().toString(36).slice(2, 9);
const snap = (v: number) => Math.round(v / 10) * 10;

function topologyChanged() {
  sim.rebuild(nodes, wires);
}

// ───────────────────────── Geometria ─────────────────────────
function size(n: CircuitNode) {
  switch (n.type) {
    case 'INPUT':
    case 'CLOCK': return { w: 64, h: 40 };
    case 'OUTPUT': return { w: 48, h: 48 };
    default: {
      const p = PINS[n.type];
      return { w: 84, h: Math.max(48, 26 * Math.max(p.inputs.length, p.outputs.length) + 16) };
    }
  }
}

function pinPos(n: CircuitNode, kind: 'in' | 'out', i: number) {
  const { w, h } = size(n);
  const count = (kind === 'in' ? PINS[n.type].inputs : PINS[n.type].outputs).length;
  return { x: kind === 'in' ? n.x : n.x + w, y: n.y + (h * (i + 1)) / (count + 1) };
}

function hitPin(x: number, y: number): PinRef | null {
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k];
    for (const kind of ['in', 'out'] as const) {
      const count = (kind === 'in' ? PINS[n.type].inputs : PINS[n.type].outputs).length;
      for (let i = 0; i < count; i++) {
        const p = pinPos(n, kind, i);
        if (Math.hypot(p.x - x, p.y - y) <= 9) return { node: n, kind, i };
      }
    }
  }
  return null;
}

function hitNode(x: number, y: number) {
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k];
    const { w, h } = size(n);
    if (x >= n.x && x <= n.x + w && y >= n.y && y <= n.y + h) return n;
  }
  return undefined;
}

/** Retorna o fio mais próximo do ponto (x, y), se estiver a menos de 7 px da curva. */
function wireAt(x: number, y: number): Wire | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let best: Wire | null = null;
  let bestDist = 7;
  for (const w of wires) {
    const a = byId.get(w.fromNode), b = byId.get(w.toNode);
    if (!a || !b) continue;
    const p0 = pinPos(a, 'out', w.fromPin), p3 = pinPos(b, 'in', w.toPin);
    const dx = Math.max(40, Math.abs(p3.x - p0.x) / 2);
    const p1 = { x: p0.x + dx, y: p0.y }, p2 = { x: p3.x - dx, y: p3.y };
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      const px = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const py = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      const d = Math.hypot(px - x, py - y);
      if (d < bestDist) { bestDist = d; best = w; }
    }
  }
  return best;
}

function removeWire(w: Wire) {
  wires = wires.filter((v) => v !== w);
  if (selectedWire === w) selectedWire = null;
  topologyChanged();
}

// ───────────────────────── Edição ─────────────────────────
function autoLabel(type: GateType): string | undefined {
  const used = new Set(nodes.map((n) => n.label));
  if (type === 'INPUT') {
    for (const c of 'ABCDEFGHIJKLMNOP') if (!used.has(c)) return c;
  }
  if (type === 'OUTPUT') {
    for (let i = 1; ; i++) if (!used.has(`Y${i}`)) return `Y${i}`;
  }
  if (type === 'CLOCK') return used.has('CLK') ? `CLK${nodes.filter((n) => n.type === 'CLOCK').length + 1}` : 'CLK';
  return undefined;
}

function addNode(type: GateType, x?: number, y?: number) {
  const k = nodes.length % 8;
  const n: CircuitNode = {
    id: uid(), type, x: snap(x ?? 80 + k * 24), y: snap(y ?? 60 + k * 24), label: autoLabel(type),
  };
  if (type === 'INPUT') n.value = false;
  if (type === 'CLOCK') n.period = 1000;
  nodes.push(n);
  selected = n.id;
  topologyChanged();
}

function removeNode(id: string) {
  nodes = nodes.filter((n) => n.id !== id);
  wires = wires.filter((w) => w.fromNode !== id && w.toNode !== id);
  history.delete(id);
  if (selected === id) selected = null;
  selectedWire = null;
  topologyChanged();
}

function loadData(data: CircuitData, id: string | null) {
  nodes = data.nodes.map((n) => ({ ...n }));
  wires = data.wires.map((w) => ({ ...w }));
  currentId = id;
  selected = null;
  selectedWire = null;
  nameInput.value = data.name;
  history.clear();
  sim.rebuild(nodes, wires);
  sim.reset();
  sim.syncTimers(performance.now());
}

const pos = (e: MouseEvent) => {
  const r = board.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

board.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const { x, y } = pos(e);
  const pin = hitPin(x, y);
  if (pin) {
    selectedWire = null;
    if (pin.kind === 'in') {
      const w = wires.find((v) => v.toNode === pin.node.id && v.toPin === pin.i);
      if (w) {
        // Pegar um fio já conectado: desconecta e permite religar em outro pino
        wires = wires.filter((v) => v !== w);
        topologyChanged();
        const src = nodes.find((n) => n.id === w.fromNode)!;
        link = { node: src, kind: 'out', i: w.fromPin, x, y };
        return;
      }
    }
    link = { ...pin, x, y };
    return;
  }
  const n = hitNode(x, y);
  if (n) {
    selected = n.id;
    selectedWire = null;
    drag = { node: n, dx: x - n.x, dy: y - n.y, sx: x, sy: y, moved: false };
    // traz para frente
    nodes = nodes.filter((v) => v !== n).concat(n);
    sim.rebuild(nodes, wires);
  } else {
    selected = null;
    selectedWire = wireAt(x, y);
  }
});

window.addEventListener('mousemove', (e) => {
  const { x, y } = pos(e);
  if (link) { link.x = x; link.y = y; }
  if (drag) {
    if (Math.hypot(x - drag.sx, y - drag.sy) > 3) drag.moved = true;
    if (drag.moved) {
      drag.node.x = Math.max(0, snap(x - drag.dx));
      drag.node.y = Math.max(0, snap(y - drag.dy));
    }
  }
  const over = hitPin(x, y) || hitNode(x, y) || wireAt(x, y);
  board.style.cursor = drag?.moved ? 'grabbing' : over ? 'pointer' : 'default';
});

window.addEventListener('mouseup', (e) => {
  if (link) {
    const { x, y } = pos(e);
    const target = hitPin(x, y);
    if (target && target.kind !== link.kind) {
      const out = link.kind === 'out' ? link : target;
      const inn = link.kind === 'in' ? link : target;
      wires = wires.filter((w) => !(w.toNode === inn.node.id && w.toPin === inn.i));
      wires.push({ fromNode: out.node.id, fromPin: out.i, toNode: inn.node.id, toPin: inn.i });
      topologyChanged();
    }
    link = null;
  }
  if (drag) {
    if (!drag.moved && drag.node.type === 'INPUT') {
      drag.node.value = !drag.node.value;
      sim.evaluate();
    }
    drag = null;
  }
});

board.addEventListener('dblclick', (e) => {
  const { x, y } = pos(e);
  const n = hitNode(x, y);
  if (!n) return;
  if (n.type === 'CLOCK') {
    const v = Number(prompt('Período do clock (ms):', String(n.period ?? 1000)));
    if (v >= 50) n.period = v;
  } else {
    const v = prompt('Nome do componente:', n.label ?? '');
    if (v !== null) n.label = v.slice(0, 32) || undefined;
  }
});

board.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const { x, y } = pos(e);
  const n = hitNode(x, y);
  if (n) { removeNode(n.id); return; }
  const w = wireAt(x, y);
  if (w) removeWire(w);
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedWire) removeWire(selectedWire);
    else if (selected) removeNode(selected);
  }
});

// Paleta: clique adiciona no quadro; arrastar posiciona onde soltar
document.querySelectorAll<HTMLButtonElement>('.part').forEach((b) => {
  b.addEventListener('click', () => addNode(b.dataset.type as GateType));
  b.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', b.dataset.type!));
});
board.addEventListener('dragover', (e) => e.preventDefault());
board.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer?.getData('text/plain') as GateType;
  if (type && type in PINS) addNode(type, pos(e).x - 40, pos(e).y - 24);
});

// ───────────────────────── Controles ─────────────────────────
runBtn.addEventListener('click', () => {
  running = !running;
  runBtn.textContent = running ? 'Pausar' : 'Executar';
  if (running) sim.syncTimers(performance.now());
});
$('#step').addEventListener('click', () => {
  running = false;
  runBtn.textContent = 'Executar';
  sim.stepClocks();
  sample();
});
$('#reset').addEventListener('click', () => { history.clear(); sim.reset(); sim.syncTimers(performance.now()); });
$('#clear').addEventListener('click', () => loadData({ name: 'Novo circuito', nodes: [], wires: [] }, null));

const exSel = $<HTMLSelectElement>('#examples');
for (const k of Object.keys(EXAMPLES)) exSel.add(new Option(k, k));
exSel.addEventListener('change', () => {
  if (exSel.value) loadData(structuredClone(EXAMPLES[exSel.value]), null);
  exSel.value = '';
});

// ───────────────────────── Nuvem (API REST) ─────────────────────────
let toastTimer = 0;
function toast(msg: string, error = false) {
  toastEl.textContent = msg;
  toastEl.className = error ? 'show error' : 'show';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.className = ''), 3500);
}

async function refreshList() {
  try {
    const list = await api.listCircuits();
    savedSel.replaceChildren(...list.map((c) => new Option(c.name, c._id, false, c._id === currentId)));
    if (!list.length) savedSel.add(new Option('Nenhum circuito salvo', ''));
  } catch (e) {
    toast(`Não foi possível listar circuitos: ${(e as Error).message}`, true);
  }
}

$('#save').addEventListener('click', async () => {
  const data: CircuitData = { name: nameInput.value.trim() || 'Sem título', nodes, wires };
  try {
    const saved = await api.saveCircuit(data, currentId ?? undefined);
    currentId = saved._id;
    toast('Circuito salvo');
    refreshList();
  } catch (e) { toast(`Erro ao salvar: ${(e as Error).message}`, true); }
});

$('#load').addEventListener('click', async () => {
  if (!savedSel.value) return;
  try {
    const c = await api.getCircuit(savedSel.value);
    loadData(c, c._id);
    toast('Circuito carregado');
  } catch (e) { toast(`Erro ao carregar: ${(e as Error).message}`, true); }
});

$('#delete').addEventListener('click', async () => {
  const id = savedSel.value;
  if (!id || !confirm('Excluir este circuito da nuvem?')) return;
  try {
    await api.deleteCircuit(id);
    if (id === currentId) currentId = null;
    toast('Circuito excluído');
    refreshList();
  } catch (e) { toast(`Erro ao excluir: ${(e as Error).message}`, true); }
});

// ───────────────────────── Renderização ─────────────────────────
function fit(c: HTMLCanvasElement, g: CanvasRenderingContext2D) {
  const r = c.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * d));
  const h = Math.max(1, Math.round(r.height * d));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  g.setTransform(d, 0, 0, d, 0, 0);
  return { w: r.width, h: r.height };
}

function text(s: string, x: number, y: number, color = C.ink, align: CanvasTextAlign = 'center', font = FONT) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y);
}

const SYMBOL: Partial<Record<GateType, string>> = {
  AND: '&', OR: '≥1', NOT: '1', NAND: '&', NOR: '≥1', XOR: '=1', DFF: 'D', JKFF: 'JK',
};
const NEGATED = new Set<GateType>(['NOT', 'NAND', 'NOR']);

function drawNode(n: CircuitNode) {
  const { w, h } = size(n);
  const sel = n.id === selected;
  ctx.lineWidth = sel ? 2.5 : 1.5;
  ctx.strokeStyle = sel ? C.accent : C.ink;
  ctx.fillStyle = C.node;

  if (n.type === 'OUTPUT') {
    const on = sim.input(n, 0);
    ctx.beginPath(); ctx.arc(n.x + w / 2, n.y + h / 2, 17, 0, Math.PI * 2);
    ctx.fillStyle = on ? C.led : C.node;
    if (on) { ctx.shadowColor = C.led; ctx.shadowBlur = 16; }
    ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    text(on ? '1' : '0', n.x + w / 2, n.y + h / 2, C.ink, 'center', `bold ${FONT}`);
    if (n.label) text(n.label, n.x + w / 2, n.y + h + 10);
  } else if (n.type === 'INPUT' || n.type === 'CLOCK') {
    const on = sim.pin(n.id, 0);
    ctx.beginPath(); ctx.roundRect(n.x, n.y, w, h, 6);
    ctx.fillStyle = on ? '#d3eef3' : C.node; ctx.fill(); ctx.stroke();
    if (n.type === 'INPUT') {
      text(on ? '1' : '0', n.x + w / 2, n.y + h / 2, on ? C.on : C.dim, 'center', `bold 18px ${FONT.split('px ')[1]}`);
    } else {
      const x0 = n.x + 12, x1 = n.x + w - 12, yh = n.y + 13, yl = n.y + h - 13, m = (x0 + x1) / 2;
      ctx.beginPath(); ctx.moveTo(x0, yl); ctx.lineTo(x0, yh); ctx.lineTo(m, yh); ctx.lineTo(m, yl); ctx.lineTo(x1, yl); ctx.lineTo(x1, yh);
      ctx.strokeStyle = on ? C.on : C.dim; ctx.stroke();
    }
    if (n.label) text(n.label, n.x + w / 2, n.y - 10);
  } else {
    ctx.beginPath(); ctx.roundRect(n.x, n.y, w, h, 4); ctx.fill(); ctx.stroke();
    text(SYMBOL[n.type] ?? '', n.x + w / 2, n.y + h / 2, C.ink, 'center', `bold 16px ${FONT.split('px ')[1]}`);
    if (NEGATED.has(n.type)) {
      ctx.beginPath(); ctx.arc(n.x + w, n.y + h / 2, 5, 0, Math.PI * 2);
      ctx.fillStyle = C.node; ctx.fill(); ctx.stroke();
    }
    if (n.label) text(n.label, n.x + w / 2, n.y - 10);
  }

  // pinos
  const spec = PINS[n.type];
  spec.inputs.forEach((name, i) => {
    const p = pinPos(n, 'in', i);
    drawPin(p.x, p.y, sim.input(n, i));
    if (name) {
      if (name === 'CLK') {
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 9, p.y); ctx.lineTo(p.x, p.y + 6);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
      }
      text(name, p.x + (name === 'CLK' ? 13 : 7), p.y, C.dim, 'left', '11px ' + FONT.split('px ')[1]);
    }
  });
  spec.outputs.forEach((name, i) => {
    const p = pinPos(n, 'out', i);
    drawPin(p.x, p.y, sim.pin(n.id, i));
    if (name) text(name, p.x - 7, p.y, C.dim, 'right', '11px ' + FONT.split('px ')[1]);
  });
}

function drawPin(x: number, y: number, on: boolean) {
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = on ? C.on : C.node; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = on ? C.on : C.ink; ctx.stroke();
}

function draw() {
  const { w, h } = fit(board, ctx);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C.grid;
  for (let x = 0; x < w; x += 20) for (let y = 0; y < h; y += 20) ctx.fillRect(x, y, 1.5, 1.5);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const wr of wires) {
    const a = byId.get(wr.fromNode), b = byId.get(wr.toNode);
    if (!a || !b) continue;
    const on = sim.wireValue(wr);
    const isSel = wr === selectedWire;
    curve(pinPos(a, 'out', wr.fromPin), pinPos(b, 'in', wr.toPin));
    if (isSel) { ctx.strokeStyle = C.accent; ctx.lineWidth = 8; ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = isSel ? C.accent : on ? C.on : C.wire; ctx.lineWidth = on || isSel ? 3 : 2; ctx.stroke();
  }
  if (link) {
    const p = pinPos(link.node, link.kind, link.i);
    ctx.setLineDash([6, 5]);
    if (link.kind === 'out') curve(p, link); else curve(link, p);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  }
  for (const n of nodes) drawNode(n);

  if (!nodes.length) {
    text('Quadro vazio', w / 2, h / 2 - 14, C.ink, 'center', 'bold 20px Georgia, serif');
    text('Adicione componentes pela barra lateral ou abra um exemplo.', w / 2, h / 2 + 14, C.dim);
  }
}

// ───────────────────────── Formas de onda ─────────────────────────
const watched = () => nodes.filter((n) => n.type === 'INPUT' || n.type === 'CLOCK' || n.type === 'OUTPUT');

function sample() {
  for (const n of watched()) {
    const v = n.type === 'OUTPUT' ? sim.input(n, 0) : sim.pin(n.id, 0);
    const h = history.get(n.id) ?? [];
    h.push(v);
    if (h.length > HIST) h.shift();
    history.set(n.id, h);
  }
}

function drawWave() {
  const traces = watched();
  const rowH = 28;
  wave.style.height = `${Math.max(traces.length * rowH + 12, 60)}px`;
  const { w, h } = fit(wave, wctx);
  wctx.fillStyle = '#fbfcfd'; wctx.fillRect(0, 0, w, h);
  if (!traces.length) {
    wctx.fillStyle = C.dim; wctx.font = FONT; wctx.textBaseline = 'middle'; wctx.textAlign = 'left';
    wctx.fillText('Chaves, clocks e LEDs aparecem aqui como diagrama de tempo.', 12, 30);
    return;
  }
  const x0 = 84, step = (w - x0 - 12) / HIST;
  traces.forEach((n, k) => {
    const top = 6 + k * rowH, yHi = top + 5, yLo = top + rowH - 9;
    wctx.font = FONT; wctx.fillStyle = C.ink; wctx.textAlign = 'left'; wctx.textBaseline = 'middle';
    wctx.fillText((n.label ?? n.type).slice(0, 8), 12, top + rowH / 2 - 2);
    wctx.strokeStyle = '#e1e8ee'; wctx.lineWidth = 1;
    wctx.beginPath(); wctx.moveTo(x0, yLo); wctx.lineTo(w - 12, yLo); wctx.stroke();
    const hist = history.get(n.id) ?? [];
    wctx.beginPath();
    let prevY = 0;
    hist.forEach((v, i) => {
      const x = x0 + (HIST - hist.length + i) * step, y = v ? yHi : yLo;
      if (i === 0) wctx.moveTo(x, y); else { wctx.lineTo(x, prevY); wctx.lineTo(x, y); }
      prevY = y;
    });
    if (hist.length) wctx.lineTo(x0 + HIST * step, prevY);
    wctx.strokeStyle = n.type === 'OUTPUT' ? C.led : C.on; wctx.lineWidth = 2; wctx.stroke();
  });
}

// ───────────────────────── Laço principal ─────────────────────────
let lastSample = 0;
function frame(now: number) {
  if (running) {
    sim.update(now);
    if (now - lastSample >= SAMPLE_MS) { lastSample = now; sample(); }
  }
  draw();
  drawWave();
  requestAnimationFrame(frame);
}

loadData(structuredClone(EXAMPLES['Meio somador']), null);
refreshList();
requestAnimationFrame(frame);
