export const suspects = [
  ['서유진','전시실 큐레이터','“22시 49분에 진열장을 열었어요. 작품을 꺼내지는 않았습니다.”'],
  ['한도윤','야간 보안 담당','“정전 직후 분전반으로 달려갔어요. 전시실에 들어간 건 불이 돌아온 다음입니다.”'],
  ['오민서','작품 복원 담당','“22시 30분에 복제품 상태를 점검하고 퇴근했어요.”']
];

export const clues = [
  ['01','출입 기록','보안 시스템','22:48 유진 입실 → 22:52 유진 퇴실. 다음 입실은 23:19 도윤. 민서는 22:35에 건물을 나갔다.','22:48',-1],
  ['02','정전 보고서','설비 기록','23:17:00 조명 회로 과부하. 23:18:30 복구. 출입·진열장 센서는 별도 배터리 전원으로 정상 작동했다.','23:17',-1],
  ['03','진열장 개폐 기록','보안 시스템','22:49에 큐레이터 카드로 진열장을 열어 22:50에 닫았다. 22:00부터 복제품 발견 때까지 기록된 개방은 이것이 유일하다.','22:49',-1],
  ['04','감정 사진 대조','작품 감정','22:45 점검 사진의 달항아리 굽에는 원본의 반달 모양 유약 자국이 있다. 22:51 점검 사진에는 자국이 없다.','22:51',0],
  ['05','퇴실 CCTV','복도 카메라','22:52, 유진이 들어올 때 비어 있던 완충재 가방을 몸 앞에서 양손으로 받쳐 들고 전시실을 나갔다.','22:52',1],
  ['06','복제품 점검표','복원실','22:30 민서가 전시 조명 테스트용 복제품의 상태를 확인했다. 직후 유진이 복제품을 인수했다.','22:30',2],
  ['07','전기 작업 일지','시설팀','23:17 과부하는 야간 청소 장비를 조명 회로에 연결하면서 발생했다. 23:19 도윤이 진열장 상태를 육안으로 확인했다.','23:19',3]
];

export const times = ['22:30','22:49','23:17'];
export const phases = ['대기실','브리핑','조사','토론','지목','해설'];
export const durations = [0,120,300,300,60,0];
export const answer = [0,'22:49','04'];
export const reconstruction = [
  ['22:30','복제품이 큐레이터에게 넘어갔다','복원 담당 오민서가 조명 테스트용 복제품을 점검하고 서유진에게 넘겼다.'],
  ['22:45','진열장에는 아직 원본이 있었다','첫 점검 사진에는 원본의 반달 모양 유약 자국이 남아 있다.'],
  ['22:49','진열장이 단 한 번 열렸다','두 점검 사진이 찍힌 사이 진열장을 연 사람은 서유진뿐이었다. 유진은 이때 원본과 복제품을 바꿨다.'],
  ['22:51','두 번째 사진에서 자국이 사라졌다','진열장에 들어 있던 달항아리가 이미 복제품으로 바뀌었음을 보여준다.'],
  ['22:52','원본은 완충재 가방에 담겨 나갔다','유진은 들어올 때 비어 있던 가방을 몸 앞에서 양손으로 받쳐 들고 전시실을 나섰다.'],
  ['23:17','조명이 꺼졌다','청소 장비로 조명 회로에 과부하가 걸렸다. 별도 전원의 진열장 센서는 계속 작동했고, 정전 중 개방 기록은 없었다.']
];

export function evidenceVisual(id) {
  switch (id) {
    case '01':
      return recordTable('전시실 출입 이력', ['시각','출입자','기록'], [
        ['22:48','서유진','입실'],['22:52','서유진','퇴실'],['23:19','한도윤','입실']
      ],'access-log');
    case '02':
      return '<div class="exhibit outage"><div><span>조명 회로</span><strong>90<span>초</span></strong></div><div class="outage-track" aria-hidden="true"></div><div class="record-range"><time>23:17:00</time><time>23:18:30</time></div><p>출입·진열장 센서 정상</p></div>';
    case '03':
      return recordTable('진열장 센서 로그',['시각','상태'],[
        ['22:49','열림 · 큐레이터 카드'],['22:50','닫힘']
      ],'sensor-log');
    case '04':
      return '<figure class="exhibit comparison"><div class="photo-pair"><div><img src="/jar-before.webp" alt="굽에 반달 모양 유약 자국이 있는 달항아리"><time>22:45</time></div><div><img src="/jar-after.webp" alt="굽에 유약 자국이 없는 달항아리"><time>22:51</time></div></div><figcaption>달항아리 굽 확대 · 점검 사진</figcaption></figure>';
    case '05':
      return '<figure class="exhibit cctv"><img src="/corridor.webp" alt="복도에서 완충재 가방을 몸 앞에 붙여 양손으로 받쳐 든 서유진"><span class="live"><i></i> CAM 02</span><time>22:52</time></figure>';
    case '06':
      return '<div class="exhibit paper"><div class="paper-title">복제품 인수 기록 <span>22:30</span></div><dl><dt>점검</dt><dd>오민서</dd><dt>인수</dt><dd>서유진</dd><dt>용도</dt><dd>전시 조명 테스트</dd></dl></div>';
    case '07':
      return '<div class="exhibit maintenance"><ol><li><time>23:17</time><span>청소 장비 연결 · 조명 회로 과부하</span></li><li><time>23:18:30</time><span>조명 복구</span></li><li><time>23:19</time><span>진열장 육안 확인</span></li></ol></div>';
    default:
      return '';
  }
}

export function recordTable(title, columns, rows, style) {
  return '<div class="exhibit log '+style+'"><table><caption>'+title+'</caption><thead><tr>'+
    columns.map(column=>'<th scope="col">'+column+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(row=>'<tr>'+row.map((value,index)=>'<td>'+(index === 0 ? '<time>'+value+'</time>' : value)+'</td>').join('')+'</tr>').join('')+
    '</tbody></table></div>';
}
