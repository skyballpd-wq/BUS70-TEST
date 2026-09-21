/* BUS70 TEST - dispatch-board image analysis and confirmed registration.
 * The image is analyzed only when a signed-in driver requests it. Results are
 * staged in CacheService and never written to 배차DB until the driver confirms. */

const BUS70_BOARD_MAX_BASE64 = 6500000;
const BUS70_BOARD_CANDIDATE_TTL = 600;

function bus70BoardAction_(body, driverId) {
  const action = String(body.action || '').trim();
  if (action === 'analyzeDispatchBoard') return bus70AnalyzeDispatchBoard_(body, driverId);
  if (action === 'registerDispatchBoard') return bus70RegisterDispatchBoard_(body, driverId);
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 배차판 요청입니다.'};
}

function bus70AnalyzeDispatchBoard_(body, driverId) {
  if (body.imageConsent !== true) {
    return {ok:false, error:'IMAGE_CONSENT_REQUIRED', message:'사진 판독 전송 동의가 필요합니다.'};
  }
  const date = normalizeDate_(body.date);
  const mimeType = String(body.mimeType || '').toLowerCase();
  const imageBase64 = String(body.imageBase64 || '').replace(/^data:[^,]+,/, '');
  if (!date || !/^image\/(jpeg|png|webp)$/.test(mimeType) || !imageBase64) {
    return {ok:false, error:'PARAM_REQUIRED', message:'날짜와 배차판 사진을 확인하세요.'};
  }
  if (imageBase64.length > BUS70_BOARD_MAX_BASE64) {
    return {ok:false, error:'IMAGE_TOO_LARGE', message:'사진 용량이 너무 큽니다. 다시 촬영하거나 작은 사진을 선택하세요.'};
  }

  const driverResult = apiGetDriver_(driverId);
  if (!driverResult.ok || !driverResult.driver) {
    return {ok:false, error:'DRIVER_UNAVAILABLE', message:'기사정보를 확인할 수 없습니다.'};
  }
  const driver = driverResult.driver;
  const apiKey = PropertiesService.getScriptProperties().getProperty('BUS70_GEMINI_API_KEY');
  if (!apiKey) {
    return {ok:false, error:'OCR_NOT_CONFIGURED', message:'배차판 자동 판독 서비스 설정이 필요합니다.'};
  }
  const model = PropertiesService.getScriptProperties().getProperty('BUS70_GEMINI_MODEL') || 'gemini-2.5-flash';
  const prompt = [
    '이 사진은 버스 70번 배차 상황판이다.',
    '대상 기사 이름은 "' + String(driver.name || '') + '"이고 근무조는 "' + String(driver.shift || '') + '조"이다.',
    '대상 기사의 해당 날짜 순차와 차량번호 뒤 3자리만 판독하라.',
    'A조는 위쪽, B조는 아래쪽이다. 빨간 숫자는 순차, 파란 숫자표는 차량번호 뒤 3자리다.',
    '이름표가 열 중앙에서 옆으로 치우쳐 있을 수 있으므로 이름표 바로 위 숫자만 단순 선택하지 말고,',
    '빨간 순차 행과 파란 차량번호 행의 동일 열 기준선을 확인하라.',
    '확실하지 않으면 값을 추측하지 말고 confidence를 낮추고 warnings에 이유를 적어라.',
    '사진 속 날짜는 사용하지 않는다. 반환 날짜는 ' + date + '이다.'
  ].join('\n');
  const payload = {
    contents:[{parts:[
      {text:prompt},
      {inlineData:{mimeType:mimeType, data:imageBase64}}
    ]}],
    generationConfig:{
      temperature:0,
      responseMimeType:'application/json',
      responseSchema:{
        type:'OBJECT',
        properties:{
          driverName:{type:'STRING'},
          shift:{type:'STRING'},
          sequence:{type:'INTEGER'},
          vehicleLast3:{type:'STRING'},
          confidence:{type:'NUMBER'},
          warnings:{type:'ARRAY', items:{type:'STRING'}},
          evidence:{type:'STRING'}
        },
        required:['driverName','shift','sequence','vehicleLast3','confidence','warnings','evidence']
      }
    }
  };
  let response;
  try {
    response = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey),
      {method:'post', contentType:'application/json', payload:JSON.stringify(payload), muteHttpExceptions:true}
    );
  } catch (err) {
    return {ok:false, error:'OCR_NETWORK_ERROR', message:'자동 판독 서버에 연결하지 못했습니다.'};
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    return {ok:false, error:'OCR_API_ERROR', message:'자동 판독 서버 응답을 확인할 수 없습니다.'};
  }
  let parsed;
  try {
    const raw = JSON.parse(response.getContentText());
    const text = raw.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  } catch (err) {
    return {ok:false, error:'OCR_PARSE_ERROR', message:'사진 판독 결과 형식을 확인할 수 없습니다.'};
  }

  const sequence = Number(parsed.sequence);
  const vehicleLast3 = String(parsed.vehicleLast3 || '').replace(/\D/g, '').slice(-3);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 5) : [];
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 11 || !/^\d{3}$/.test(vehicleLast3)) {
    return {ok:false, error:'OCR_UNCERTAIN', message:'순차 또는 차량번호를 확실하게 판독하지 못했습니다.', warnings:warnings};
  }
  const vehicle = bus70FindVehicleByLast3_(vehicleLast3);
  if (!vehicle.ok) return vehicle;
  const scheduleVersion = bus70ScheduleVersionForDate_(date);
  const candidateId = Utilities.getUuid();
  const candidate = {
    driverId:driverId, driverName:String(driver.name || ''), shift:String(driver.shift || ''),
    date:date, sequence:sequence, vehicleLast3:vehicleLast3, vehicleId:vehicle.vehicleId,
    vehicleNo:vehicle.vehicleNo, scheduleVersion:scheduleVersion, confidence:confidence,
    warnings:warnings, evidence:String(parsed.evidence || '').slice(0, 300), createdAt:Date.now()
  };
  CacheService.getScriptCache().put('BUS70_BOARD_' + candidateId, JSON.stringify(candidate), BUS70_BOARD_CANDIDATE_TTL);
  return {ok:true, candidateId:candidateId, candidate:candidate,
    requiresReview:true, message:confidence < 0.85 ? '판독 결과를 반드시 확인하세요.' : '판독 결과를 확인한 뒤 등록하세요.'};
}

function bus70RegisterDispatchBoard_(body, driverId) {
  if (body.confirmed !== true) return {ok:false, error:'CONFIRM_REQUIRED', message:'판독 결과 확인이 필요합니다.'};
  const candidateId = String(body.candidateId || '').trim();
  const raw = CacheService.getScriptCache().get('BUS70_BOARD_' + candidateId);
  if (!raw) return {ok:false, error:'CANDIDATE_EXPIRED', message:'판독 결과가 만료되었습니다. 사진을 다시 판독하세요.'};
  let candidate;
  try { candidate = JSON.parse(raw); } catch (_) { return {ok:false, error:'CANDIDATE_INVALID', message:'판독 결과를 다시 생성하세요.'}; }
  if (candidate.driverId !== driverId) return {ok:false, error:'DRIVER_MISMATCH', message:'로그인 기사와 판독 결과가 다릅니다.'};

  const date = normalizeDate_(body.date || candidate.date);
  const sequence = Number(body.sequence);
  const vehicleLast3 = String(body.vehicleLast3 || '').replace(/\D/g, '').slice(-3);
  if (!date || !Number.isInteger(sequence) || sequence < 1 || sequence > 11 || !/^\d{3}$/.test(vehicleLast3)) {
    return {ok:false, error:'PARAM_REQUIRED', message:'날짜·순차·차량번호를 확인하세요.'};
  }
  const vehicle = bus70FindVehicleByLast3_(vehicleLast3);
  if (!vehicle.ok) return vehicle;
  const driverResult = apiGetDriver_(driverId);
  if (!driverResult.ok || !driverResult.driver) return {ok:false, error:'DRIVER_UNAVAILABLE', message:'기사정보를 확인할 수 없습니다.'};
  const shift = String(driverResult.driver.shift || '').trim();
  const scheduleVersion = bus70ScheduleVersionForDate_(date);
  const dispatchId = 'DSP-' + date.replace(/-/g, '') + '-' + shift + '-' + ('0' + sequence).slice(-2);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');
    if (!sheet) return {ok:false, error:'DB_MISSING', message:'배차DB를 찾을 수 없습니다.'};
    const rows = sheet.getDataRange().getDisplayValues();
    const c = makeHeaderMap_(rows[0]);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (normalizeDate_(row[c['날짜']]) !== date) continue;
      const rowDriver = String(row[c['기사ID']] || '').trim();
      const rowSeq = Number(row[c['순차']]);
      const rowVehicle = String(row[c['차량ID']] || '').trim();
      if (rowDriver === driverId) {
        if (rowSeq === sequence && rowVehicle === vehicle.vehicleId && String(row[c['상태']] || '').trim() === '확정') {
          CacheService.getScriptCache().remove('BUS70_BOARD_' + candidateId);
          return {ok:true, alreadyRegistered:true, message:'이미 같은 배차가 등록되어 있습니다.',
            schedule:apiMySchedule_({parameter:{driverId:driverId,date:date}})};
        }
        return {ok:false, error:'EXISTING_DISPATCH', message:'해당 날짜에 다른 배차가 이미 등록되어 있습니다.'};
      }
      if (String(row[c['근무조']] || '').trim() === shift && rowSeq === sequence) {
        return {ok:false, error:'SEQUENCE_CONFLICT', message:'해당 날짜와 근무조에 같은 순차가 이미 등록되어 있습니다.'};
      }
      if (rowVehicle === vehicle.vehicleId) {
        return {ok:false, error:'VEHICLE_CONFLICT', message:'해당 날짜에 같은 차량이 이미 등록되어 있습니다.'};
      }
    }
    sheet.appendRow([dispatchId,date,shift,sequence,driverId,vehicle.vehicleId,scheduleVersion,'확정',new Date(),
      '배차판 자동 판독 후 사용자 확인 / 차량 뒤 3자리 ' + vehicleLast3]);
    CacheService.getScriptCache().remove('BUS70_BOARD_' + candidateId);
    return {ok:true, alreadyRegistered:false, dispatchId:dispatchId, message:'배차가 등록되었습니다.',
      schedule:apiMySchedule_({parameter:{driverId:driverId,date:date}})};
  } finally {
    lock.releaseLock();
  }
}

function bus70FindVehicleByLast3_(last3) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('차량DB');
  if (!sheet) return {ok:false, error:'DB_MISSING', message:'차량DB를 찾을 수 없습니다.'};
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const matches = [];
  for (let i = 1; i < rows.length; i++) {
    const no = String(rows[i][c['차량번호']] || '').replace(/\D/g, '');
    if (no.slice(-3) === last3 && String(rows[i][c['상태']] || '').trim() === '운행가능') {
      matches.push({vehicleId:String(rows[i][c['vehicleId']] || '').trim(), vehicleNo:no,
        displayNo:no.length === 4 ? '경기71아' + no : no});
    }
  }
  if (!matches.length) return {ok:false, error:'VEHICLE_NOT_FOUND', message:'차량번호 뒤 3자리 ' + last3 + '에 해당하는 운행가능 차량이 없습니다.'};
  if (matches.length > 1) return {ok:false, error:'VEHICLE_AMBIGUOUS', message:'뒤 3자리가 같은 차량이 여러 대입니다. 관리자 확인이 필요합니다.'};
  return Object.assign({ok:true}, matches[0]);
}

function bus70ScheduleVersionForDate_(date) {
  const parts = date.split('-').map(Number);
  const day = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  return day === 0 || day === 6 ? 'HD-TEST-V001' : 'WD-TEST-V001';
}
