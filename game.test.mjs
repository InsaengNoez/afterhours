import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './dist/server/index.js';
import { env } from './dev.mjs';

async function request(path, token, data) {
  const response = await worker.fetch(new Request('http://local.test'+path,{
    method:data ? 'POST' : 'GET',headers:{'x-player':token,'Content-Type':'application/json'},
    body:data ? JSON.stringify(data) : undefined
  }),env);
  return {status:response.status,body:await response.json()};
}
const api = '/api/rooms';

test('two investigators join, share evidence, reconnect and submit separate votes',async () => {
  const host = crypto.randomUUID();
  const friend = crypto.randomUUID();
  const created = await request(api,host,{name:'유리'});
  assert.equal(created.status,201);
  const path = api+'/'+created.body.code;
  assert.equal((await request(path,friend)).status,403);
  assert.equal((await request(path,host,{action:'next'})).status,409);
  assert.equal((await request(path,friend,{action:'join',name:'하늘'})).body.players.length,2);
  assert.equal((await request(path,friend)).body.players.length,2);
  assert.equal((await request(path,friend,{action:'next'})).status,409);
  assert.equal((await request(path,host,{action:'next'})).body.phase,1);
  assert.equal((await request(path,host,{action:'next'})).body.phase,2);
  assert.equal((await request(path,friend)).body.clues.some(({id})=>id==='04'),false);
  assert.equal((await request(path,friend,{action:'share',clue:'04'})).status,400);
  assert.equal((await request(path,host,{action:'share',clue:'04'})).status,200);
  assert.equal((await request(path,friend)).body.clues.find(({id})=>id==='04').shared,true);
  assert.equal((await request(path,host,{action:'next'})).body.phase,3);
  assert.equal((await request(path,host,{action:'next'})).body.phase,4);
  const one = await request(path,host,{action:'vote',vote:[0,'22:49','04']});
  assert.equal(one.body.result,null);
  const two = await request(path,friend,{action:'vote',vote:[1,'22:49','04']});
  assert.equal(two.body.result.score,2);
  assert.equal((await request(path,host)).body.result.score,3);
});

test('four concurrent participants stay in one room and all can submit',async () => {
  const [host,...friends] = Array.from({length:4},()=>crypto.randomUUID());
  const {body:{code}} = await request(api,host,{name:'방장'});
  const path = api+'/'+code;
  const joins = await Promise.all(friends.map((token,i)=>request(path,token,{action:'join',name:'참가자 '+i})));
  assert.ok(joins.every(({status})=>status===200));
  assert.equal((await request(path,host)).body.players.length,4);
  assert.equal((await request(path,crypto.randomUUID(),{action:'join',name:'추가'})).status,409);
  for (let phase=1;phase<=4;phase++) assert.equal((await request(path,host,{action:'next'})).body.phase,phase);
  const votes = await Promise.all([host,...friends].map(token=>request(path,token,{action:'vote',vote:[0,'22:49','03']})));
  assert.ok(votes.every(({status})=>status===200));
  assert.equal((await request(path,host)).body.result.score,2);
});

test('solo sees all evidence and server opens the reveal after the deadline',async (context) => {
  const token = crypto.randomUUID();
  const {body:{code,end}} = await request(api,token,{name:'수사관',solo:true});
  const path = api+'/'+code;
  const now = Date.now;
  context.after(()=>Date.now=now);
  Date.now = ()=>end+100;
  assert.equal((await request(path,token)).body.clues.length,7);
  Date.now = ()=>end+661000;
  const final = await request(path,token);
  assert.equal(final.body.phase,5);
  assert.equal(final.body.result.score,null);
});
