import "dotenv/config";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name} (see .env.example)`);
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 8050,
  databaseUrl: need("DATABASE_URL"),
};
