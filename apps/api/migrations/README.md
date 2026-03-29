# D1 Migration Workflow

## Creating a new migration
1. `npx wrangler d1 migrations create cq-dev <description>` — generates a new numbered file
2. Write forward-only SQL (D1/SQLite has limited ALTER TABLE)
3. **Never edit an existing migration file**
4. `npm run migrate:local` to test locally
5. `npm run migrate:remote` to apply to dev

## Local development reset
`npm run db:reset:local` drops all tables and re-applies all migrations from scratch.

## SQLite/D1 limitations
- No `DROP COLUMN`
- No `RENAME COLUMN` (in older SQLite versions)
- For destructive column changes: create new table → copy data → drop old → rename new

## Adding columns
```sql
ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value;
```

## Migration numbering
Sequential 4-digit prefixes: `0001`, `0002`, `0003`, etc.
Each number must be unique. Wrangler tracks applied migrations in the `d1_migrations` table.

## npm scripts
- `npm run migrate:local` — apply pending migrations to local D1
- `npm run migrate:remote` — apply pending migrations to remote cq-dev D1
- `npm run db:reset:local` — wipe local DB and re-apply all migrations
