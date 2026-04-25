import { Pool } from "@/node_modules/@types/pg";

export const pool = new Pool({
  host: process.env.GUARDIAN_DB_HOST,
  port: Number(process.env.GUARDIAN_DB_PORT),
  database: process.env.GUARDIAN_DB_NAME,
  user: process.env.GUARDIAN_DB_USER,
  password: process.env.GUARDIAN_DB_PASS,
});
