import { loadConfig } from '../config';
import { openDatabase, migrate } from '../db';

const c = loadConfig();
const db = openDatabase({ databaseUrl: c.databaseUrl, sqlitePath: c.sqlitePath, ssl: c.dbSsl });
const r = await migrate(db);
console.log(`dialect=${db.dialect} applied=${r.applied.join(', ') || '(none)'} already=${r.alreadyApplied.length}`);
await db.close();
