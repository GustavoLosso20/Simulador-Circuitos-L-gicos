import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import circuitsRouter from './routes/circuits.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/logic-sim';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: mongoose.connection.readyState === 1 });
});
app.use('/api/circuits', circuitsRouter);

// Serve o front-end (HTML + JS compilado)
app.use(express.static(path.resolve(dirname, '../../public')));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join('; ') });
  } else if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: 'Dados em formato inválido' });
  } else if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'JSON malformado' });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('MongoDB conectado');
} catch (e) {
  console.error('Falha ao conectar no MongoDB. Verifique MONGODB_URI no .env.\n', (e as Error).message);
  process.exit(1);
}
app.listen(PORT, () => console.log(`Simulador disponível em http://localhost:${PORT}`));
