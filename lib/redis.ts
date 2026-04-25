import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.GUARDIAN_REDIS_HOST || "localhost",
  port: Number(process.env.GUARDIAN_REDIS_PORT) || 6379,
  password: process.env.GUARDIAN_REDIS_PASS || undefined,
});
