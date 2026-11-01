import { assertIdentifier, type ColumnSpec, type IndexSpec, isConditionOps, type OrderBy, type SqlValue, type TableSpec, type Where } from './types';

export const quoteId = (name: string): string => `"${assertIdentifier(name)}"`;

const literal = (value: SqlValue): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Column defaults must be finite numbers.');
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
};

export function columnDefinition(column: ColumnSpec): string {
  const parts = [quoteId(column.name), column.type];
  if (column.primaryKey) parts.push('PRIMARY KEY');
  if (column.notNull) parts.push('NOT NULL');
  if (column.default !== undefined) parts.push(`DEFAULT ${literal(column.default)}`);
  return parts.join(' ');
}

export function createTableSql(spec: TableSpec): string[] {
  const statements = [`CREATE TABLE IF NOT EXISTS ${quoteId(spec.name)} (${spec.columns.map(columnDefinition).join(', ')})`];
  for (const index of spec.indexes ?? []) {
    statements.push(createIndexSql(spec.name, index));
  }
  return statements;
}

export function createIndexSql(table: string, index: IndexSpec): string {
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quoteId(index.name)} ON ${quoteId(table)} (${index.columns.map(quoteId).join(', ')})`;
}

export function compileWhere(where: Where | undefined): { sql: string; params: SqlValue[] } {
  if (!where) return { sql: '', params: [] };
  const clauses: string[] = [];
  const params: SqlValue[] = [];

  for (const [column, condition] of Object.entries(where)) {
    const col = quoteId(column);
    if (!isConditionOps(condition)) {
      if (condition === null) {
        clauses.push(`${col} IS NULL`);
      } else {
        clauses.push(`${col} = ?`);
        params.push(condition);
      }
      continue;
    }
    if (condition.eq !== undefined) {
      if (condition.eq === null) {
        clauses.push(`${col} IS NULL`);
      } else {
        clauses.push(`${col} = ?`);
        params.push(condition.eq);
      }
    }
    if (condition.ne !== undefined) {
      clauses.push(`${col} IS NOT ?`);
      params.push(condition.ne);
    }
    const ranges: [keyof typeof condition, string][] = [
      ['lt', '<'],
      ['lte', '<='],
      ['gt', '>'],
      ['gte', '>='],
    ];
    for (const [key, op] of ranges) {
      const value = condition[key];
      if (value !== undefined && !Array.isArray(value) && typeof value !== 'boolean') {
        clauses.push(`${col} ${op} ?`);
        params.push(value);
      }
    }
    if (condition.in !== undefined) {
      if (condition.in.length === 0) {
        clauses.push('0 = 1');
      } else {
        clauses.push(`${col} IN (${condition.in.map(() => '?').join(', ')})`);
        params.push(...condition.in);
      }
    }
    if (condition.notIn !== undefined && condition.notIn.length > 0) {
      clauses.push(`(${col} IS NULL OR ${col} NOT IN (${condition.notIn.map(() => '?').join(', ')}))`);
      params.push(...condition.notIn);
    }
    if (condition.isNull !== undefined) {
      clauses.push(`${col} IS ${condition.isNull ? '' : 'NOT '}NULL`);
    }
  }

  return { sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

export function compileOrderBy(orderBy: OrderBy[] | undefined): string {
  if (!orderBy || orderBy.length === 0) return '';
  return ` ORDER BY ${orderBy.map((entry) => `${quoteId(entry.column)} ${entry.direction === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`;
}

export function compileLimit(limit: number | undefined, offset: number | undefined): string {
  if (limit === undefined && offset === undefined) return '';
  const safeLimit = limit === undefined ? -1 : Math.max(0, Math.floor(limit));
  const safeOffset = offset === undefined ? 0 : Math.max(0, Math.floor(offset));
  return ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}
