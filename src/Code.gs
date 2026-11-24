/**
 * 현장 인원/측정기 관리 — Google Apps Script 백엔드
 * 데이터는 이 스크립트가 연결된 Google 스프레드시트의 시트(sites/people/instruments/log)에 저장됩니다.
 */

var SCHEMA = {
  sites:       ['id','name','client','location','period','note','updated_at','updated_by'],
  people:      ['id','name','affiliation','role','phone','site_id','note','updated_at','updated_by','email','birth','hired','status','status_until'],
  instruments: ['id','category','name','maker','model','serial','status','cal_date','cal_cycle','cal_due','cal_no','cal_type','site_id','holder','note','updated_at','updated_by'],
  standards:   ['id','order','cat','equip','item','sub','stage','kr_std','kr_crit','intl_std','intl_crit','note','tag','updated'],
  log:         ['at','by','entity','action','detail']
};

/* ---------- 웹앱 진입 ---------- */
var APP_URL = 'https://axell92.github.io/etlink-app/';   // 실제 앱(GitHub Pages) 주소

function doGet(e) {
  ensureSheets_();
  // ?api=1 : JSON API
  if (e && e.parameter && e.parameter.api) return json_(function(){ checkPin_(e.parameter.pin); return getAll(); });
  // 그 외: 앱 주소로 안내 (화면 코드는 GitHub Pages에서만 관리)
  var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>현장 관리</title></head><body style="font-family:sans-serif;padding:40px 20px;text-align:center;color:#111">' +
    '<h2>현장 관리</h2><p>앱은 아래 주소에서 실행됩니다.</p>' +
    '<p><a href="' + APP_URL + '" target="_top" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">앱 열기</a></p>' +
    '<p style="color:#6b7280;font-size:13px">' + APP_URL + '</p></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('현장 관리').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- JSON API (POST) : {fn, args, pin} ---------- */
function doPost(e) {
  return json_(function(){
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkPin_(body.pin);
    return rpc(body.fn, body.args);
  });
}
/* 접속 코드: Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성에 PIN 을 추가하면 켜짐. 없으면 검사 안 함 */
function checkPin_(pin) {
  var want = PropertiesService.getScriptProperties().getProperty('PIN');
  if (want && String(pin || '') !== String(want)) throw new Error('PIN_REQUIRED');
}
function json_(fn) {
  var out;
  try { out = { ok: true, data: fn() }; }
  catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 클라이언트가 호출하는 단일 진입점 ---------- */
function rpc(fn, args) {
  var map = {
    getAll: getAll,
    saveSite: saveSite, deleteSite: deleteSite,
    savePerson: savePerson, deletePerson: deletePerson,
    saveInstrument: saveInstrument, deleteInstrument: deleteInstrument,
    assignInstruments: assignInstruments, assignPeople: assignPeople,
    saveStandard: saveStandard, deleteStandard: deleteStandard
  };
  if (!map[fn]) throw new Error('알 수 없는 함수: ' + fn);
  return map[fn].apply(null, args || []);
}

/* ---------- API ---------- */
function getAll() {
  ensureSheets_();
  fixIds_();
  return { sites: read_('sites'), people: read_('people'), instruments: read_('instruments'), standards: read_('standards') };
}
/* id 가 비어 있는데 이름이 있는 행 → id 자동 부여 (시트에 직접 붙여넣은 행 대비) */
function fixIds_() {
  ['sites','people','instruments','standards'].forEach(function(name){
    var sh = sheet_(name), last = sh.getLastRow();
    if (last < 2) return;
    var rng = sh.getRange(2, 1, last - 1, 5), vals = rng.getValues(), changed = false;
    vals.forEach(function(r){ if (!r[0] && (r[1] || r[2] || r[3] || r[4])) { r[0] = Utilities.getUuid().slice(0, 8); changed = true; } });
    if (changed) sh.getRange(2, 1, last - 1, 1).setValues(vals.map(function(r){ return [r[0]]; }));
  });
}
// 쓰기 함수는 바뀐 시트만 돌려줌 → 클라이언트가 병합 (전체 재전송보다 빠름)
function part_(name) { var o = {}; o[name] = read_(name); return o; }
function saveSite(o, by)        { return withLock_(function(){ upsert_('sites', o, by);       return part_('sites'); }); }
function savePerson(o, by)      { return withLock_(function(){ upsert_('people', o, by);      return part_('people'); }); }
function saveInstrument(o, by)  { return withLock_(function(){ upsert_('instruments', o, by); return part_('instruments'); }); }
function deletePerson(id, by)   { return withLock_(function(){ remove_('people', id, by);      return part_('people'); }); }
function saveStandard(o, by)     { return withLock_(function(){ upsert_('standards', o, by);   return part_('standards'); }); }
function deleteStandard(id, by)  { return withLock_(function(){ remove_('standards', id, by);  return part_('standards'); }); }
function deleteInstrument(id,by){ return withLock_(function(){ remove_('instruments', id, by); return part_('instruments'); }); }
function assignInstruments(ids, siteId, by) { return assignRows_('instruments', ids, siteId, by); }
function assignPeople(ids, siteId, by)      { return assignRows_('people', ids, siteId, by); }
function assignRows_(name, ids, siteId, by) { return withLock_(function(){ return assignNoLock_(name, ids, siteId, by); }); }
function assignNoLock_(name, ids, siteId, by) {
  {
    var set = {}; (ids || []).forEach(function(i){ set[String(i)] = true; });
    var sh = sheet_(name), cols = SCHEMA[name], last = sh.getLastRow();
    if (last < 2) return getAll();
    var rng = sh.getRange(2, 1, last - 1, cols.length), vals = rng.getValues();
    var iSite = cols.indexOf('site_id'), iAt = cols.indexOf('updated_at'), iBy = cols.indexOf('updated_by');
    var now = new Date().toISOString(), moved = [];
    vals.forEach(function(row){
      if (!set[String(row[0])]) return;
      row[iSite] = siteId || ''; row[iAt] = now; row[iBy] = by || '';
      var o = {}; cols.forEach(function(c, i){ o[c] = norm_(row[i]); });
      moved.push(name === 'people' ? (o.name || '') : labelUnit_(o));
    });
    rng.setValues(vals.map(function(r){ return r.map(function(v){ return v instanceof Date ? norm_(v) : v; }); }));
    if (moved.length) log_(by, name, '이동', moved.length + (name === 'people' ? '명' : '대') + ' → ' + siteLabel_(siteId) + ': ' + moved.join(', '));
    return part_(name);
  }
}
function deleteSite(id, by) {
  return withLock_(function(){
    // 소속 인원/측정기는 미배정으로 (일괄)
    ['people','instruments'].forEach(function(k){
      var ids = read_(k).filter(function(r){ return r.site_id === id; }).map(function(r){ return r.id; });
      if (ids.length) assignNoLock_(k, ids, '', by);
    });
    remove_('sites', id, by);
    return getAll();
  });
}

/* ---------- 내부 ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSheets_() {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function(name){
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      // 날짜/번호가 자동 변환되지 않도록 전체를 텍스트 서식으로 (생성 때 1회)
      sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), SCHEMA[name].length).setNumberFormat('@');
    } else {
      // 스키마에 새 열이 생기면 헤더 끝에 자동 추가 (기존 열 순서는 유지)
      var lastCol = Math.max(sh.getLastColumn(), 1);
      var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
      SCHEMA[name].forEach(function(c, i){
        if (header.indexOf(c) < 0) sh.getRange(1, i + 1).setValue(c).setFontWeight('bold');
      });
    }
  });
  var first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' || first.getName() === '시트1') {
    if (first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  }
}

function sheet_(name) { return ss_().getSheetByName(name); }

function read_(name) {
  var sh = sheet_(name), cols = SCHEMA[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var out = [];
  vals.forEach(function(row){
    if (!row[0]) return;
    var o = {};
    cols.forEach(function(c, i){ o[c] = norm_(row[i]); });
    out.push(o);
  });
  return out;
}

function norm_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function findRow_(name, id) {
  var sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function upsert_(name, o, by, silent) {
  var sh = sheet_(name), cols = SCHEMA[name];
  o = o || {};
  if (!o.id || String(o.id).indexOf('tmp_') === 0) o.id = Utilities.getUuid().slice(0, 8);
  o.updated_at = new Date().toISOString();
  o.updated_by = by || '';
  var row = cols.map(function(c){ return o[c] == null ? '' : String(o[c]); });
  var r = findRow_(name, o.id);
  var isNew = r < 0;
  if (isNew) { sh.appendRow(row); r = sh.getLastRow(); }
  else sh.getRange(r, 1, 1, cols.length).setValues([row]);
  sh.getRange(r, 1, 1, cols.length).setNumberFormat('@');
  if (!silent) log_(by, name, isNew ? '추가' : '수정', label_(name, o));
  return o;
}

function remove_(name, id, by) {
  var r = findRow_(name, id);
  if (r < 0) return;
  var cols = SCHEMA[name];
  var vals = sheet_(name).getRange(r, 1, 1, cols.length).getValues()[0];
  var o = {}; cols.forEach(function(c, i){ o[c] = norm_(vals[i]); });
  sheet_(name).deleteRow(r);
  log_(by, name, '삭제', label_(name, o));
}

function label_(name, o) {
  if (name === 'sites') return o.name || '';
  if (name === 'people') return (o.name || '') + ' → ' + siteLabel_(o.site_id);
  if (name === 'standards') return [o.cat, o.equip, o.item, o.sub].filter(Boolean).join(' › ');
  return labelUnit_(o) + ' → ' + siteLabel_(o.site_id);
}
function labelUnit_(o) { return [o.name, o.maker, o.model, o.serial ? 'S/N ' + o.serial : ''].filter(Boolean).join(' '); }
var siteCache_ = null;
function siteLabel_(id) {
  if (!id) return '사무실';
  if (!siteCache_) siteCache_ = read_('sites');
  var s = siteCache_.filter(function(x){ return x.id === id; })[0];
  return s ? s.name : '(삭제된 현장)';
}

function log_(by, entity, action, detail) {
  try { sheet_('log').appendRow([new Date().toISOString(), by || '', entity, action, detail]); } catch (e) {}
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}
