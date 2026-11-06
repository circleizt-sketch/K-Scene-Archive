/** 인증 코드는 솔트 해시만 저장하며 세션 원문은 저장하지 않습니다. */
var SESSION_MS_ = 6 * 60 * 60 * 1000;
var LOGIN_WINDOW_MS_ = 15 * 60 * 1000;
function props_() { return PropertiesService.getScriptProperties(); }
function sha_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function salt_() { return Utilities.getUuid() + Utilities.getUuid(); }
function codeHash_(code, salt) {
  var hash = salt + ':' + code;
  for (var i = 0; i < 1000; i++) hash = sha_(hash + salt);
  return hash;
}
/** 같은 길이 해시는 끝까지 비교합니다. */
function same_(a, b) {
  a = String(a || ''); b = String(b || ''); var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function validateCode_(code) {
  if (typeof code !== 'string' || code.length < 5 || code.length > 15 || !code.trim()) fail_('CODE', '관리자·팀 코드는 공백이 아닌 5~15자로 설정해 주세요.');
}
function uniqueCode_(code, excludeTeam) {
  if (same_(codeHash_(code, props_().getProperty('ADMIN_SALT')), props_().getProperty('ADMIN_HASH'))) fail_('CODE', '관리자와 다른 코드를 사용해 주세요.');
  rows_('Teams').forEach(function(t) {
    if (t.teamId !== excludeTeam && same_(codeHash_(code, t.editCodeSalt), t.editCodeHash)) fail_('CODE', '다른 팀과 다른 코드를 사용해 주세요.');
  });
}
/** 만료 세션·실패 기록을 정리하여 Script Properties 크기를 제한합니다. */
function cleanupAuth_() {
  var all = props_().getProperties(), now = Date.now(), count = 0;
  Object.keys(all).forEach(function(key) {
    if (/^(SESSION_|ATTEMPT_)/.test(key)) {
      var item; try { item = JSON.parse(all[key]); } catch (e) { item = {}; }
      if (!item.expiresAt || item.expiresAt <= now) props_().deleteProperty(key);
      else if (key.indexOf('SESSION_') === 0) count++;
    }
  });
  return count;
}
/** 로그인 실패 제한은 팀/관리자 계정 단위로 15분간 5회입니다. */
function login_(kind, teamId, code) {
  if (kind !== 'team' && kind !== 'admin') fail_('AUTH', '로그인 유형을 확인해 주세요.');
  if (typeof code !== 'string' || code.length > 128) fail_('AUTH', '로그인 정보를 확인해 주세요.');
  return locked_(function() {
    var count = cleanupAuth_(), id = kind === 'admin' ? 'admin' : String(teamId || '');
    var team = kind === 'team' ? team_(id, false) : null;
    var key = 'ATTEMPT_' + sha_(kind + ':' + id), raw = props_().getProperty(key);
    var attempt = raw ? JSON.parse(raw) : { count: 0, expiresAt: Date.now() + LOGIN_WINDOW_MS_ };
    if (attempt.count >= 5) fail_('RATE_LIMIT', '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.');
    var salt = team ? team.editCodeSalt : props_().getProperty('ADMIN_SALT');
    var hash = team ? team.editCodeHash : props_().getProperty('ADMIN_HASH');
    if (!salt || !hash) fail_('SETUP', '관리자 인증 초기화가 필요합니다.');
    if (!same_(codeHash_(code, salt), hash)) {
      attempt.count++; props_().setProperty(key, JSON.stringify(attempt));
      fail_('AUTH', '팀 또는 코드를 확인해 주세요.');
    }
    if (count >= 400) fail_('BUSY', '현재 접속이 많습니다. 교수자에게 문의해 주세요.');
    props_().deleteProperty(key);
    var token = salt_(), session = { role: kind, teamId: team ? team.teamId : null, expiresAt: Date.now() + SESSION_MS_ };
    props_().setProperty('SESSION_' + sha_(token), JSON.stringify(session));
    return { token: token, role: session.role, teamId: session.teamId, expiresAt: session.expiresAt };
  });
}
/** 모든 비공개 읽기와 변경 작업에서 호출합니다. */
function session_(token, adminOnly) {
  if (typeof token !== 'string' || token.length > 100) fail_('AUTH', '로그인이 필요합니다.');
  var raw = props_().getProperty('SESSION_' + sha_(token)), s = raw ? JSON.parse(raw) : null;
  if (!s || s.expiresAt <= Date.now()) fail_('AUTH', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  if (adminOnly && s.role !== 'admin') fail_('FORBIDDEN', '교수자 권한이 필요합니다.');
  if (s.role === 'team') team_(s.teamId, false);
  return s;
}
function own_(s, card) {
  if (s.role !== 'admin' && s.teamId !== card.teamId) fail_('FORBIDDEN', '다른 팀의 카드를 수정하거나 열람할 수 없습니다.');
}
/** 코드 변경 시 해당 계정의 기존 세션을 모두 폐기합니다. 잠금 안에서 호출합니다. */
function revoke_(role, id) {
  var all = props_().getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf('SESSION_') === 0) {
      var s = JSON.parse(all[key]);
      if (s.role === role && (role === 'admin' || s.teamId === id)) props_().deleteProperty(key);
    }
  });
}
