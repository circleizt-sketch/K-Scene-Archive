/** 편집기 실행 메뉴에 표시할 설치용 진입점입니다. 내부 함수 이름은 유지합니다. */
function setupEnvironment() {
  requireSetupOperator_();
  return initialize_();
}

/** 교수자 본인이 편집기에서 실행해 가상 샘플을 추가합니다. */
function addSampleCards() {
  requireSetupOperator_();
  return seedDemoData_();
}

/** 교수자 본인이 편집기에서 실행해 기록된 샘플만 제거합니다. */
function removeSampleCards() {
  requireSetupOperator_();
  return removeDemoData_();
}

/** 교수자 본인이 속성에 등록한 새 관리자 코드로 복구합니다. */
function recoverAdminCode() {
  requireSetupOperator_();
  return resetAdminCode_();
}

/**
 * 공개 이름의 설치 함수가 웹에서 무단 호출되지 않도록 실행자 신원을 검사합니다.
 * 편집기에서는 실제 실행 계정, 배포자 실행 웹 앱에서는 배포 계정과 비교합니다.
 * 학생 로그인에는 Google 이메일을 사용하지 않습니다.
 */
function requireSetupOperator_() {
  var active = Session.getActiveUser().getEmail();
  var effective = Session.getEffectiveUser().getEmail();
  if (!active || !effective || active.toLowerCase() !== effective.toLowerCase()) {
    fail_('FORBIDDEN', '설치 함수는 교수자 계정으로 Apps Script 편집기에서 실행해 주세요.');
  }
}

/**
 * 최초 설치: 프로젝트 설정 > 스크립트 속성에 아래 값을 먼저 등록합니다.
 * SPREADSHEET_ID, ADMIN_SETUP_CODE, TEAM_SETUP_JSON
 * TEAM_SETUP_JSON 예시는 README를 참고하세요. 실제 코드는 소스에 적지 마세요.
 * 이 함수는 이름 끝의 _ 때문에 google.script.run에서 실행할 수 없습니다.
 */
function initialize_() {
  return locked_(function() {
    if (props_().getProperty('ADMIN_HASH')) fail_('SETUP', '이미 초기화되었습니다. 팀 관리는 교수자 화면을 사용하세요.');
    var admin = props_().getProperty('ADMIN_SETUP_CODE'), raw = props_().getProperty('TEAM_SETUP_JSON');
    validateCode_(admin);
    var teams; try { teams = JSON.parse(raw); } catch (e) { fail_('SETUP', 'TEAM_SETUP_JSON을 올바른 JSON 배열로 등록해 주세요.'); }
    if (!Array.isArray(teams) || !teams.length || teams.length > 50) fail_('SETUP', '팀을 1~50개 설정해 주세요.');
    var ids = {}, codes = [admin];
    teams.forEach(function(t) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(t.teamId) || ids[t.teamId] || !text_(t.teamName, '팀명', 100)) fail_('SETUP', '중복 없는 팀 ID와 팀명을 확인해 주세요.');
      ids[t.teamId] = true; validateCode_(t.editCode);
      if (codes.indexOf(t.editCode) >= 0) fail_('SETUP', '관리자와 모든 팀은 각각 다른 코드를 사용해야 합니다.');
      codes.push(t.editCode);
    });
    ensureSheet_('Teams', TEAM_HEADERS_); ensureSheet_('Cards', CARD_HEADERS_);
    if (rows_('Teams').length || rows_('Cards').length) fail_('SETUP', '기존 데이터가 있습니다. 새 빈 스프레드시트로 설치하거나 원본을 먼저 백업해 주세요.');
    teams.forEach(function(t, i) { var salt = salt_(); writeRow_('Teams', { teamId:t.teamId, teamName:t.teamName.trim(), teamDescription:'', sortOrder:i+1, active:true, editCodeHash:codeHash_(t.editCode,salt), editCodeSalt:salt }); });
    var salt = salt_(); props_().setProperties({ ADMIN_SALT:salt, ADMIN_HASH:codeHash_(admin,salt) });
    props_().deleteProperty('ADMIN_SETUP_CODE'); props_().deleteProperty('TEAM_SETUP_JSON');
    console.log('초기화 완료. 원문 설정 코드를 스크립트 속성에서 제거했습니다.');
  });
}
/** 관리자 코드를 잊었을 때 프로젝트 소유자가 속성 ADMIN_SETUP_CODE를 설정 후 실행합니다. */
function resetAdminCode_() {
  return locked_(function() {
    var code = props_().getProperty('ADMIN_SETUP_CODE'); validateCode_(code); uniqueCode_(code, null);
    var salt = salt_(); props_().setProperties({ ADMIN_SALT:salt, ADMIN_HASH:codeHash_(code,salt) });
    revoke_('admin'); props_().deleteProperty('ADMIN_SETUP_CODE');
    console.log('관리자 코드가 변경되었습니다. 기존 관리자 세션은 만료되었습니다.');
  });
}
