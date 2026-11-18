import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './dist/server/index.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync('drizzle/0000_rooms.sql','utf8'));
export const env = { DB: {
  prepare(sql) {
    const query = db.prepare(sql);
    return {bind(...args) {
      return {first:async () => query.get(...args),run:async () => ({meta:query.run(...args)})};
    }};
  }
}};
if (process.argv[1]?.endsWith('dev.mjs')) {
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const response = await worker.fetch(new Request('http://127.0.0.1:4173'+incoming.url,{
      method:incoming.method,headers:incoming.headers,
      body:chunks.length ? Buffer.concat(chunks) : undefined
    }),env);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(4173,'127.0.0.1',() => console.log('Local: http://127.0.0.1:4173'));
}


