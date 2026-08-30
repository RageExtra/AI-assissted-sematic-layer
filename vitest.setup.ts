import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll } from 'vitest';
import * as db from './server/db'; // Make sure db imports this setup or we set the env var

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  process.env.DATABASE_URL = uri;
});

afterAll(async () => {
  if (mongod) {
    await mongod.stop();
  }
});
