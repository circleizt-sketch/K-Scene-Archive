/** HtmlService 진입점입니다. 샘플 정답은 운영 HTML에 포함하지 않습니다. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('K-Scene Archive').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
/** 서버 오류를 한 가지 JSON 형식으로 전달하고 내부 예외는 숨깁니다. */
function response_(fn) {
  try { return { ok: true, data: fn() }; }
  catch (e) {
    if (!e.appCode) console.error('K-Scene server operation failed: ' + (e.name || 'Error'));
    return { ok: false, error: { code: e.appCode || 'SERVER', message: e.appCode ? e.message : '서버 처리에 실패했습니다. 잠시 후 다시 시도하거나 교수자에게 문의해 주세요.' } };
  }
}
/** 공개 카드 목록은 정답·분석을 제거한 앞면 데이터만 반환합니다. */
function getGallery() { return response_(function() {
  var teams = rows_('Teams').filter(active_).sort(function(a,b) { return Number(a.sortOrder) - Number(b.sortOrder); });
  var ids = teams.map(function(t) { return t.teamId; });
  return { teams: teams.map(publicTeam_), cards: rows_('Cards').filter(function(c) { return c.status === 'published' && ids.indexOf(c.teamId) >= 0; }).map(front_) };
}); }
/** 실제 선택을 받은 뒤 서버가 판정하고 해당 카드 분석을 반환합니다. */
function submitQuiz(cardId, choiceId, version) { return response_(function() {
  var c = card_(cardId); team_(c.teamId, false);
  if (c.status !== 'published') fail_('NOT_FOUND', '공개 중인 카드만 열람할 수 있습니다.');
  version_(c, version);
  var choices = JSON.parse(c.quizOptionsJson);
  if (!choices.some(function(o) { return o.id === choiceId; })) fail_('VALIDATION', '답안을 하나 선택해 주세요.');
  return { correct: choiceId === c.correctChoiceId, chosenChoiceId: choiceId, card: quizResultCard_(c) };
}); }
function login(kind, teamId, code) { return response_(function() { return login_(kind, teamId, code); }); }
function logout(token) { return response_(function() { return locked_(function() {
  session_(token, false); props_().deleteProperty('SESSION_' + sha_(token)); return true;
}); }); }
function getWorkspace(token) { return response_(function() {
  var s = session_(token, false);
  return { role: s.role, teamId: s.teamId, teams: rows_('Teams').filter(function(t) { return s.role === 'admin' || t.teamId === s.teamId; }).map(publicTeam_), cards: rows_('Cards').filter(function(c) { return s.role === 'admin' || c.teamId === s.teamId; }).map(full_) };
}); }
function version_(card, version) {
  if (!Number.isInteger(version) || Number(card.version) !== version) fail_('CONFLICT', '다른 사용자가 먼저 수정했습니다. 입력 내용을 복사한 뒤 목록을 새로고침하여 최신 카드를 열어 주세요.');
}
function text_(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) fail_('VALIDATION', label + ' 입력 길이 또는 형식을 확인해 주세요.');
  return value.trim();
}
/** 허용된 YouTube 도메인과 영상 ID만 검증합니다. 임의 URL은 저장하지 않습니다. */
function youtube_(url) {
  if (typeof url !== 'string' || url.length > 600) fail_('VIDEO', 'YouTube 영상 URL을 확인해 주세요.');
  var m = url.match(/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/([^#]*)(?:#.*)?$/i);
  if (!m) fail_('VIDEO', 'https://로 시작하는 YouTube 일반·Shorts·youtu.be 링크를 입력해 주세요.');
  var rest = m[3], id;
  if (m[2].toLowerCase() === 'youtu.be') id = rest.split('?')[0];
  else if (/^(shorts|embed)\//.test(rest)) id = rest.split('/')[1].split('?')[0];
  else if (/^watch\?/.test(rest)) { var q = rest.match(/[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/); id = q && q[1]; }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) fail_('VIDEO', '올바른 YouTube 영상 ID를 포함한 URL을 입력해 주세요.');
  var time = rest.match(/[?&](?:t|start)=([^&]+)/), start = 0;
  if (time) {
    var t; try { t = decodeURIComponent(time[1]); } catch (e) { fail_('VIDEO', '시작 시간을 확인해 주세요.'); }
    if (/^\d+$/.test(t)) start = Number(t);
    else { var parts = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/); if (!parts || !t) fail_('VIDEO', '시작 시간은 초 또는 1m30s 형식으로 입력해 주세요.'); start = Number(parts[1] || 0)*3600 + Number(parts[2] || 0)*60 + Number(parts[3] || 0); }
  }
  if (!Number.isSafeInteger(start) || start > 604800) fail_('VIDEO', '영상 시작 시간 범위를 확인해 주세요.');
  return 'https://www.youtube.com/watch?v=' + id + (start ? '&t=' + start : '');
}
/** 임시저장은 빈 항목을 허용하고 제출에서는 학습에 필요한 항목을 검증합니다. */
function cleanCard_(input, final) {
  if (!input || typeof input !== 'object') fail_('VALIDATION', '카드 입력값을 확인해 주세요.');
  var c = {};
  ['title','contentTitle','videoUrl','description','context','relationship','mainExpression','discourseAnalysis','nonverbalAnalysis','culturalContext','learningPoint','quizQuestion','correctChoiceId','quizExplanation'].forEach(function(k) { c[k] = text_(input[k], k, k === 'title' || k === 'contentTitle' ? 160 : 6000); });
  if (c.videoUrl) c.videoUrl = youtube_(c.videoUrl);
  if (!Array.isArray(input.tags) || input.tags.length > 3) fail_('VALIDATION', '태그는 최대 3개까지 입력해 주세요.');
  c.tagsJson = JSON.stringify(input.tags.map(function(t) { return text_(t, '태그', 30); }).filter(Boolean));
  if (!Array.isArray(input.quizOptions) || input.quizOptions.length < 3 || input.quizOptions.length > 4) fail_('VALIDATION', '선택지는 3~4개여야 합니다.');
  var options = input.quizOptions.map(function(o, i) { return { id: String.fromCharCode(65+i), text: text_(o.text, '선택지', 1000) }; });
  c.quizOptionsJson = JSON.stringify(options);
  if (c.correctChoiceId && !options.some(function(o) { return o.id === c.correctChoiceId; })) fail_('VALIDATION', '정답 선택지를 확인해 주세요.');
  if (final) {
    var required = { title:'카드 제목', contentTitle:'콘텐츠명', videoUrl:'영상 URL', description:'장면 소개', quizQuestion:'퀴즈 질문', correctChoiceId:'정답', quizExplanation:'정답 해설' };
    Object.keys(required).forEach(function(k) { if (!c[k]) fail_('VALIDATION', required[k] + '을(를) 입력해 주세요.'); });
    if (options.some(function(o) { return !o.text; })) fail_('VALIDATION', '모든 선택지 내용을 입력해 주세요.');
  }
  return c;
}
function saveCard(token, input, action) { return response_(function() { return locked_(function() {
  var s = session_(token, false);
  if (s.role !== 'team') fail_('FORBIDDEN', '카드 작성은 팀 작업실에서 진행해 주세요.');
  if (['draft','publish','submit'].indexOf(action) < 0) fail_('VALIDATION', '저장 방법을 확인해 주세요.');
  if (!input || input.teamId !== s.teamId) fail_('FORBIDDEN', '자신의 팀에만 저장할 수 있습니다.');
  var old = input.cardId ? card_(input.cardId) : null;
  if (old) {
    own_(s, old); version_(old, input.version);
    if (['draft','submitted','revision','published'].indexOf(old.status) < 0) fail_('STATE', '보관된 카드입니다. 교수자에게 보관 해제를 요청해 주세요.');
  }
  // 이전 화면의 submit 요청도 승인 없이 직접 공개합니다.
  var publish = action === 'publish' || action === 'submit';
  var c = cleanCard_(input, publish), now = new Date().toISOString();
  c.cardId = old ? old.cardId : Utilities.getUuid(); c.teamId = s.teamId;
  c.status = publish ? 'published' : 'draft';
  c.teacherFeedback = old ? old.teacherFeedback : ''; c.version = old ? Number(old.version) + 1 : 1;
  c.createdAt = old ? old.createdAt : now; c.updatedAt = now; c.publishedAt = publish ? (old && old.status === 'published' && old.publishedAt ? old.publishedAt : now) : (old ? old.publishedAt : '');
  if (old) c._row = old._row;
  writeRow_('Cards', c); return full_(c);
}); }); }
/** 학생 삭제는 자기 팀 작성 중 카드만 허용합니다. */
function deleteCard(token, cardId, version) { return response_(function() { return locked_(function() {
  var s = session_(token, false), c = card_(cardId); own_(s, c); version_(c, version);
  if (s.role !== 'team' || c.status !== 'draft') fail_('STATE', '자기 팀의 작성 중 카드만 삭제할 수 있습니다.');
  sheet_('Cards').deleteRow(c._row); return true;
}); }); }
/** 교수자 코멘트는 공개 상태와 분리해 저장합니다. 팀과 교수자만 조회할 수 있습니다. */
function reviewCard(token, cardId, version, action, feedback) { return response_(function() { return locked_(function() {
  session_(token, true); var c = card_(cardId); version_(c, version);
  if (action === 'comment') {
    c.teacherFeedback = text_(feedback, '교수자 코멘트', 6000);
  } else if (action === 'archive' && c.status !== 'archived') {
    c.status = 'archived';
  } else if (action === 'restore' && c.status === 'archived') {
    // 보관을 해제하면 팀이 내용을 확인한 뒤 다시 공개하도록 작성 중으로 돌립니다.
    c.status = 'draft';
  } else {
    fail_('STATE', '현재 상태에서 처리할 수 없습니다. 목록을 새로고침해 주세요.');
  }
  c.version = Number(c.version) + 1; c.updatedAt = new Date().toISOString();
  writeRow_('Cards', c); return full_(c);
}); }); }
/** 팀 추가·이름·정렬·활성 상태·편집 코드 갱신을 처리합니다. */
function saveTeam(token, input) { return response_(function() { return locked_(function() {
  session_(token, true);
  if (!input || !/^[A-Za-z0-9_-]{1,40}$/.test(input.teamId)) fail_('VALIDATION', '팀 ID는 영문·숫자·밑줄·하이픈 1~40자로 입력해 주세요.');
  var old = rows_('Teams').filter(function(t) { return t.teamId === input.teamId; })[0];
  if (!old && rows_('Teams').length >= 50) fail_('VALIDATION', '팀은 최대 50개까지 지원합니다.');
  var name = text_(input.teamName, '팀명', 100), description = text_(input.teamDescription, '팀 소개', 500);
  if (!name || !Number.isInteger(input.sortOrder) || input.sortOrder < 1 || input.sortOrder > 999 || typeof input.active !== 'boolean') fail_('VALIDATION', '팀명·정렬 번호·활성 상태를 확인해 주세요.');
  var code = input.editCode;
  if (!old || code) { validateCode_(code); uniqueCode_(code, input.teamId); }
  var t = { teamId:input.teamId, teamName:name, teamDescription:description, sortOrder:input.sortOrder, active:input.active, editCodeSalt:old ? old.editCodeSalt : '', editCodeHash:old ? old.editCodeHash : '' };
  if (code) { t.editCodeSalt = salt_(); t.editCodeHash = codeHash_(code, t.editCodeSalt); }
  if (old) t._row = old._row;
  writeRow_('Teams', t);
  if (code || !t.active) revoke_('team', t.teamId);
  return publicTeam_(t);
}); }); }
/** 교수자는 현재 관리자 세션으로 관리자 코드를 변경할 수 있습니다. */
function changeAdminCode(token, code) { return response_(function() { return locked_(function() {
  session_(token, true); validateCode_(code); uniqueCode_(code, null);
  var salt = salt_(); props_().setProperties({ ADMIN_SALT:salt, ADMIN_HASH:codeHash_(code,salt) }); revoke_('admin'); return true;
}); }); }
