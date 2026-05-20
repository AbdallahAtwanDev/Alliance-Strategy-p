import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;
const connectionString = 'postgresql://postgres:19200519200%40%40@db.jgqkvludlumxsrqmqufr.supabase.co:5432/postgres';
const sql = await readFile(new URL('../supabase_schema.sql', import.meta.url), 'utf8');

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log('Supabase schema applied successfully.');
} finally {
  await client.end();
}
