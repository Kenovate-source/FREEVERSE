export function renderAll(): { dialect: 'postgres' | 'sqlite'; name: string; sql: string }[];
export function renderOne(tpl: string, dialect: 'postgres' | 'sqlite'): string;
