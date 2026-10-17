import { Router, type Request, type Response, type RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { Circuit } from '../models/Circuit.js';

const router = Router();

/** Encaminha rejeições de promises para o middleware de erro (Express 4). */
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const pick = (body: Record<string, unknown>) => ({
  name: body.name,
  nodes: body.nodes,
  wires: body.wires,
});

const invalidId = (res: Response) => res.status(400).json({ error: 'Identificador inválido' });

// Lista resumida (sem o grafo completo)
router.get(
  '/',
  wrap(async (_req, res) => {
    const list = await Circuit.find({}, 'name createdAt updatedAt').sort({ updatedAt: -1 }).limit(200).lean();
    res.json(list);
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    if (!isValidObjectId(req.params.id)) return invalidId(res);
    const doc = await Circuit.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Circuito não encontrado' });
    res.json(doc);
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const doc = await Circuit.create(pick(req.body ?? {}));
    res.status(201).json(doc);
  }),
);

// Busca + save() para que a validação de integridade do grafo sempre execute
router.put(
  '/:id',
  wrap(async (req, res) => {
    if (!isValidObjectId(req.params.id)) return invalidId(res);
    const doc = await Circuit.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Circuito não encontrado' });
    doc.set(pick(req.body ?? {}));
    await doc.save();
    res.json(doc);
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    if (!isValidObjectId(req.params.id)) return invalidId(res);
    const doc = await Circuit.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Circuito não encontrado' });
    res.status(204).end();
  }),
);

export default router;
