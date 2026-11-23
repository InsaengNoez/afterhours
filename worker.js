import { phases, durations } from './case.js';
import { cases, publicCase, radioReconstruction, renderExhibit, endings, inspectionNotes, finalScenes, caseDossiers } from './cases.js';
import assets from './assets.js';

const ttl = 24 * 60 * 60 * 1000;
const failure = (message, status = 400) => ({ message, status });
const respond = (body, status = 200) => Response.json(body, {
  status, headers: {'Cache-Control':'no-store'}
});

function safeState(state, player) {
  const caseId = state.caseId ?? '001';
  const item = cases[caseId];
  const {suspects, clues, times, beats, intro, reveal, headline, conclusion} = item;
  const radio = state.radioDesk ? radioReconstruction : null;
  const answer = radio && state.radioSuspect ? [...radio.answer,item.answer[0]] : radio?.answer ?? item.answer;
  const labels = radio && state.radioSuspect ? [...radio.labels,'범인'] : radio?.labels ?? item.labels;
  const caseVisual = item.visual;
  const visible = clues.filter((item) => item[5] < 0 || state.public.includes(item[0]) ||
    item[5] % state.players.length === player.slot || state.phase === 5 || state.solo);
  const mine = state.votes[player.id];
  return {
    phase: state.phase, stages: phases, end: state.end, solo: state.solo,
    caseInfo:publicCase(radio ? {...item,brief:radio.brief} : item), radioDesk:radio ? {...radio.choices,requiresSuspect:Boolean(state.radioSuspect)} : null, host: player.id === state.host, voted: Boolean(mine),
    players: state.players.map(({ name, id }) => ({name, voted:Boolean(state.votes[id])})),
    teamDrafts: state.phase === 4 && !state.solo ? state.players.flatMap(({id,name}) =>
      state.drafts?.[id] ? [{name, ...state.drafts[id], own:id===player.id}] : []) : [],
    dossier: state.phase >= 1 ? caseDossiers[caseId] : null,
    suspects, times, clues: state.phase >= 2 ? visible.map((item) => {
      const [id,originalTitle,originalSource,originalRecord,time] = item;
      const replacement = radio?.clues[id];
      const [title,source,record] = replacement ?? [originalTitle,originalSource,originalRecord];
      return {id,title,source,record,time,inspection:inspectionNotes[caseId][Number(id)-1],visual:replacement ? renderExhibit(replacement[5]) : caseVisual(id),
        shared: item[5] < 0 || state.public.includes(id) || state.phase === 5 || state.solo};
    }) : [],
    result: state.phase === 5 ? {
      answer, culprit:item.answer[0], lead:radio?.lead ?? item.answer[2], labels, reconstruction:beats, intro, reveal, headline, conclusion, ending:endings[item.id], scene:finalScenes[item.id], submitted:mine ?? null, score: mine ? answer.filter((part, index) => mine[index] === part).length : null
    } : null
  };
}

function playerFor(state, token) {
  return state.players.find(({id}) => id === token);
}

function advance(state, time) {
  state.phase += state.phase === 2 ? 2 : 1;
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
  const {clues, suspects, times} = cases[state.caseId ?? '001'];
  if (body.action === 'next') {
    if (token !== state.host || state.phase >= 4) throw failure('현재 단계를 넘길 수 없습니다.', 409);
    if (state.phase === 0 && !state.solo && state.players.length < 2) throw failure('다른 참가자가 입장하면 시작할 수 있습니다.', 409);
    advance(state, Date.now());
  } else if (body.action === 'share') {
    if (![2,3,4].includes(state.phase)) throw failure('현재 단서를 공개할 수 없습니다.', 409);
    const clue = clues.find((item) => item[0] === body.clue && item[5] >= 0 && item[5] % state.players.length === player.slot);
    if (!clue) throw failure('보유한 개인 단서를 선택해 주세요.');
    if (!state.public.includes(clue[0])) state.public.push(clue[0]);
  } else if (body.action === 'vote' || body.action === 'draft') {
    if (state.phase !== 4 || state.votes[token]) throw failure('현재 답안을 제출할 수 없습니다.', 409);
    const {vote} = body;
    if (!Array.isArray(vote) || vote.length !== (state.radioDesk && state.radioSuspect ? 4 : 3)) throw failure('모든 항목을 선택해 주세요.');
    if (state.radioDesk) {
      const {cuts,sources} = radioReconstruction.choices;
      if (typeof vote[1] !== 'string' || !cuts.includes(vote[0]) ||
          !/^(?:[0-9]|1[0-2])$/.test(vote[1]) || !sources.some(([code])=>code===vote[2])) {
        throw failure('전환 시각, 수신 지연, 재생 소스를 확인해 주세요.');
      }
      if (state.radioSuspect && (!Number.isInteger(vote[3]) || !suspects[vote[3]])) {
        throw failure('범인을 선택해 주세요.');
      }
    } else if (!Number.isInteger(vote[0]) || !suspects[vote[0]] || !times.includes(vote[1]) ||
        !safeState(state, player).clues.some(({id}) => id === vote[2])) {
      throw failure('세 항목을 모두 선택해 주세요.');
    }
    if (body.action === 'draft') {
      if (state.solo) throw failure('팀 플레이에서만 초안을 공유할 수 있습니다.',403);
      const note = body.note ?? '';
      if (typeof note !== 'string' || note.length > 120) throw failure('근거를 120자 이내로 입력해 주세요.');
      (state.drafts ??= {})[token] = {vote, note:note.trim()};
      return;
    }
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
    const caseId = body.caseId ?? '001';
    if (typeof caseId !== 'string' || !Object.hasOwn(cases,caseId)) throw failure('사건을 다시 선택해 주세요.');
    const now = Date.now();
    const solo = body.solo === true;
    const state = {caseId,radioDesk:caseId==='002',radioSuspect:caseId==='002',phase:solo ? 1 : 0, end:solo ? now + 120000 : null, solo, host:token,
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
    if (state.radioDesk && !state.radioSuspect && state.phase < 5 && !Object.keys(state.votes).length) {
      state.radioSuspect = true;
      delete state.drafts;
    }
    if (state.phase === 3) state.phase = 2;
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

