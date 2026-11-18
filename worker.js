import { suspects, clues, phases, durations, times, answer, proof, evidenceVisual } from './case.js';
import assets from './assets.js';

const ttl = 24 * 60 * 60 * 1000;
const failure = (message, status = 400) => ({ message, status });
const respond = (body, status = 200) => Response.json(body, {
  status, headers: {'Cache-Control':'no-store'}
});

function safeState(state, player) {
  const visible = clues.filter((item) => item[5] < 0 || state.public.includes(item[0]) ||
    item[5] % state.players.length === player.slot || state.phase === 5 || state.solo);
  const mine = state.votes[player.id];
  return {
    phase: state.phase, stages: phases, end: state.end, solo: state.solo,
    host: player.id === state.host, voted: Boolean(mine),
    players: state.players.map(({ name, id }) => ({name, voted:Boolean(state.votes[id])})),
    suspects, times, clues: state.phase >= 2 ? visible.map((item) => ({
      id:item[0], title:item[1], source:item[2], record:item[3], time:item[4], visual:evidenceVisual(item[0]),
      shared: item[5] < 0 || state.public.includes(item[0]) || state.phase === 5 || state.solo
    })) : [],
    result: state.phase === 5 ? {
      answer, proof, score: mine ? answer.filter((part, index) => mine[index] === part).length : null
    } : null
  };
}

function playerFor(state, token) {
  return state.players.find(({id}) => id === token);
}

function advance(state, time) {
  state.phase++;
  state.end = durations[state.phase] ? time + durations[state.phase] * 1000 : null;
}

function apply(state, token, body) {
  const player = playerFor(state, token);
  if (body.action === 'join') {
    if (player) return;
    if (state.phase || state.solo || state.players.length >= 4) throw failure('현재 입장할 수 없는 방입니다.', 409);
    state.players.push({id:token, name:validName(body.name), slot:state.players.length});
    return;
  }
  if (!player) throw failure('초대 링크로 다시 입장해 주세요.', 403);
  if (body.action === 'next') {
    if (token !== state.host || state.phase >= 4) throw failure('현재 단계를 넘길 수 없습니다.', 409);
    if (state.phase === 0 && !state.solo && state.players.length < 2) throw failure('다른 참가자가 입장하면 시작할 수 있습니다.', 409);
    advance(state, Date.now());
  } else if (body.action === 'share') {
    if (![2,3,4].includes(state.phase)) throw failure('현재 단서를 공개할 수 없습니다.', 409);
    const clue = clues.find((item) => item[0] === body.clue && item[5] >= 0 && item[5] % state.players.length === player.slot);
    if (!clue) throw failure('보유한 개인 단서를 선택해 주세요.');
    if (!state.public.includes(clue[0])) state.public.push(clue[0]);
  } else if (body.action === 'vote') {
    if (state.phase !== 4 || state.votes[token]) throw failure('현재 답안을 제출할 수 없습니다.', 409);
    const {vote} = body;
    if (!Array.isArray(vote) || vote.length !== 3 || !Number.isInteger(vote[0]) ||
      !suspects[vote[0]] || !times.includes(vote[1]) ||
      !safeState(state, player).clues.some(({id}) => id === vote[2])) throw failure('세 항목을 모두 선택해 주세요.');
    state.votes[token] = vote;
    if (state.players.every(({id}) => state.votes[id])) advance(state, Date.now());
  } else if (body.action !== 'status') {
    throw failure('지원하지 않는 요청입니다.');
  }
}

function validName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 16) throw failure('닉네임을 1~16자로 입력해 주세요.');
  return value.trim();
}

async function api(request, env, path) {
  if (!['GET','POST'].includes(request.method)) throw failure('지원하지 않는 요청입니다.', 405);
  const token = request.headers.get('x-player');
  if (!/^[a-f0-9-]{36}$/.test(token || '')) throw failure('참가자 정보가 필요합니다.', 403);
  const body = request.method === 'POST' ? await request.json().catch(() => null) : {action:'status'};
  if (!body || typeof body !== 'object') throw failure('잘못된 요청입니다.');
  if (path === '/api/rooms' && request.method === 'POST') {
    const now = Date.now();
    const solo = body.solo === true;
    const state = {phase:solo ? 1 : 0, end:solo ? now + 120000 : null, solo, host:token,
      players:[{id:token, name:validName(body.name), slot:0}], public:[], votes:{}};
    await env.DB.prepare('DELETE FROM rooms WHERE created < ?').bind(now - ttl).run();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = crypto.randomUUID().replaceAll('-', '').slice(0,6).toUpperCase();
      const insert = await env.DB.prepare('INSERT OR IGNORE INTO rooms (code,state,created) VALUES (?,?,?)')
        .bind(code,JSON.stringify(state),now).run();
      if (insert.meta.changes) return respond({code, ...safeState(state, state.players[0])},201);
    }
    throw failure('방을 만들지 못했습니다. 다시 시도해 주세요.',503);
  }
  const code = /^\/api\/rooms\/([A-Z0-9]{6})$/.exec(path)?.[1];
  if (!code) throw failure('찾을 수 없는 경로입니다.',404);

  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first();
    const now = Date.now();
    if (!row || now - row.created > ttl) throw failure('방을 찾을 수 없습니다. 초대 코드를 확인해 주세요.',404);
    const state = JSON.parse(row.state);
    if (body.action !== 'join' && !playerFor(state, token)) throw failure('초대 코드와 닉네임으로 입장해 주세요.',403);
    while (state.end && state.end <= now) advance(state, state.end);
    try {
      apply(state, token, body);
    } catch (error) {
      if (JSON.stringify(state) === row.state) throw error;
      // Persist an expired phase, then let the client refresh after a rejected action.
      const update = await env.DB.prepare('UPDATE rooms SET state=?, revision=revision+1 WHERE code=? AND revision=?')
        .bind(JSON.stringify(state),code,row.revision).run();
      if (update.meta.changes) throw error;
      continue;
    }
    const serialized = JSON.stringify(state);
    if (serialized !== row.state) {
      const update = await env.DB.prepare('UPDATE rooms SET state=?, revision=revision+1 WHERE code=? AND revision=?')
        .bind(serialized,code,row.revision).run();
      if (!update.meta.changes) continue;
    }
    return respond({code,...safeState(state,playerFor(state, token))});
  }
  throw failure('방에서 변경이 진행 중입니다. 다시 시도해 주세요.',409);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      try { return await api(request,env,path); }
      catch (error) {
        if (error.status) return respond({error:error.message},error.status);
        console.error(error);
        return respond({error:'잠시 후 다시 시도해 주세요.'},500);
      }
    }
    const asset = Object.hasOwn(assets,path) && assets[path];
    if (!asset) return new Response('찾을 수 없는 페이지입니다.', {status:404});
    const [type,value] = asset;
    const content = type.startsWith('image/') ? Uint8Array.from(atob(value), (char) => char.charCodeAt(0)) : value;
    return new Response(content, {headers:{'Content-Type':type, 'X-Content-Type-Options':'nosniff'}});
  }
};

