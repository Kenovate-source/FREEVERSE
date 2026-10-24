import type { Db } from '../db';
import type { StorageProvider } from '../storage/types';

/**
 * Account deletion and data export are assembled from per-module pieces so every module owns the cleanup of its own tables
 * (Decision 6: deletion must be completable reliably across related records). A module calls registerEraser() from register().
 *
 * Erasers run inside ONE database transaction, in registration order, followed by the account module's final scrub of the users row.
 * Anything that is not a database write (deleting stored files) goes into `afterCommit` so it only happens if the transaction commits.
 */
export interface EraseContext { now: Date; storage: StorageProvider }
export interface EraseResult { counts?: Record<string, number>; afterCommit?: () => Promise<void> }
export type Eraser = (db: Db, userId: string, ctx: EraseContext) => Promise<EraseResult | void>;
export type Exporter = (db: Db, userId: string) => Promise<unknown>;

const erasers = new Map<string, Eraser>();
const exporters = new Map<string, Exporter>();

export const registerEraser = (name: string, fn: Eraser): void => { erasers.set(name, fn); };
export const registerExporter = (name: string, fn: Exporter): void => { exporters.set(name, fn); };
export const listErasers = (): [string, Eraser][] => [...erasers.entries()];
export const listExporters = (): [string, Exporter][] => [...exporters.entries()];
