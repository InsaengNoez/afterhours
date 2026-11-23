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
  const investigation = (await request(path,host,{action:'next'})).body;
  assert.equal(investigation.phase,2);
  assert.ok(investigation.clues.every(clue=>clue.inspection.length===2));
  assert.equal((await request(path,friend)).body.clues.some(({id})=>id==='04'),false);
  assert.equal((await request(path,friend,{action:'share',clue:'04'})).status,400);
  assert.equal((await request(path,host,{action:'share',clue:'04'})).status,200);
  assert.equal((await request(path,friend)).body.clues.find(({id})=>id==='04').shared,true);
  assert.equal((await request(path,host,{action:'next'})).body.phase,4);
  const shared = await request(path,host,{action:'draft',vote:[1,'22:49','04'],note:'출입 기록'});
  assert.equal(shared.status,200);
  assert.equal(shared.body.voted,false);
  assert.equal((await request(path,friend)).body.teamDrafts[0].note,'출입 기록');
  await request(path,friend,{action:'draft',vote:[0,'22:49','04']});
  assert.equal((await request(path,host)).body.teamDrafts.length,2);
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
  for (const phase of [1,2,4]) assert.equal((await request(path,host,{action:'next'})).body.phase,phase);
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
  Date.now = ()=>end+540100;
  assert.equal((await request(path,token)).body.phase,4);
  assert.equal((await request(path,token,{action:'draft',vote:[0,'22:49','04']})).status,403);
  Date.now = ()=>end+661000;
  const final = await request(path,token);
  assert.equal(final.body.phase,5);
  assert.equal(final.body.result.score,null);
});

test('all new cases remain tied to their rooms and expose their own evidence and verdict', async () => {
  const expected = [
    ['002','윤해원',['22:00:00','8','R-17',2],'waveform'],
    ['003','박선우',[2,'15:05','04'],'evidence-003.webp'],
    ['004','채린',[1,'분장대 앞','04'],'evidence-004.webp'],
    ['005','권나경',[1,'개표함 받침을 맞출 때','04'],'ballot-diagram']
  ];
  for (const [caseId,firstSuspect,answer,visual] of expected) {
    const host = crypto.randomUUID();
    const friend = crypto.randomUUID();
    const {status,body:created} = await request(api,host,{name:'방장',caseId});
    assert.equal(status,201);
    assert.equal(created.caseInfo.id,caseId);
    assert.equal(created.suspects[0][0],firstSuspect);
    const path = api+'/'+created.code;
    const joined = await request(path,friend,{action:'join',name:'초대',caseId:'001'});
    assert.equal(joined.body.caseInfo.id,caseId);
    for (let phase=1;phase<=2;phase++) await request(path,host,{action:'next'});
    assert.equal((await request(path,friend)).body.clues.some(clue=>clue.id==='04'),false);
    await request(path,host,{action:'share',clue:'04'});
    const evidence = (await request(path,friend)).body.clues.find(clue=>clue.id==='04');
    assert.ok(evidence.visual.includes(visual));
    assert.equal(evidence.shared,true);
    assert.equal((await request(path,host,{action:'next'})).body.phase,4);
    if (caseId === '002') {
      assert.equal(created.radioDesk.requiresSuspect,true);
      assert.equal((await request(path,host,{action:'vote',vote:answer.slice(0,3)})).status,400);
      assert.equal((await request(path,host,{action:'vote',vote:[...answer.slice(0,3),9]})).status,400);
      const draft = await request(path,host,{action:'draft',vote:[...answer.slice(0,3),0]});
      assert.equal(draft.body.teamDrafts[0].vote[3],0);
      assert.equal((await request(path,host,{action:'vote',vote:[2,'리허설 파일','04']})).status,400);
      assert.equal((await request(path,host,{action:'vote',vote:['22:00:00','13','R-17',2]})).status,400);
    }
    assert.equal((await request(path,host,{action:'vote',vote:answer})).body.result,null);
    const {body:finished} = await request(path,friend,{action:'vote',vote:answer});
    assert.equal(finished.result.score,answer.length);
    assert.ok(finished.result.reconstruction.length>=4);
    assert.equal(finished.clues.length,7);
    assert.ok(finished.clues.every(clue=>clue.inspection.length===2 && clue.inspection.every(spot=>spot.every(Boolean))));
  }
  const unknown = await request(api,crypto.randomUUID(),{name:'수사관',caseId:'__proto__'});
  assert.equal(unknown.status,400);
});
