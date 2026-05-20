import pg from 'pg';

const { Client } = pg;
const projectRef = 'jgqkvludlumxsrqmqufr';
const password = '19200519200@@';
const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'sa-east-1',
  'ca-central-1',
];

for (const region of regions) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const client = new Client({
    host,
    port: 5432,
    user: `postgres.${projectRef}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log(host);
    await client.end();
    process.exit(0);
  } catch (error) {
    console.log(`${host}: ${error.code ?? error.message}`);
  }
}

process.exit(1);
