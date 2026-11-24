import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { cases } from './cases.js';

const list = [['/','text/html; charset=utf-8','index.html'],
  ['/style.css','text/css; charset=utf-8','style.css'],
  ['/app.js','text/javascript; charset=utf-8','app.js']];
for (const file of readdirSync('.').filter(file=>file.endsWith('.webp'))) {
  list.push(['/'+file,'image/webp',file]);
}
const assets = Object.fromEntries(list.map(([url,type,path]) => [
  url,[type,readFileSync(path,type.startsWith('image/') ? 'base64' : 'utf8')]
]));
const caseList = Object.values(cases);
const heroSlides = caseList.map(({id,title,tag,accent,teaser},index) => {
  const cover = id === '001' ? 'hero' : 'cover-'+id;
  const heading = id === '001' ? '23시 17분,<br><em>정전.</em>' : title;
  return '<section class="hero hero-slide" data-hero-slide aria-roledescription="슬라이드" aria-label="'+(index+1)+' / '+caseList.length+' · '+title+
    '" style="--accent:'+accent+';--cover:url(/'+cover+'.webp)"'+(index ? ' hidden' : '')+'>'+
    '<div class="hero-content"><p class="eyebrow"><span class="dot"></span> CASE '+id+' <span class="line"></span> '+tag+'</p>'+
    '<h1>'+heading+'</h1><p class="deck">'+teaser+'</p>'+
    '<div class="actions"><button class="primary" data-action="solo" data-case="'+id+'" data-title="'+title+'">혼자 체험하기 <b aria-hidden="true">→</b></button>'+
    '<button class="ghost" data-action="create" data-case="'+id+'" data-title="'+title+'">방 만들기</button></div>'+
    '<p class="meta"><span>약 15분</span><span>2–4인</span><span>가입 없이 입장</span><a class="catalog-jump" href="#cases">전체 사건 보기 ↓</a></p></div>'+
    (id==='001' ? '<p class="capture"><span></span> CAM 03 &nbsp; / &nbsp; 23:17:00</p>' : '')+'</section>';
}).join('');
assets['/'][1] = assets['/'][1].replace('<!-- CASE_HERO -->',
  '<div class="home-stage"><div class="case-hero" role="region" aria-label="추천 사건" aria-roledescription="슬라이드 배너">'+heroSlides+
  '<div class="hero-nav"><button type="button" class="hero-control hero-pause" data-hero-pause aria-label="자동 넘김 일시정지" title="자동 넘김 일시정지">Ⅱ</button>'+
  '<button type="button" class="hero-control hero-arrow hero-prev" data-hero-prev aria-label="이전 사건"></button>'+
  '<button type="button" class="hero-control hero-arrow hero-next" data-hero-next aria-label="다음 사건"></button></div>'+
  '<span class="visually-hidden" data-hero-status aria-live="polite"></span></div></div>');
const caseCards = Object.values(cases).map(({id,title,tag,teaser,accent}) =>
  '<article class="catalog-card" id="case-'+id+'" style="--theme:'+accent+'">'+
  '<div class="folder-tab"><span>사건 '+id+'</span></div>'+
  '<div class="catalog-photo" style="--file-cover:url(/'+(id==='001'?'hero':'cover-'+id)+'.webp)" aria-hidden="true"></div>'+
  '<p class="catalog-setting">'+tag+'</p><h3>'+title+'</h3><p>'+teaser+'</p>'+
  '<div class="actions"><button class="ghost folder-play" data-action="solo" data-case="'+id+'" data-title="'+title+'">혼자 체험하기 →</button>'+
  '<button class="ghost folder-create" data-action="create" data-case="'+id+'" data-title="'+title+'">방 만들기</button></div></article>').join('');
assets['/'][1] = assets['/'][1].replace('<!-- CASE_CATALOG -->',
  '<section class="catalog" id="cases"><div class="section-title"><h2>사건 목록</h2><button class="catalog-join join-trigger" type="button">초대 코드 입력</button></div><div class="catalog-grid">'+caseCards+'</div></section>');
const game = ['case.js','cases.js'].map(path=>readFileSync(path,'utf8')
  .replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const worker = readFileSync('worker.js','utf8').replace(/^import .*\r?\n/gm,'');
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',game+'\nconst assets = '+JSON.stringify(assets)+';\n'+worker);

