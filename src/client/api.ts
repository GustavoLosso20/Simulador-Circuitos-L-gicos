import type { CircuitData } from '../shared/types.js';

export interface CircuitSummary { _id: string; name: string; updatedAt: string }
export type SavedCircuit = CircuitData & { _id: string };

const BASE = `${(globalThis as { API_BASE?: string }).API_BASE ?? ''}/api/circuits`;

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Erro HTTP ${r.status}`);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export const listCircuits = () => req<CircuitSummary[]>(BASE);
export const getCircuit = (id: string) => req<SavedCircuit>(`${BASE}/${id}`);
export const saveCircuit = (data: CircuitData, id?: string) =>
  id
    ? req<SavedCircuit>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    : req<SavedCircuit>(BASE, { method: 'POST', body: JSON.stringify(data) });
export const deleteCircuit = (id: string) => req<void>(`${BASE}/${id}`, { method: 'DELETE' });
