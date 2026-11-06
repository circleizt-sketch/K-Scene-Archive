/** 시트 구조와 공통 저장 처리를 담당합니다. 헤더 순서를 바꾸지 마세요. */
var TEAM_HEADERS_ = ['teamId','teamName','teamDescription','sortOrder','active','editCodeHash','editCodeSalt'];
var CARD_HEADERS_ = ['cardId','teamId','title','contentTitle','videoUrl','description','tagsJson','context','relationship','mainExpression','discourseAnalysis','nonverbalAnalysis','culturalContext','learningPoint','quizQuestion','quizOptionsJson','correctChoiceId','quizExplanation','status','teacherFeedback','version','createdAt','updatedAt','publishedAt'];

/** 사용자에게 안전하게 보여 줄 업무 오류를 만듭니다. */
function fail_(code, message) { var e = new Error(message); e.appCode = code; throw e; }

/** 모든 수정은 같은 스크립트 잠금을 사용해 순서대로 처리합니다. */
function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail_('BUSY', '다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** 시트 연결은 서버 속성만 사용합니다. 학생에게 ID를 전달하지 않습니다. */
function database_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fail_('SETUP', '교수자가 스프레드시트 연결을 설정해야 합니다.');
  try { return SpreadsheetApp.openById(id); }
  catch (e) { fail_('SHEETS', '학습 자료 저장소에 연결할 수 없습니다. 교수자에게 문의해 주세요.'); }
}

/** 초기화 때만 누락된 시트를 만들며 기존 데이터는 보존합니다. */
function ensureSheet_(name, headers) {
  var db = database_(), sheet = db.getSheetByName(name);
  if (!sheet) { sheet = db.insertSheet(name); sheet.getRange(1, 1, 1, headers.length).setValues([headers]); sheet.setFrozenRows(1); }
  checkHeaders_(sheet, headers);
  return sheet;
}
function checkHeaders_(sheet, headers) {
  var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(headers)) fail_('SCHEMA', '시트 열 구조가 올바르지 않습니다. 교수자가 헤더를 확인해 주세요.');
}
function sheet_(name) {
  var sheet = database_().getSheetByName(name);
  if (!sheet) fail_('SETUP', '데이터 시트 초기화가 필요합니다. 교수자에게 문의해 주세요.');
  checkHeaders_(sheet, name === 'Teams' ? TEAM_HEADERS_ : CARD_HEADERS_);
  return sheet;
}

/** 수식 주입을 막고 텍스트 원문을 왕복 보존합니다. */
function cellEncode_(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' && /^[=+\-@'\u200B]/.test(v) ? '\u200B' + v : v;
}
function cellDecode_(v) {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' && /^\u200B/.test(v) ? v.slice(1) : v;
}
function rows_(name) {
  var sheet = sheet_(name), headers = name === 'Teams' ? TEAM_HEADERS_ : CARD_HEADERS_;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row, i) {
    var obj = { _row: i + 2 }; headers.forEach(function(key, j) { obj[key] = cellDecode_(row[j]); }); return obj;
  }).filter(function(row) { return !!row[headers[0]]; });
}
function writeRow_(name, obj) {
  var sheet = sheet_(name), headers = name === 'Teams' ? TEAM_HEADERS_ : CARD_HEADERS_;
  var row = obj._row || sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, headers.length).setValues([headers.map(function(key) { return cellEncode_(obj[key]); })]);
  SpreadsheetApp.flush();
  return obj;
}
function team_(id, allowInactive) {
  var team = rows_('Teams').filter(function(t) { return t.teamId === id; })[0];
  if (!team || (!allowInactive && !active_(team))) fail_('TEAM', '사용할 수 없는 팀입니다.');
  return team;
}
function active_(team) { return team.active === true || team.active === 'true'; }
function publicTeam_(t) { return { teamId: t.teamId, teamName: t.teamName, teamDescription: t.teamDescription, sortOrder: Number(t.sortOrder), active: active_(t) }; }
function card_(id) {
  var card = rows_('Cards').filter(function(c) { return c.cardId === id; })[0];
  if (!card) fail_('NOT_FOUND', '카드를 찾을 수 없거나 접근할 수 없습니다.');
  return card;
}
/** 공개 DTO는 허용 필드만 복사합니다. 정답·분석·피드백은 포함하지 않습니다. */
function front_(c) {
  var out = {};
  ['cardId','teamId','title','contentTitle','videoUrl','description','quizQuestion','version','createdAt','updatedAt','publishedAt'].forEach(function(k) { out[k] = c[k]; });
  out.tags = JSON.parse(c.tagsJson || '[]');
  out.quizOptions = JSON.parse(c.quizOptionsJson || '[]');
  return out;
}
function full_(c) {
  var out = front_(c);
  ['context','relationship','mainExpression','discourseAnalysis','nonverbalAnalysis','culturalContext','learningPoint','correctChoiceId','quizExplanation','status','teacherFeedback'].forEach(function(k) { out[k] = c[k]; });
  return out;
}

/** 퀴즈 완료 후 공개할 분석입니다. 교수자 비공개 코멘트는 제외합니다. */
function quizResultCard_(c) {
  var out = full_(c);
  delete out.teacherFeedback;
  return out;
}
