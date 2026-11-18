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
let chosenCase = "001";
let resultScene = 0;

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

function entry(action, code = '', selection) {
  chosenCase = selection?.id || '001';
  document.querySelector('#entry-case').textContent = selection?.title || '';
  document.querySelector('#entry-case').hidden = !selection;
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

function evidenceCard(clue) {
  return '<article class="card evidence-card"><div class="record-heading"><span class="number">증거 '+clue.id+'</span><span class="clue-visibility'+(clue.shared ? '' : ' private')+'">'+(clue.shared ? '공용' : '개인')+'</span></div>'+
    '<div class="evidence-title"><h3>'+clue.title+'</h3><span>'+clue.source+'</span></div>'+clue.visual+
    '<p class="evidence-transcript">'+clue.record+'</p>'+
    (clue.shared ? '' : '<button class="ghost" data-action="share" data-id="'+clue.id+'">팀에 공개</button>')+'</article>';
}

function witnessCard([name,job,statement], portrait) {
  return '<article class="card witness"><div class="portrait portrait-'+portrait+'"><img src="/'+portrait+'.webp" alt="" width="480" height="400">'+
    '<div class="identity"><span>'+job+'</span><h3>'+name+'</h3></div></div><blockquote>'+statement+'</blockquote></article>';
}


function renderResult({result, clues, suspects, caseInfo}) {
  const {answer, score, submitted, reconstruction, intro, reveal, headline:caseHeadline, conclusion} = result;
  const [suspect,,evidence] = answer;
  const [name,job] = suspects[suspect];
  const findClue = (id) => clues.find(clue => clue.id === id);
  const lead = findClue(evidence);
  const closing = '<div class="actions"><button class="ghost" data-action="result">결과와 도전 링크 복사</button><a class="ghost" href="/">처음으로</a></div>';

  if (resultScene === 0) {
    const headlines = ['사건을 다시 들여다볼 시간','하나의 실마리를 잡았다','진실에 거의 닿았다','모든 단서가 맞아떨어졌다'];
    const headline = score === null ? '수사 시간이 끝났다' : headlines[score];
    return '<section class="reveal-card result-intro" aria-labelledby="reveal-title"><div class="reveal-content">'+
      '<p class="eyebrow">내 수사 결과</p><h2 id="reveal-title" tabindex="-1">'+headline+'</h2>'+
      (score === null ? '<p class="result-context">답안 미제출</p>' :
        '<div class="result-score" role="img" aria-label="3개 중 '+score+'개 적중"><strong aria-hidden="true">'+score+'</strong><span aria-hidden="true">/ 3 적중</span></div>')+
      '<p class="result-context">'+intro+'</p>'+
      '<div class="actions"><button class="primary" data-action="reveal-next">범인 공개 <b aria-hidden="true">→</b></button></div></div></section>';
  }
  if (resultScene === 1) {
    return '<section class="reveal-card culprit-reveal" aria-labelledby="reveal-title"><img class="culprit-art" src="/'+caseInfo.portraits[suspect]+'.webp" alt="">'+
      '<div class="reveal-content"><p class="eyebrow">범인 공개</p><h2 id="reveal-title" tabindex="-1">'+name+'</h2>'+
      '<p class="culprit-job">'+job+'</p><p class="result-context">'+reveal+'</p>'+
      '<div class="actions"><button class="primary" data-action="reveal-next">사건의 전말 <b aria-hidden="true">→</b></button></div></div></section>';
  }

  const format = [(value) => suspects[value][0], (value) => value, (value) => findClue(value)?.title || '증거 '+value];
  const checks = caseInfo.labels.map((label,index) => {
    const matched = submitted?.[index] === answer[index];
    const status = submitted ? (matched ? '적중' : '빗나감') : '미제출';
    return '<li><div><span>'+label+'</span><strong>'+format[index](answer[index])+'</strong></div>'+
      '<div class="check-status'+(matched ? ' correct' : '')+'"><span>'+status+'</span>'+
      (submitted && !matched ? '<small>내 답 '+format[index](submitted[index])+'</small>' : '')+'</div></li>';
  }).join('');
  const beats = reconstruction.map(([stamp,title,detail]) =>
    '<li><time>'+stamp+'</time><div><h3>'+title+'</h3><p>'+detail+'</p></div></li>').join('');
  return '<section class="reveal-card case-closed" aria-labelledby="reveal-title"><div class="reveal-content">'+
    '<p class="eyebrow">사건의 전말</p><h2 id="reveal-title" tabindex="-1">'+caseHeadline+'</h2>'+
    '<p class="result-context">'+conclusion+'</p></div></section>'+
    '<div class="debrief-grid"><section class="panel debrief-panel"><h2>결정적 증거</h2><h3>'+lead.title+'</h3>'+lead.visual+
      '<p class="muted">'+lead.record+'</p></section>'+
      '<section class="panel debrief-panel"><h2>내 답안 대조</h2><ul class="answer-checks">'+checks+'</ul></section></div>'+
    '<section class="panel debrief-panel"><h2>재구성 타임라인</h2><ol class="reconstruction">'+beats+'</ol></section>'+
    '<details class="panel evidence-archive"><summary>전체 증거 다시 보기</summary><div class="evidence-grid">'+clues.map(evidenceCard).join('')+'</div></details>'+closing;
}

function render() {
  const key = resultScene + ':' + JSON.stringify(room);
  if (key === viewKey) return;
  viewKey = key;
  const {phase, players, clues, suspects, host, solo, voted, caseInfo} = room;
  const title = caseInfo.title;
  const participants = '<ul class="tags" aria-label="참가자">'+players.map((player) =>
    '<li>'+escape(player.name)+(phase >= 4 && player.voted ? ' · 제출 완료' : '')+'</li>').join('')+'</ul>';
  const nextLabel = ['수사 시작','조사 시작','토론으로 이동','지목으로 이동'][phase];
  const advance = host && phase < 4 ? '<button class="primary" data-action="next" '+(!phase && players.length < 2 ? 'disabled' : '')+'>'+nextLabel+' →</button>' : '';
  let content = '';
  if (phase === 0) {
    content = '<section class="panel"><div class="section-title"><h2>수사팀 대기실</h2><strong class="code">'+room.code+'</strong></div><p class="muted">친구에게 초대 링크를 보내세요. 참가자가 2명 이상이면 방장이 시작할 수 있습니다.</p>'+participants+
      '<div class="actions"><button class="ghost" data-action="invite">초대 링크 복사</button>'+advance+'</div></section>';
  }
  if (phase >= 1 && phase <= 4) {
    content += '<section class="panel"><h2>사건 브리핑</h2><p>'+caseInfo.brief+'</p>'+participants+'</section>';
    if (phase >= 2) {
      content += '<div class="section-title"><h2>증거 보드</h2><span>'+clues.length+'개 확인</span></div>'+
        '<div class="evidence-grid">'+clues.map(evidenceCard).join('')+'</div>';
    }
    if (phase >= 3) {
      content += '<section class="panel"><h2>공용 사건 타임라인</h2><ol class="timeline">'+clues.filter(({shared}) => shared)
        .sort((a,b) => a.time.localeCompare(b.time)).map((clue) => '<li><time>'+clue.time+'</time>'+clue.title+'</li>').join('')+'</ol></section>';
    }
    content += '<div class="section-title"><h2>용의자 진술</h2></div>'+
      '<div class="grid witness-grid">'+suspects.map((suspect,index)=>witnessCard(suspect,caseInfo.portraits[index])).join('')+'</div>';
    if (phase === 4) {
      content += '<section class="panel"><h2>최종 지목</h2>'+(voted ? '<p role="status">답안을 제출했습니다. 모두 제출하거나 시간이 끝나면 해설이 열립니다.</p>' :
        '<form id="vote" class="vote"><label>'+caseInfo.labels[0]+'<select required name="suspect">'+options(suspects.map(([name],i)=>[i,name]),'suspect','용의자를 선택하세요')+
        '</select></label><label>'+caseInfo.labels[1]+'<select required name="time">'+options(room.times.map(time=>[time,time]),'time','항목을 선택하세요')+
        '</select></label><label>'+caseInfo.labels[2]+'<select required name="clue">'+options(clues.map(({id,title})=>[id,'증거 '+id+' · '+title]),'clue','증거를 선택하세요')+
        '</select></label><button class="primary">답안 제출 →</button></form>')+'</section>';
    } else {
      content += '<div class="actions">'+advance+'</div>';
    }
  }
  if (phase === 5) content = renderResult(room);
  const focused = document.activeElement;
  const focusedSelect = focused?.form?.id === 'vote' ? focused.name : null;
  app.innerHTML = '<section class="session case-session" data-case="'+caseInfo.id+'" style="--accent:'+caseInfo.accent+'"><div class="section-title"><p class="eyebrow"><span class="dot"></span> CASE '+caseInfo.id+' <span class="line"></span> '+(solo ? '혼자 체험' : '수사실 '+room.code)+'</p><span id="clock" class="clock" aria-label="남은 시간"></span></div><h1>'+title+'</h1>'+
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
  resultScene = 0;
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
      await request(null,{name,caseId:chosenCase,solo:mode==='solo'}));
  } catch (error) {
    document.querySelector('#entry-error').textContent = error.message;
  } finally { button.disabled = false; }
});

app.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const {action,id} = button.dataset;
  if (action === 'create' || action === 'solo') entry(action,'',{id:button.dataset.case || '001',title:button.dataset.title || '23시 17분, 정전'});
  if (action === 'next') refresh({action});
  if (action === 'share') refresh({action,clue:id});
  if (action === 'invite') copy(new URL('/?room='+room.code,location.origin).href);
  if (action === 'reveal-next' && room.phase === 5 && resultScene < 2) {
    resultScene++;
    render();
    const heading = document.querySelector('#reveal-title');
    heading.focus({preventScroll:true});
    heading.closest('.reveal-card').scrollIntoView({block:'start'});
  }
  if (action === 'result') copy('퇴근 후 추리실 · '+room.caseInfo.title+'\n'+
    (room.result.score === null ? '사건에 도전해 보세요.' : '3개 중 '+room.result.score+'개 적중!')+'\n'+location.origin+'/#case-'+room.caseInfo.id);
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


