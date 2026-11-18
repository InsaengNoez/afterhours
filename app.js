const app = document.querySelector('#app');
const dialog = document.querySelector('#entry');
const form = document.querySelector('#entry-form');
const notice = document.querySelector('#notice');
const codeFromUrl = new URLSearchParams(location.search).get('room')?.toUpperCase();
const roomPattern = /^[A-Z0-9]{6}$/;
const token = localStorage.getItem('afterhours-player') || crypto.randomUUID();
localStorage.setItem('afterhours-player', token);
let room, viewKey, mode, updatePending, noticeTimer;
let drafts = {};

const escape = (value) => String(value).replace(/[&<>"']/g,(char) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

function message(value) {
  notice.textContent = value;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.hidden = true,5000);
}

async function request(code, data) {
  const path = code ? '/api/rooms/'+code : '/api/rooms';
  const response = await fetch(path, {
    method:data ? 'POST' : 'GET',
    headers:{'x-player':token,'Content-Type':'application/json'},
    body:data ? JSON.stringify(data) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error),{status:response.status});
  return result;
}

function entry(action, code = '') {
  mode = action;
  form.reset();
  document.querySelector('#entry-error').textContent = '';
  document.querySelector('#entry-title').textContent = {create:'추리실 만들기',join:'초대 코드로 입장',solo:'혼자 수사하기'}[action];
  document.querySelector('#code-field').hidden = action !== 'join';
  form.elements.code.required = action === 'join';
  form.elements.code.value = code;
  if (!dialog.open) dialog.showModal();
  (action === 'join' && !code ? form.elements.code : form.elements.name).focus();
}

function options(items, key, placeholder) {
  return '<option value="">'+placeholder+'</option>'+items.map(([value,label]) =>
    '<option value="'+escape(value)+'" '+(String(drafts[key]) === String(value) ? 'selected' : '')+'>'+escape(label)+'</option>').join('');
}

function render() {
  const key = JSON.stringify(room);
  if (key === viewKey) return;
  viewKey = key;
  const {phase, players, clues, suspects, host, solo, voted, result} = room;
  const title = phase === 0 ? '수사팀 대기실' : '23시 17분, 정전';
  const participants = '<ul class="tags" aria-label="참가자">'+players.map((player) =>
    '<li>'+escape(player.name)+(phase >= 4 && player.voted ? ' · 제출 완료' : '')+'</li>').join('')+'</ul>';
  const nextLabel = ['수사 시작','조사 시작','토론으로 이동','지목으로 이동'][phase];
  const advance = host && phase < 4 ? '<button class="primary" data-action="next" '+(!phase && players.length < 2 ? 'disabled' : '')+'>'+nextLabel+' →</button>' : '';
  let content = '';
  if (phase === 0) {
    content = '<section class="panel"><div class="section-title"><h2>초대 코드</h2><strong class="code">'+room.code+'</strong></div><p class="muted">친구에게 초대 링크를 보내세요. 참가자가 2명 이상이면 방장이 시작할 수 있습니다.</p>'+participants+
      '<div class="actions"><button class="ghost" data-action="invite">초대 링크 복사</button>'+advance+'</div></section>';
  }
  if (phase >= 1 && phase <= 4) {
    content += '<section class="panel"><h2>사건 브리핑</h2><p>23:17, 폐관 직전의 전시관이 90초 동안 어두워졌다. 복구 직후 진열장 안의 달항아리가 복제품이라는 사실이 드러났다. 범인과 교체 시점을 찾고, 교체 시점을 입증하는 증거 한 장을 제출하라.</p>'+participants+'</section>';
    if (phase >= 2) {
      content += '<div class="section-title"><h2>증거 보드</h2><span>'+clues.length+'개 확인</span></div><div class="grid">'+clues.map((clue) =>
        '<article class="card"><div class="record-heading"><span class="number">증거 '+clue.id+'</span><span class="muted">'+(clue.shared ? '공용' : '개인')+'</span></div><h3>'+clue.title+'</h3><p>'+clue.record+'</p>'+
        (clue.shared ? '' : '<button class="ghost" data-action="share" data-id="'+clue.id+'">팀에 공개</button>')+'</article>').join('')+'</div>';
    }
    if (phase >= 3) {
      content += '<section class="panel"><h2>공용 사건 타임라인</h2><ol class="timeline">'+clues.filter(({shared}) => shared)
        .sort((a,b) => a.time.localeCompare(b.time)).map((clue) => '<li><time>'+clue.time+'</time>'+clue.title+'</li>').join('')+'</ol></section>';
    }
    content += '<div class="section-title"><h2>용의자 진술</h2></div><div class="grid">'+suspects.map(([name,job,statement]) =>
      '<article class="card"><span class="muted">'+job+'</span><h3>'+name+'</h3><p>'+statement+'</p></article>').join('')+'</div>';
    if (phase === 4) {
      content += '<section class="panel"><h2>최종 지목</h2>'+(voted ? '<p role="status">답안을 제출했습니다. 모두 제출하거나 시간이 끝나면 해설이 열립니다.</p>' :
        '<form id="vote" class="vote"><label>범인<select required name="suspect">'+options(suspects.map(([name],i)=>[i,name]),'suspect','용의자를 선택하세요')+
        '</select></label><label>교체 시점<select required name="time">'+options(room.times.map(time=>[time,time]),'time','시간을 선택하세요')+
        '</select></label><label>교체 시점을 입증하는 증거<select required name="clue">'+options(clues.map(({id,title})=>[id,'증거 '+id+' · '+title]),'clue','증거를 선택하세요')+
        '</select></label><button class="primary">답안 제출 →</button></form>')+'</section>';
    } else {
      content += '<div class="actions">'+advance+'</div>';
    }
  }
  if (phase === 5) {
    const [suspect,time,evidence] = result.answer;
    content = '<section class="panel"><p class="eyebrow">사건 해설</p><h2>'+suspects[suspect][0]+' · '+time+' · 증거 '+evidence+'</h2><p>'+result.proof+'</p><ol class="timeline">'+
      clues.toSorted((a,b)=>a.time.localeCompare(b.time)).map((clue)=>'<li><time>'+clue.time+'</time>'+clue.title+' — '+clue.record+'</li>').join('')+
      '</ol></section><section class="panel"><h2>내 수사 결과</h2><p class="report">'+(result.score === null ? '미제출' : '3개 중 '+result.score+'개 적중')+'</p><div class="actions"><button class="primary" data-action="result">결과와 도전 링크 복사</button><a class="ghost" href="/">처음으로</a></div></section>';
  }
  const focused = document.activeElement;
  const focusedSelect = focused?.form?.id === 'vote' ? focused.name : null;
  app.innerHTML = '<section class="session"><div class="section-title"><p class="eyebrow"><span class="dot"></span> CASE 001 <span class="line"></span> '+(solo ? '혼자 체험' : '수사실 '+room.code)+'</p><span id="clock" class="clock" aria-label="남은 시간"></span></div><h1>'+title+'</h1>'+
    '<ol class="phases" aria-label="진행 단계">'+room.stages.map((stage,index)=>'<li '+(index===phase?'aria-current="step"':'')+'>'+stage+'</li>').join('')+'</ol>'+
    '<p class="status" role="status" hidden></p>'+content+'</section>';
  if (focusedSelect) document.forms.vote?.elements[focusedSelect]?.focus();
  tick();
}

function tick() {
  const clock = document.querySelector('#clock');
  if (!clock || !room) return;
  const seconds = room.end ? Math.max(0,Math.ceil((room.end-Date.now())/1000)) : null;
  clock.textContent = seconds === null ? '' : Math.floor(seconds/60).toString().padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}

async function refresh(data) {
  if (!room || (room.phase === 5 && !data) ) return;
  if (updatePending) {
    if (data) await updatePending;
    else return;
    return refresh(data);
  }
  const pending = request(room.code,data);
  updatePending = pending.catch(() => {});
  try {
    room = await pending;
    render();
    const status = app.querySelector('.status');
    if (status) status.hidden = true;
  } catch (error) {
    const status = app.querySelector('.status');
    if (status) {
      status.hidden = false;
      status.textContent = error.message === 'Failed to fetch' ? '연결을 다시 시도하고 있습니다.' : error.message;
    }
    if (data) message(error.message);
  } finally {
    updatePending = false;
  }
}

function enter(state) {
  room = state;
  drafts = {};
  history.replaceState(null,'','/?room='+state.code);
  if (dialog.open) dialog.close();
  render();
}

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    message('클립보드에 복사했습니다.');
  } catch {
    window.prompt('텍스트를 복사하세요.',value);
  }
}

document.querySelectorAll('.join-trigger').forEach(button => button.addEventListener('click',() => entry('join')));
document.querySelector('#entry-close').addEventListener('click',() => dialog.close());
form.addEventListener('submit',async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  const name = form.elements.name.value.trim();
  const code = form.elements.code.value.trim().toUpperCase();
  try {
    enter(mode === 'join' ? await request(code,{action:'join',name}) :
      await request(null,{name,solo:mode==='solo'}));
  } catch (error) {
    document.querySelector('#entry-error').textContent = error.message;
  } finally { button.disabled = false; }
});

app.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const {action,id} = button.dataset;
  if (action === 'create' || action === 'solo') entry(action);
  if (action === 'next') refresh({action});
  if (action === 'share') refresh({action,clue:id});
  if (action === 'invite') copy(new URL('/?room='+room.code,location.origin).href);
  if (action === 'result') copy('퇴근 후 추리실 · 23시 17분, 정전\n'+
    (room.result.score === null ? '사건에 도전해 보세요.' : '3개 중 '+room.result.score+'개 적중!')+'\n'+location.origin+'/');
});
app.addEventListener('change',(event)=>{
  if (event.target.form?.id === 'vote') drafts[event.target.name] = event.target.value;
});
app.addEventListener('submit',(event)=>{
  if (event.target.id !== 'vote') return;
  event.preventDefault();
  const selected = new FormData(event.target);
  refresh({action:'vote',vote:[Number(selected.get('suspect')),selected.get('time'),selected.get('clue')]});
});
setInterval(()=>refresh(),1500);
setInterval(tick,250);
if (roomPattern.test(codeFromUrl || '')) {
  request(codeFromUrl).then(enter).catch(()=>entry('join',codeFromUrl));
}


