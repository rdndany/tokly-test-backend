import Redis from "ioredis";
import config from "./index";
import { createLogger } from "../utils/logger";

const logger = createLogger("Redis");

const redisConfig = {
  host: config.redis.host || "127.0.0.1",
  port: Number(config.redis.port) || 6379,
  password: config.redis.password || undefined,
  db: Number(config.redis.db) || 0,
  connectTimeout: 10000,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

export const redisClient = new Redis(redisConfig);

redisClient.on("connect", () => {
  logger.info("Redis connected");
});

redisClient.on("error", (err) => {
  logger.error("Redis error:", err.message);
});

export const setCache = async (
  client: Redis,
  key: string,
  value: unknown,
  expireSeconds: number = 120
): Promise<void> => {
  try {
    const serialized = JSON.stringify(value);
    await client.set(key, serialized, "EX", expireSeconds);
  } catch (error) {
    logger.error("setCache error:", error);
  }
};

export const getCache = async <T>(client: Redis, key: string): Promise<T | null> => {
  try {
    const value = await client.get(key);
    if (value == null) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error("getCache error:", error);
    return null;
  }
};

export const deleteCache = async (client: Redis, key: string): Promise<void> => {
  try {
    await client.del(key);
  } catch (error) {
    logger.error("deleteCache error:", error);
  }
};

export const deleteAllThatStartsWithPrefix = async (
  client: Redis,
  prefix: string
): Promise<void> => {
  try {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length === 0) return;
    const pipeline = client.pipeline();
    keys.forEach((key: string) => pipeline.del(key));
    await pipeline.exec();
  } catch (error) {
    logger.error("deleteAllThatStartsWithPrefix error:", error);
  }
};
