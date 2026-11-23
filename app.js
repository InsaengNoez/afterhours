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


const cutPositions = [6,12,17];

function signalLine(label, cues, speech, text, cut) {
  return '<div class="signal-line"><strong>'+label+'</strong><div class="signal-track" aria-hidden="true">'+
    cues.map((second,index)=>'<span class="cue cue-'+index+'" style="--pos:'+second/24*100+'%">'+(index===0?'A':'B')+'</span>').join('')+
    '<span class="signal-speech" style="--pos:'+speech/24*100+'%">'+text+'</span>'+
    (cut === null ? '' : '<span class="signal-cut" style="--pos:'+cut/24*100+'%"></span>')+'</div></div>';
}

function signalPreview(delay, cut) {
  return '<div class="signal-scale" aria-hidden="true"><span>21:59:48</span><span>22:00:00</span><span>22:00:12</span></div>'+
    signalLine('스튜디오 원음',[3,8],12,'끝인사',cut)+
    signalLine('청취자 수신본',[11-delay,16-delay],20-delay,'사과문',cut)+
    '<p class="muted signal-readout">'+
    (delay === 8 ? '안내음 A와 B가 모두 겹쳤습니다. 그다음 시작하는 두 문장을 비교하세요.' :
      '청취자 수신본을 앞당겨 두 트랙의 안내음 A와 B를 각각 겹쳐 보세요.')+'</p>';
}

function radioDesk({radioDesk,phase,voted}) {
  const delay = Number(drafts.delay ?? 0);
  const cut = radioDesk.cuts.indexOf(drafts.cut);
  const disabled = voted ? ' disabled' : '';
  return '<section class="panel radio-desk"><h2>송출 재구성실</h2><p class="muted">수신본의 시간축을 움직여 안내음을 맞춘 뒤, 송출이 갈라진 시각과 재생 소스를 표시하세요.</p>'+
    '<form id="radio-vote"><label>수신본 앞당기기 <output id="radio-delay-label" for="radio-delay">'+delay+'초</output>'+
    '<input id="radio-delay" name="delay" type="range" min="0" max="12" value="'+delay+'"'+disabled+'></label>'+
    '<div class="signal-preview">'+signalPreview(delay,cutPositions[cut] ?? null)+'</div>'+
    '<div class="radio-choices"><label>송출 전환 시각<select name="cut" required'+disabled+'>'+
    options(radioDesk.cuts.map(time=>[time,time]),'cut','갈라진 지점을 선택하세요')+'</select></label>'+
    '<label>재생 소스<select name="source" required'+disabled+'>'+
    options(radioDesk.sources,'source','재생 소스를 선택하세요')+'</select></label></div>'+
    (voted ? '<p role="status">재구성을 제출했습니다. 모두 제출하거나 시간이 끝나면 해설이 열립니다.</p>' :
      phase === 4 ? '<div class="actions"><button class="primary">재구성 제출 →</button></div>' :
      '<p class="muted">설정은 지목 단계까지 유지됩니다.</p>')+'</form></section>';
}


function renderEnding(ending) {
  const {turn, turnBody, behind, behindBody, speaker, quote, after} = ending;
  return '<section class="panel case-ending" aria-labelledby="ending-turn">'+
    '<div class="ending-turn"><p class="eyebrow">결정적 순간</p><h2 id="ending-turn">'+escape(turn)+'</h2><p>'+escape(turnBody)+'</p></div>'+
    '<details class="ending-file"><summary><span><span class="eyebrow">비하인드</span>'+
    '<span class="ending-label">'+escape(behind)+'</span></span><span class="ending-plus" aria-hidden="true"></span></summary>'+
    '<div class="ending-content"><p>'+escape(behindBody)+'</p>'+
    '<figure class="ending-quote"><blockquote>“'+escape(quote)+'”</blockquote><figcaption>'+escape(speaker)+'</figcaption></figure>'+
    '<div class="ending-after"><h3>그날 이후</h3><p>'+escape(after)+'</p></div></div></details></section>';
}

function renderResult({result, clues, suspects, caseInfo, radioDesk}) {
  const {answer, score, submitted, reconstruction, intro, reveal, headline:caseHeadline, conclusion, ending, culprit, lead:leadId, labels} = result;
  const [name,job] = suspects[culprit];
  const findClue = (id) => clues.find(clue => clue.id === id);
  const lead = findClue(leadId);
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
    return '<section class="reveal-card culprit-reveal" aria-labelledby="reveal-title"><img class="culprit-art" src="/'+caseInfo.portraits[culprit]+'.webp" alt="">'+
      '<div class="reveal-content"><p class="eyebrow">범인 공개</p><h2 id="reveal-title" tabindex="-1">'+name+'</h2>'+
      '<p class="culprit-job">'+job+'</p><p class="result-context">'+reveal+'</p>'+
      '<div class="actions"><button class="primary" data-action="reveal-next">사건의 전말 <b aria-hidden="true">→</b></button></div></div></section>';
  }

  const format = radioDesk
    ? [(value)=>value, (value)=>value+'초', (value)=>radioDesk.sources.find(([code])=>code===value)?.[1] ?? value]
    : [(value)=>suspects[value][0], (value)=>value, (value)=>findClue(value)?.title || '증거 '+value];
  const checks = labels.map((label,index) => {
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
    (ending ? renderEnding(ending) : '')+
    '<div class="debrief-grid"><section class="panel debrief-panel"><h2>결정적 증거</h2><h3>'+lead.title+'</h3>'+lead.visual+
      '<p class="muted">'+lead.record+'</p></section>'+
      '<section class="panel debrief-panel"><h2>내 답안 대조</h2><ul class="answer-checks">'+checks+'</ul></section></div>'+
    (radioDesk ? '<section class="panel radio-desk">'+
      (submitted ? '<h2>내가 맞춘 시간축</h2>'+signalPreview(Number(submitted[1]),cutPositions[radioDesk.cuts.indexOf(submitted[0])]) : '')+
      '<h2>실제 송출 재구성</h2>'+signalPreview(Number(answer[1]),cutPositions[radioDesk.cuts.indexOf(answer[0])])+'</section>' : '')+
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
    if (phase >= 2 && room.radioDesk) content += radioDesk(room);
    if (phase === 4 && !room.radioDesk) {
      content += '<section class="panel"><h2>최종 지목</h2>'+(voted ? '<p role="status">답안을 제출했습니다. 모두 제출하거나 시간이 끝나면 해설이 열립니다.</p>' :
        '<form id="vote" class="vote"><label>'+caseInfo.labels[0]+'<select required name="suspect">'+options(suspects.map(([name],i)=>[i,name]),'suspect','용의자를 선택하세요')+
        '</select></label><label>'+caseInfo.labels[1]+'<select required name="time">'+options(room.times.map(time=>[time,time]),'time','항목을 선택하세요')+
        '</select></label><label>'+caseInfo.labels[2]+'<select required name="clue">'+options(clues.map(({id,title})=>[id,'증거 '+id+' · '+title]),'clue','증거를 선택하세요')+
        '</select></label><button class="primary">답안 제출 →</button></form>')+'</section>';
    } else if (phase < 4) {
      content += '<div class="actions">'+advance+'</div>';
    }
  }
  if (phase === 5) content = renderResult(room);
  const focused = document.activeElement;
  const focusedField = ['vote','radio-vote'].includes(focused?.form?.id) ? [focused.form.id,focused.name] : null;
  app.innerHTML = '<section class="session case-session" data-case="'+caseInfo.id+'" style="--accent:'+caseInfo.accent+'"><div class="section-title"><p class="eyebrow"><span class="dot"></span> CASE '+caseInfo.id+' <span class="line"></span> '+(solo ? '혼자 체험' : '수사실 '+room.code)+'</p><span id="clock" class="clock" aria-label="남은 시간"></span></div><h1>'+title+'</h1>'+
    '<ol class="phases" aria-label="진행 단계">'+room.stages.map((stage,index)=>'<li '+(index===phase?'aria-current="step"':'')+'>'+stage+'</li>').join('')+'</ol>'+
    '<p class="status" role="status" hidden></p>'+content+'</section>';
  if (focusedField) document.forms[focusedField[0]]?.elements[focusedField[1]]?.focus();
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
app.addEventListener('input',(event)=>{
  const {form,name,value} = event.target;
  if (form?.id !== 'radio-vote') return;
  drafts[name] = value;
  const delay = Number(form.elements.delay.value);
  const cut = room.radioDesk.cuts.indexOf(form.elements.cut.value);
  form.querySelector('#radio-delay-label').textContent = delay+'초';
  form.querySelector('.signal-preview').innerHTML = signalPreview(delay,cutPositions[cut] ?? null);
});
app.addEventListener('change',(event)=>{
  if (event.target.form?.id === 'vote') drafts[event.target.name] = event.target.value;
});
app.addEventListener('submit',(event)=>{
  if (event.target.id === 'radio-vote') {
    event.preventDefault();
    if (room.phase !== 4 || room.voted) return;
    const selected = new FormData(event.target);
    refresh({action:'vote',vote:[selected.get('cut'),selected.get('delay'),selected.get('source')]});
    return;
  }
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



function setupHero() {
  const carousel = document.querySelector('.case-hero');
  if (!carousel) return;
  const slides = Array.from(carousel.querySelectorAll('[data-hero-slide]'));
  const toggle = carousel.querySelector('[data-hero-pause]');
  const status = carousel.querySelector('[data-hero-status]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let auto = !reducedMotion.matches;
  let current = 0;
  let timer;
  let hovering = false;

  function schedule() {
    clearTimeout(timer);
    if (auto && !hovering && !document.hidden && !dialog.open && carousel.isConnected) {
      timer = setTimeout(() => {
        if (!carousel.isConnected || dialog.open) return;
        show(current + 1);
      }, 4000);
    }
  }

  function show(index, announce = false) {
    const target = (index + slides.length) % slides.length;
    if (target !== current) {
      slides[current].hidden = true;
      slides[target].hidden = false;
      current = target;
    }
    if (announce) status.textContent = slides[current].getAttribute('aria-label');
    schedule();
  }

  function setAuto(value) {
    auto = value;
    const label = auto ? '자동 넘김 일시정지' : '자동 넘김 시작';
    toggle.textContent = auto ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label',label);
    toggle.title = label;
    schedule();
  }

  function select(index) {
    setAuto(false);
    show(index,true);
  }

  carousel.querySelector('[data-hero-prev]').addEventListener('click',()=>select(current-1));
  carousel.querySelector('[data-hero-next]').addEventListener('click',()=>select(current+1));
  toggle.addEventListener('click',()=>setAuto(!auto));
  carousel.addEventListener('focusin',(event)=>{
    if (event.target !== toggle && auto) setAuto(false);
  });
  carousel.addEventListener('keydown',(event)=>{
    if (!event.target.closest('.hero-nav') || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    select(current+(event.key==='ArrowRight' ? 1 : -1));
  });
  carousel.addEventListener('pointerenter',(event)=>{ if (event.pointerType==='mouse') { hovering=true; schedule(); } });
  carousel.addEventListener('pointerleave',()=>{ hovering=false; schedule(); });
  document.addEventListener('visibilitychange',schedule);
  dialog.addEventListener('close',schedule);
  reducedMotion.addEventListener('change',(event)=>{ if (event.matches) setAuto(false); });
  setAuto(auto);
}

setupHero();
