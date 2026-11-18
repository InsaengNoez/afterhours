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
const caseCards = Object.values(cases).map(({id,title,tag,teaser,icon,accent}) =>
  '<article class="catalog-card" id="case-'+id+'" style="--theme:'+accent+'">'+
  '<div class="catalog-top"><span class="case-symbol" aria-hidden="true">'+icon+'</span><span class="number">CASE '+id+'</span></div>'+
  '<p class="catalog-setting">'+tag+'</p><h3>'+title+'</h3><p>'+teaser+'</p>'+
  '<div class="actions"><button class="ghost" data-action="create" data-case="'+id+'" data-title="'+title+'">방 만들기</button>'+
  '<button class="ghost" data-action="solo" data-case="'+id+'" data-title="'+title+'">혼자 체험 →</button></div></article>').join('');
assets['/'][1] = assets['/'][1].replace('<!-- CASE_CATALOG -->',
  '<section class="catalog" id="cases"><div class="section-title"><h2>사건 목록</h2><span>2–4인 · 약 15분</span></div><div class="catalog-grid">'+caseCards+'</div></section>');
const game = ['case.js','cases.js'].map(path=>readFileSync(path,'utf8')
  .replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'')).join('\n');
const worker = readFileSync('worker.js','utf8').replace(/^import .*\r?\n/gm,'');
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',game+'\nconst assets = '+JSON.stringify(assets)+';\n'+worker);

