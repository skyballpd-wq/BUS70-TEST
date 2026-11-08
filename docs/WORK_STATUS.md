# v88.1 기사 본인 가입 신청 — 웹·서버 73 운영 반영 완료

- 기사 본인이 성명·6자리 사원번호·노선을 신청하고 마스터가 기존 기사에 연결하거나 새 기사로 승인한다. 신청만으로 기사DB·운영계정·배차를 변경하지 않는다. 기존 기사ID·근무조·노선·기사구분·사번구분·배차 이력을 보존하고 중복 사번·퇴직·운영계정 연결·오래된 승인 화면을 차단한다.
- 휴대폰 무작위 확인 토큰으로만 신청 상태를 조회한다. 서버에는 해시만 보관하고 승인 후 1회 세션으로 전환한다. 같은 개인 휴대폰에서 7일간 앱이 열린 동안 20초 주기로 확인한다. 승인 후 일반 성명·사번 로그인도 가능하다. 실제 기사 승인 권한은 마스터에게 있으며 이번 검증에서는 실제 기사 신청·승인을 하지 않았다.
- [PR62](https://github.com/skyballpd-wq/BUS70-TEST/pull/62) 검토 head `90e12230b85e49965b4af8ba54bd4e0b3c3253ad`를 지정 병합했다. 병합 SHA `9f154357ccc7ba7140dcf8811e7c47bc0f809410`. [Chrome/WebKit CI 42463427491](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42463427491)에서 320/360/412px의 신청·대기·승인·자동 로그인·로그아웃·마스터 확인 및 가로 넘침을 검사했다. WebKit select 폭 문제는 수정 후 통과했다. [Android CI 42463423556](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42463423556) 성공. 네이티브 코드는 변경하지 않고 기존 서명된 v88 설치파일을 유지한다.
- [Pages 42463790404](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42463790404) 성공. 운영 index.html·driver-signup.js·sw.js HTTP 200 및 검증본 바이트 일치. 실제 운영 웹에서 v88.1 신규 신청 항목과 70번 기본값을 확인했다.
- Apps Script 운영 AuthStep9 최신 원본 전체를 다시 읽고 다른 수정은 보존한 채 7줄 연결과 DriverSignup 모듈만 추가했다. 저장 후 새로고침하여 두 파일 전체 일치 확인. 운영 환경의 잘못된 입력·잘못된 확인 토큰·비마스터 목록/승인 차단·기사/신청 DB 열 검사를 모두 통과했다. 신규 가입신청DB는 13열 헤더만 있으며 실제 신청 행 0개. 검증용 함수 제거 후 기존 배포 ID·실행 계정·공개 설정을 유지하여 서버 버전 73 배포 완료(2026-11-08 17:40 KST).
- 로컬 승인/중복/권한/만료/선행 0 보존, 날짜·세션 복구·관리자·초기 로딩·GBIS 복구 검사 통과. 기존 frontend-resilience 정규식 및 authstep9 ROUTE_PROGRESS 기대 실패는 변경 전 기준에서도 재현되어 별도 미해결이다. 실제 단말 설치·현장 운행·실제 기사의 신청/승인은 이번 검증 범위가 아니다.
- 단톡방 배포용 ZIP은 기존 v88 APK, 설치/로그인/운행 안내 PNG 3장, 3쪽 PDF, README를 포함한다. APK SHA-256 `1fe3bcf0e8f916f36ff3c6ba10daf5a9204263fcfcec27be774988d3e49989bf`. 안내의 모든 PDF 페이지를 렌더링하여 확인하고 ZIP 무결성·내부 APK 해시를 확인했다. 안내에는 Android 전용, 기존 앱 위 업데이트, 개인 휴대폰 자동 확인 조건, 미등록 안전구간의 실제 도로 경고 비활성을 명시한다. 개인 정보나 원본 운영 DB는 공개 저장소에 넣지 않는다.

# v88 출발 재수신·예정 간격·공공 차량 위치 — 웹 v88·서버 72 배포 완료

- 같은 기점/종점 좌표는 정류장 발생 순번과 탕 단계로 구분한다. GPS 단절 시 이동 증거와 함께 출발지 방문까지 삭제하던 경로를 수정했다. 이번 탕에서 확인한 방문은 최대 2시간 유지하되 이동 증거는 새로 쌓고 단절 구간의 시각은 추정하지 않는다. 낮은 속도의 출발 후보는 신선한 배정차량 GBIS 출발 상태와 기점 순번이 일치할 때만 보존하며 독립 출발 확정 조건을 유지한다. Android는 오래된 위치 수신 복구와 화면 복귀 시 상태 재동기화를 추가한다.
- 예정 앞뒤차 분 간격을 복원하고 정류장·운행 지점명은 단어/연결구 단위로 줄바꿈한다. GBIS 미가입 차량은 정류장 순번 기준 참고 위치로 표시한다. 조회시각과 실제 관측시각을 구분하며 속도·GPS 좌표를 만들어 넣지 않는다. 왕복 순번·경계 정차 제외·차량 중복/식별 모호성·오래된 위치 제외를 검사한다.
- 안전운전 선택/해제·음성 시험과 Android 서비스의 검증 구간 음성 판정을 추가했다. 검증된 방향·제한속도·유효기간 자료가 없으면 실제 도로 경고는 비활성이다. 카카오내비 SDK 또는 실운행 단속카메라 안내가 완료된 것으로 표현하지 않는다. 완료 후 회송 및 최초 영업 전 이동을 운행 기록으로 만들지 않는다.
- 2026-11-08 사용자의 설치파일·운영 병합·Google 재로그인·서버 편집 실행 승인 후 [PR61](https://github.com/skyballpd-wq/BUS70-TEST/pull/61)을 검토 head `54aa2fe7218fc116729f76d55c31bafdd8599b5c` 지정 병합했다. 병합 SHA `dc0844dea02c47e5b2e7025fcac7d43e8eb2e5b3`, [Pages 42441420350](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42441420350) 성공. 운영 index.html·driver-automation.js·driver-cockpit.js·sw.js HTTP 200 및 검증본 바이트 일치를 확인했다. 이전 자동 검토로 보류된 병합은 이번 직접 승인으로 완료됐다.
- Apps Script 기존 운영 원본 PublicTransitApi의 cross-check/fleet 부분만 적용하여 다른 선행 변경을 보존했다. 저장 후 편집기 재시작·전체 문자열 일치, 임시 검사 함수 제거 확인. 기존 배포를 서버 72로 갱신하고 완료 화면·기존 URL·실행 계정·접근 범위 유지를 확인했다. 실제 운행 원장 변경 시험 없음.
- 읽기 전용 서버 검사: 5/23/70번 GBIS 조회 성공, 정류장 114/93/106개, 당시 공급 차량·fleet·cross-check fleet 수 13/9/5대 일치. 전 항목이 PROVIDER_STOP_REFERENCE이며 관측시각 null, 속도·위경도 미조작 조건 통과. 이 수치는 검사 순간의 조회 결과이며 실차 검증을 대신하지 않는다.
- 검증 head의 관련 Node 회귀 검사, [Chrome/WebKit 42440667340](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42440667340), [Android 단위 검사·서명 빌드 42440664769](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42440664769), [iOS pilot 42440667320](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42440667320) 통과. 320/360/412px 및 150% 확대 글자 화면을 확인했다. 서명된 iOS 배포는 하지 않았다.
- 전달 APK `kr.bus70.driver`, versionCode 88 / `0.88-field-recovery`, SHA-256 `1fe3bcf0e8f916f36ff3c6ba10daf5a9204263fcfcec27be774988d3e49989bf`. v2 서명 인증서가 기존 설치본과 일치한다. 웹 v88·서버 72 운영 반영 완료, 네이티브 수정 이용에는 Android v88 업데이트가 필요하다.
- 남은 확인: 실제 휴대폰 설치·잠금 후 복귀·반복 탕 출발 정확도·음성 재생. 개별 현장 출발 오차의 원인은 연속 GPS 자료 없이 확정하지 않는다. 검증된 안전운전 구간 자료가 없어 실제 도로 경고는 비활성이다. 개인별 배치·운행 기록은 비공개 작업연계DB에서 확인한다.

# v87 정류장 간격·간결 표시 — 웹 v87·서버 71 배포 완료

- 2026-11-07 KST: 사용자의 직접 공개 승인으로 보류된 업로드를 재개했다. 검토 head `55751644f0eb44f3b6ae635366051248fc3e33f5`의 [Chrome/WebKit CI 42279323715](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42279323715) 두 작업이 통과했다. [PR 60](https://github.com/skyballpd-wq/BUS70-TEST/pull/60)을 검토 head 지정으로 병합했고 병합 SHA는 `886e60c4bbb3a09d364a588fb8fddc801886070e`다.
- [Pages 42279812688](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/42279812688) 배포 성공. 운영 index.html·driver-cockpit.js·sw.js의 HTTP 200 및 검증본 바이트 일치를 확인했다. 웹 v87 / Android versionCode 86 / Apps Script 71이며 이번 작업에서 Android·서버를 다시 배포하지 않았다.

- 원형 눈금에서 실제 정류장 순서로 가까운 앞차 2대(파랑), 뒷차 2대(주황), 내 차의 마지막 통과 정류장(보라)을 표시한다. 각 방향의 두 차량이 같은 정류장에 있으면 해당 눈금을 두 줄로 나눈다. 내 차와 같은 정류장으로만 확인되는 차량은 앞뒤 순서를 임의 추정하지 않으며 다른 차량의 표시는 유지한다. 왕복 노선의 정류장 발생 순번을 사용하므로 회차 경계를 지나도 연결되고, 종점을 출발점으로 순환시켜 해석하지 않는다.
- 서버가 운행일·노선·기사·배차·차량·순차·탕을 실제 운행일지와 대조해 running을 제공한다. 실제 출발 전, 도착 완료, 이전 탕 위치는 이 표시에 사용하지 않는다. 중복 완료 기록이 있으면 완료를 우선한다. 앱 GPS는 정차 중에도 15초 주기로 전송하며 눈금에서는 45초를 넘긴 위치·정확도 불량·미확인 상태를 제외한다. 화면에는 짧은 색상 범례만 두고 분 단위 간격과 긴 앞뒤차 설명을 제거했다. 시간 간격 기록은 이력에서 유지한다.
- 날씨는 그림문자와 기온으로 표시하며 관측 출처·시각은 접근성 설명과 도움말에 둔다. 미수신·오래된 관측은 날씨를 만들어 표시하지 않는다.
- 공유 PNG는 이름·기점을 세로로, 순차는 숫자만, 시각·차량번호 뒤 3자리는 가로 숫자로 그린다. 40개 순차까지 한 줄로 유지하고 초과 명단은 글자 크기를 유지해 다음 줄로 배치한다. 미지정·조회 누락 표시, 배차 원본 불변, 오래된 이미지 공유 차단과 기존 Android 공유·저장 연동을 보존했다.
- 검증: 관련 Node 검사 및 최신 Chrome/WebKit CI 통과. 320/360/412px 원형 눈금·기록 화면·소장 저장/실패/지원기사 흐름과 PNG 공유/저장을 합성 자료로 확인했다. 11/18/27/40/80개 합성 명단의 순차 보존·한 줄 배치·실제 글자 경계·PNG 크기를 확인했다. 실물 휴대폰의 소장 저장·실차 GPS는 미검증이다.
- AuthStep9만 기존 서버 원본에 부분 적용했고 재시작 후 저장본 전수 문자열 일치, 임시 읽기 검사 함수 제거를 확인했다. 기존 배포를 서버 버전 71로 갱신하여 완료 화면과 URL·권한 유지를 확인했다. 운영 배차와 운행일지를 변경하는 시험은 하지 않았다.
- 남은 확인: 실제 소장 모바일 저장, 운행 중 네 차량 위치 송수신·종료 후 제거, 실차 음성. 검증된 방향·제한속도·단속구간 자료가 없어 과속 경고는 비활성 상태다. 아래 이전 기록의 웹 업로드 보류는 이번 배포 완료로 해소됐으며 운영 DB·개인별 원본은 비공개 기록에서 확인한다.

# v87 현장 개선 — 서버 70 배포 완료, 웹 업로드 승인 차단

- Apps Script 기존 배포를 버전 70으로 갱신하고 배포 완료 화면·기존 URL·실행 계정·접근 범위 유지를 확인했다. AuthStep9/PrivateRouteStore/ManagerDispatch/Route5Schedule 및 신규 RoadSafety를 저장 후 편집기를 다시 열어 5개 파일 전수 문자열 대조했다. 운영 서버에 이미 있던 운행일 생성·연결과 추가 열 보존을 유지했다. 공개 저장소의 ManagerDispatch 전체를 그대로 덮어쓰면 이 선행 운영 변경이 사라질 수 있으므로 다음 배포도 원본 대조 후 부분 적용해야 한다.
- 임시 읽기 전용 검사에서 월간명단의 월 범위·양성 노선 제외·타노선 기사ID 휴무·기존 당일 확정배차 조회·회차장소 보존·미검증 안전자료 비활성을 확인했다. 검사 함수는 삭제 후 저장본에서 제거를 재확인하고 배포했다. 실제 소장 모바일 저장·실차 GPS·음성 검증과 웹 v87 공개 업로드는 남아 있다. 운영 DB의 구체적인 인원·일정·근거는 비공개 작업연계DB에 기록한다.

- 월간근무명단DB를 조회일의 월에만 적용하는 읽기 전용 후보 명단으로 추가한다. 실제 소속·사번·과거 배차는 바꾸지 않는다. 70번 양성 노선에는 월간 고정 명단을 적용하지 않는다. 예비기사의 확정 휴무는 노선이 달라도 기사ID로 연결하며 동명이인과 미확정 이름 연결을 분리한다. 월 경계·명단 취소·타노선 휴무·동명이인·기존 확정 배차 보존 검사를 추가했다. 실제 명단과 원본은 비공개 DB에만 보관한다.
- 제공된 어린이보호구역 JSON/XLS는 빈 값 표기 정규화 후 일치했다. 시설 좌표·CCTV 설치 여부는 단속카메라의 방향·제한속도·구역 경계를 대신하지 않는다. 노선 정류장 연결선 주변 시설은 비공개 후보 DB로 분리하며, 검증된 경고구간 DB로 승격하지 않는다. 제공된 신호등 자료에도 단속카메라·제한속도 정보가 없다. 경고음 활성화에는 별도 구간 검증이 남아 있다.
- 기존 기능 head `62ece705571bd7746ba38dc267f855941f3105c1`의 Chrome/WebKit CI `40911824852`가 통과했다. 이후 작은 화면 체크박스·월간명단·휴무 연결은 로컬 `32a9a81` 추가 수정본이다. 관련 Node 4종과 추가 월간/타노선 검사 통과. 공개 소스 업로드는 기존 승인 근거와 공개 endpoint 바이트 일치를 확인한 뒤에도 자동 검토에서 거절됐다. 이유는 운영 endpoint 및 로직을 포함한 전체 소스의 이번 공개에 대한 직접 승인이 필요하다는 것이며, 우회 업로드·병합·웹 배포를 하지 않았다. 이후 보안 로그인으로 서버 편집 접근이 복구되어 서버 70만 별도로 배포했다.

- 전철 연계 중간지점 시각과 회차지를 분리한다. 중간 기준시각이 회차시각과 같더라도 회차 장소를 지우지 않는다. 기사 화면에 연계 출발과 자정 이후 익일 표시를 추가한다. 원본별 정정과 근거는 비공개 작업연계DB에 기록한다.
- 같은 노선·운행일·진행방향의 앱 GPS를 정류장 눈금 위 앞차(파랑)/뒷차(주황)로 표시한다. 30초 초과는 지연, 90초 초과·정확도 불량·같은 정류장 순서 불명은 위치를 추정하지 않는다. 상대 차량의 앱 GPS 송신이 필요하며 GBIS 위치 지연 자체를 해결한 것은 아니다. 내 차량 화살표를 눈금 폭에 맞춰 축소한다.
- 소장 저장 버튼·결과를 상단에 유지하고 저장 응답의 노선/날짜/배차를 대조한 뒤 화면을 다시 그린다. 실패 시 입력을 유지하고 타노선 지원기사 선택과 사유를 제공한다. 서버 수정은 기존 배차 ID와 추가 열을 보존하며 기사/차량 변경 시 재확인을 요구한다. 실제 현장 저장 장애의 단일 원인은 아직 확정하지 않았다.
- 안전경고는 신선한 GPS·속도·진행방향과 검증된 구간 자료로 전방 접근/과속을 판정하는 전경 웹 기능을 준비했다. 방향·제한속도·유효기간이 있는 비공개 안전운전구역DB가 필요하다. 현재 자료 미등록이며 실운행 경고가 활성화된 상태가 아니다. 화면 잠금/배경 음성은 구현하지 않았고 실제 차량 음성 검증도 남아 있다.
- 관련 Node 검사 11종 통과. Chrome/WebKit 320/360/412px 저장·실패·지원기사·연계시각·원형 표시를 CI로 검증했다. 웹 v87 소스 준비, 운영 웹은 v86.1·Android 86 유지. Apps Script는 70으로 배포했다. 운영 중 실제 기사·차량 재배정이나 기록 변경으로 시험하지 않았다.

# v86.1 현재 탕 표시·날짜 선택 — 웹 배포 완료, 실물 휴대폰 확인 대기

- 현재 운행 대상으로 선택된 탕에서만 한국 날짜·요일·시각, 날씨·관측시각 및 실시간 진행률 원을 표시한다. 완료한 탕·다른 탕·과거/미래 날짜 조회에서는 실시간 영역을 숨긴다. 출발 자동 감지가 지연된 현재 탕도 기존 진행률 표시 조건을 유지한다.
- 날짜 선택을 접힌 메뉴에서 직접 선택하는 한 줄 입력으로 바꾸고 변경 안내 문구·중복 라벨을 제거했다. 화면 읽기용 이름과 44px 터치 높이, 날짜 변경 즉시 조회, 시간 형식 선택을 유지한다.
- 비현재 탕 조회에서는 날씨 요청을 생략하고 기존 10분 캐시를 유지한다. 진행률은 실제 위치·정류장 진행값에 따라 갱신하며 시간 경과만으로 증가시키지 않는다.
- 웹 v86.1, 캐시 `soshin-ops-static-v861-live-trip-display`. Android versionCode 86 / versionName 0.86-trip-results 및 Apps Script 69 유지. 이번 변경은 웹 화면 수정으로 APK 재설치가 필요 없다.
- 관련 Node 검사 5종과 검증 head `2a61fc17805161db51819aed8e1ede7ac8715467`의 [Chrome/WebKit 40467129774](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40467129774)가 통과했다. 320/360/412px 날짜 직접 선택·실시간 영역 격리·현재 탕 복귀·시계 갱신·위치 기반 42.5→63% 진행률 증가·150% 확대를 확인했고 합성 화면 캡처를 검토했다. 날짜 전환 시험 데이터 및 실행 속도 의존 시계 검사를 보정했다.
- [PR59](https://github.com/skyballpd-wq/BUS70-TEST/pull/59) 병합 `4fa3cee4f8ece753149abf3e910d57b8307991b6`. [Pages 40467429610](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40467429610) 성공. 운영 index.html·sw.js HTTP 200과 검증본 바이트 일치를 확인했다. 실제 휴대폰에서 재실행 후 표시 확인은 남아 있으며 실차 출발 정확도 검증 완료로 표현하지 않는다.

# v86 결과 화면·현재 날씨·출발 관측 보존 — 배포 완료, 실차 검증 대기

- 완료·지난 탕은 기록표 중심으로 표시하고 중복 완료 원·빈 정류장·저장되지 않은 간격 영역을 숨긴다. 기록 시각은 초까지, 자동 기록의 계획 차이는 분:초로 표시한다. 수동 입력은 표시하되 실제 지연으로 판정하지 않는다. 작은 화면과 확대 시 표의 지점명을 별도 행으로 배치한다.
- 현재 한국 날짜·요일·시각과 기온·관측시각을 주 화면에 표시한다. 과거 운행을 조회해도 현재 날씨라는 구분을 유지하며 오래된 온도는 표시하지 않는다. 기존 날씨 API·10분 캐시를 사용한다. 과거 배차 날짜는 날씨 조회 권한 확인에만 쓰며 현재 관측값을 과거 날씨로 저장하지 않는다.
- 연속 GPS 이동 후 긴 신호 대기에서 출발 후보가 3분 후 소실되는 문제를 합성 궤적으로 재현했다. 유효한 연속 관측의 보존 상한을 10분으로 늘린다. 차고지 내부에서 45초 이상 정차한 후보는 폐기한다. 별도 차량/노선 이동 증거가 충족되어야 출발을 확정하며 보행·예정 전·역방향·GPS 단절·완료 기록 보호는 유지한다. 이 재현은 개별 실차 오차의 원인을 확정하는 자료가 아니다.
- 정류장·신호 정차가 전체 평균속도를 떨어뜨려 출발 증거를 소실시키는 조건을 재현했다. 정차 구간은 이동 근거에 포함하지 않고, 유효 이동 5구간·20초·180m 및 정류장 순서 진행을 함께 요구한다. 반복 운행·보행·차량 미확인·복귀·완료·GPS 단절 검사를 추가했다.
- Android versionCode 86 / versionName 0.86-trip-results, 웹 v86. 네이티브 출발 개선에는 APK 업데이트가 필요하다. iOS 공통 엔진 소스에도 반영되지만 서명 iOS 배포는 별도다. Apps Script·실제 운행 원장 변경 없음.
- 관련 Node 검사 24종 및 변경 전/후 재현 비교를 통과했다. 검증 head `aea61d6c6b36d6011bb80d8dd0d1b5cf5eebbf00`의 [Chrome/WebKit 40454334840](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40454334840)에서 320/360/412px·150% 확대·실제 앱 합성 기록·현재 날짜와 과거 기록 분리·기온 시각·오래된 온도 제외를 확인했다. 캡처도 검토했다. [iOS 40454334828](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40454334828) 시뮬레이터와 서명 없는 대상 빌드 통과. 대기 화면 격리 테스트의 누락 mock 및 차량 이력 범위 테스트 실패는 변경 전 기준본에서도 동일하게 재현됐다.
- [PR58](https://github.com/skyballpd-wq/BUS70-TEST/pull/58) 병합 `3b3691f9d62c3360b0b801d4b6792dfa6b50acdc`. [Pages 40454848672](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40454848672) 성공. 운영 index.html·driver-cockpit.js·driver-automation.js·sw.js HTTP 200과 검증본 바이트 일치를 확인했다. 웹 캐시 `soshin-ops-static-v86-trip-results`.
- 전달 APK는 [고정 서명 빌드 40454042418](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40454042418)의 산출물이다. 소스 `bf2c64446314905d8077323052e71304ddc56268` 이후 변경은 HTML 스타일뿐이며 Android 소스는 동일하다. 실제 패키지 `kr.bus70.driver`, versionCode 86 / versionName `0.86-trip-results`; SHA-256 `375dc71bfee29ab463d6541578834afa05d211cf30a4a28f88df74ee765e9d79`. v85와 v2 서명 인증서 일치를 확인했다. [Android 기기 검사 40454042275](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40454042275)도 통과했다.
- 개별 현장 자동 미감지 원인은 연속 GPS 원본이 없어 확정하지 않았다. 사용자 현장 보고와 운영 원장은 비공개 작업연계DB에 보관한다. 기존 수동 시각의 소급 변경 없음. 실제 휴대폰 설치·화면 잠금·반복 탕 출발 정확도와 운영 기온 응답은 현장 확인 대상이며 합성 검사를 실차 검증으로 표현하지 않는다. 서버 버전69 유지.

# v85 기사 화면·바로 기록 — 배포 완료, 실물 휴대폰 확인 대기

- 현재 탕의 출발·회차·도착 기록 버튼을 운행 카드에 표시한다. 과거·미래·완료 탕, 예정 전 출발, 저장 중 중복 터치를 차단하고 저장 결과를 버튼 옆에 표시한다. 기존 수동 저장 API와 기사·배차·차량 검증을 유지한다.
- 주 화면은 진행률·정류장·속도·예정 간격·핵심 시각표 한 개로 정리한다. 중복 상세표, 현재 시계, 경과시간, 대체운행 안내를 정리하고 진단·날씨·배차 정보는 한 상세 영역에 둔다. 시각은 주 화면에 분 단위로 표시하고 운행일지의 초 단위 원본을 유지한다. 수동 시각의 계획 차이는 실제 지연으로 단정하지 않고 기록 기준으로 표시한다.
- Android 85는 시스템 상태표시줄·내비게이션·키보드 영역을 제외한 컨테이너에 WebView를 배치한다. 기존 패키지와 고정 서명을 유지한다. 웹 v85와 APK 배포·기기 검증은 각각 확인한다.
- 관련 Node 검사 22종 통과. 최종 head `ee907f21b3eaffd63512301ddcce3b15a758c311`의 [Chrome/WebKit CI 40156262832](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40156262832)에서 320/360/412px 전체 앱 화면, 수동 기록 조건·중복 저장 방지·날짜/탕 격리·저장 오류를 확인했다. 합성 화면 캡처도 검토했다. [Android CI 40155870489](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40155870489)에서 Android 15 시스템 여백과 기존 네이티브 검사를 통과했다. 이후 변경은 웹 화면과 브라우저 검사뿐이며 Android 소스는 동일하다.
- [PR57](https://github.com/skyballpd-wq/BUS70-TEST/pull/57) 병합 `316d03dc879a9440cacb2155ce84d4ebb4c7254d`. [Pages 40156506136](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40156506136) 배포 성공. 운영 index.html·driver-cockpit.js·sw.js HTTP 200 및 검증본 바이트 일치를 확인했다. 웹 캐시는 `soshin-ops-static-v85-driver-screen`이다.
- [고정 서명 APK 빌드 40155870445](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/40155870445) 성공. 전달 파일 `BUS70-v85.apk`의 실제 패키지는 `kr.bus70.driver`, versionCode 85 / versionName `0.85-driver-screen`. APK SHA-256 `cee230bb1a0fd0adf14ece8b2af74ddcdb4ad60e60b47ab7786cae812c67181d`; 서명 인증서가 v84와 일치한다. 빌드 소스는 `31a4a036031616f6a2f02476061cef554cdbc324`이며 이후 Android 소스 변경은 없다. 기존 앱 위에 업데이트할 수 있다. 웹 화면 변경은 기존 설치본에도 적용되며 시스템 영역 겹침 수정에는 v85 APK 설치가 필요하다.
- 경기도 차량정보는 출발 판정의 대조 근거이며 공급자 단말기의 최초 송신시각을 실제 출발시각으로 복사하지 않는다. 실제 시각 원장과 출발 자동 판정 엔진은 이번 변경으로 수정하지 않는다. 현장 상세·개인별 기록은 비공개 작업연계DB에 보관한다.
- 수동 버튼은 기존 서버 접수시각을 기록하며 과거 실제 출발시각을 입력하는 기능은 아니다. Apps Script 배포 버전은 69를 유지한다. 실물 휴대폰 설치·시스템 여백·수동 기록 체감 지연·실차 GPS 정확도·화면 잠금은 확인 대기다. 과거 출발시각 차이와 API 429 원인도 별도 확인 대상이며 이번 화면 개선으로 해결됐다고 판단하지 않는다.

# v84 복수 노선 DB 연결 — 배포 완료, 실차 검증 대기

- 활성 노선을 노선마스터DB에서 읽고 추가 노선의 확정 시간표를 날짜별 DB에서 조회한다. 기사 당일 타노선 배차와 대체 차량을 기존 소속 변경 없이 연결한다. 전체 노선 현황·시간표·배차 이미지·통합 DB 메뉴에 신규 노선을 포함한다.
- 23번 상하행 정류장과 회차점은 운영 DB에서 제공한다. Android/iOS 전착 안내는 23번 하행 화곡역6번출구 이후 정류장별로 재판단한다. Android versionCode84, 기존 고정 서명 업그레이드 빌드 대상. iOS 서명 배포는 보류 유지.
- 로컬 검증: DB 전용 추가 노선, 날짜 없는 조회 차단, 타노선 기사/차량, 자정 도착, 전체 현황, 정규화 연결·권한 검사, iOS 경고 경계, GPS 재현 검사 통과. 기존 authstep9.test.js 240행의 ROUTE_PROGRESS 기대값은 변경 전 기준본에서도 실패하여 별도 기존 실패로 기록한다.
- [PR56](https://github.com/skyballpd-wq/BUS70-TEST/pull/56) 병합 `e2fda227c8680eb06ca56ff7830399930979a922`. Android APK, mascot, iOS pilot, Chrome/WebKit 검사 4종 통과. [Pages 39912209413](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39912209413) 성공 후 운영 index.html·sw.js HTTP 200과 검증본 바이트 일치 확인.
- Apps Script 기존 배포를 버전 69로 갱신했다. URL·실행 계정·접근 권한을 유지했다. 운영 원본의 다른 편집을 보존하여 PrivateRouteStore/AuthStep9/ManagerDispatch/PublicTransitApi 저장본을 대조했다. 임시 진단은 제거했다. 서버에서 추가 노선 기사 스케줄과 관리자 배차·정비·마스터 조회 정상 응답을 확인했다. GBIS 신규 노선 현재 차량 응답도 정상이며 장시간 안정성 검증과 구분한다.
- [고정 서명 APK 빌드 39911013757](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39911013757) 성공. `kr.bus70.driver`, versionCode 84 / versionName 0.84-multi-route. v83과 서명 인증서 일치. APK SHA-256 `0feedbb67f050deb7c57e2ffa7c7a29cc453425e672bebd5a4b655459bf31ca9`. 최초 설치와 기존 앱 업그레이드에 같은 파일을 사용한다.
- 운영 DB 원본 대조와 재조회 완료. 개인별 배차·시각·원본 근거는 비공개 작업연계DB에 기록한다. 실제 기사·사번·배차·원본 사진·좌표 원장·API 키는 공개 파일에 포함하지 않는다. 사번 미제공 기사의 로그인은 비활성 상태다. 실물 모바일 로그인·화면 잠금·23번 실차 GPS와 전착 음성·350명 부하 검증은 미완료다. 23번 화곡역6번출구 경고 기준은 기존 운영 규칙을 적용한 구성으로 현장 확인이 필요하다.

# 공통 기술 작업현황

## v83 출발 관측 시각·기사 원형 화면 개선 — 배포 완료, 실차 검증 대기

- 차고지 안의 유효 차량 이동 관측을 보관하고, 기존 차량/노선 출발 근거가 충족된 뒤 최초 관측 시각을 사용한다. 예정 전·보행·역방향·GPS 단절·완료한 운행 보호를 유지한다. 신호 정차 중 연속 위치가 있으면 출발 근거를 유지한다. 예정시각을 실제시각으로 사용하지 않는다.
- 정류장 수의 원형 구간과 구간 내 부분 진행을 표시한다. 화살표는 GPS 주행/서행/정차/미확인으로 구분하며 외부 교통 혼잡 판정으로 표현하지 않는다. 위치 유지 시 회색으로 남긴다.
- 7개 탕 원형 버튼이 작은 화면에 맞도록 조정하고, 운행 카드 좌우 밀기로 탕을 전환한다. 현재 탕 버튼을 누르면 자동 따라가기를 재개한다. 별도 현재탕 복귀 버튼과 반복 지점명은 제거한다.
- 앞뒤 차량의 같은 정류장 관측 구간을 비교하는 간격 추정을 추가했다. 노선별 공유 GBIS 요청을 재사용하며 추가 API 요청은 없다. 공급자가 실제 통과시각을 제공하지 않아 실시간 약 N분으로 표시하며 관측 누락/방향 불일치/오래된 자료는 수집 대기로 구분한다. 직선거리와 가정 속도 기반 간격은 제거한다.
- Android versionCode 83 / versionName 0.83-field-cockpit. 웹 캐시와 수정 JS 주소를 함께 v83으로 갱신한다.
- 로컬 Node 출발/장애 복구/간격/대시보드/iOS 공통 엔진 검사 및 Java/JUnit 5개 검사 통과. [Chrome/WebKit CI 39902394192](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39902394192)에서 작은 화면·정류장 구간·좌우 전환·보류 상태를 검증했다. [iOS 시험 CI 39902394128](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39902394128)도 통과했다. 실물 휴대폰·실차 검증은 별도다.
- [Android 서명 APK 빌드 39901857902](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39901857902) 성공. v83 APK SHA-256 `b50534af2c71d894af93268a44c1db7cd73125dcd231dddf04b8dd3b9174616e`, 기존 v82와 서명 인증서 일치. 최초 설치와 업그레이드에 같은 파일을 사용한다. 이후 커밋은 테스트·CI 설치 대기 제한·문서만 변경했다.
- [PR55](https://github.com/skyballpd-wq/BUS70-TEST/pull/55) 병합 `1070b1b5d2f119194c9eeab8d5d12774bb85f773`. [Pages 39902634552](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39902634552) 배포 성공. 운영 index.html, sw.js, driver-automation.js, driver-cockpit.js의 HTTP 200과 검증 파일 바이트 일치를 확인했다.
- Apps Script 기존 배포를 버전 68로 갱신했다. URL·실행 계정·접근 권한을 유지했다. PublicTransitApi.gs 전체와 AuthStep9.gs의 간격 함수 2개를 저장·읽기 대조했고, 다른 운영 편집은 보존했다. 현재 연결 진단은 HTTP 200, available=true, 차량 22대, 요청 1건/200 응답 1건이었다.
- 실제 차량 출발부터 확인까지의 시차, 수 시간 운행·잠금 화면·음성·관측 간격 정확도는 다음 실차 검증이 필요하다. 현재 API 정상 응답만으로 과거 429의 일일 할당/순간 제한 원인이 해결됐다고 판단하지 않는다. 원장의 비정상 예정 간격 계산 원인과 과거 누락 시각은 별도 확인 대상이며, 실제 운행 원장은 수정하지 않았다.


## iOS 위치·음성 네이티브 시험 앱 빌드 검증 — 2026-10-21

- iOS 16 이상 대상 Core Location/JavaScriptCore/한국어 음성 시험 앱 작성. WKWebView와 독립된 공통 GPS 판정, 내구성 기점 기록, 기기별 인증정보 보관, 완료·로그아웃·운행일 종료 보호를 구현했다. 웹 v82.3은 iOS 위치 브리지를 Android 알람과 별도로 감지한다.
- 합성 Node 검사에서 예정 전/보행 오출발 방지, 차량 대조·계정/차량 분리, 통신 재전송, 완료·지난 운행일 보호, 정류장별 10분 경고 경계 통과. 최종 head `37647796399e25b9d56b7768cee3ecac78a86d2d`의 [iOS CI 39576561595](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39576561595)에서 iPhone 시뮬레이터 4개 XCTest와 서명 없는 실기기 대상 빌드 통과. [Chrome/WebKit CI 39576561476](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39576561476)도 통과했으며 iOS 네이티브 브리지의 브라우저 GPS 중복 방지·숨김 유지·중지를 합성 검증했다.
- [PR54](https://github.com/skyballpd-wq/BUS70-TEST/pull/54) 병합 `887215e578fb63ebff96921135df997f816534fb`. 일반 GPS 상태 저장은 15초 간격으로 모으되 기점 이벤트·전송 응답·음성 상태는 즉시 저장한다. 전화 중단 시 이전 음성을 취소하고 이후 새 위치에서 재판단한다. 최초 Swift 초기화/기존 웹 격리검사 누락과 URL 루트 경로 검사를 수정해 최종 빌드에서 확인했다. 자동 검토에서 지적된 URL 조건은 HTTPS·호스트·포트를 독립적으로 필수 검사하도록 수정하고 외부 :443 주소 거부 검사를 통과했다.
- 서명 IPA/TestFlight 배포·실물 iPhone 화면잠금·전화/Bluetooth 음성·장시간 운행은 미검증. Apple 개발자 팀/앱 등록·서명·아이콘·배포 개인정보 표시가 필요하다. 비용 지출·테스터 초대 없음. Android 네이티브 변경 없고 v82 설치/업그레이드 공용 APK 유지.
- 웹 v82.3 [Pages 39577470256](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39577470256) 성공. 운영 index.html, sw.js, mobile-compat.js?v=823 HTTP 200 및 검증 파일 바이트 일치 확인. 기존 Android 설치본과 Safari는 유지되며 iOS 네이티브 설치본은 아직 없다. 서버 버전67·운영 DB 원장은 변경하지 않았다.
- 구현 범위와 배포 준비는 `ios/README.md` 참조. 실제 기사·배차·인증정보는 공개 코드에서 제외한다.

## v82.2 조회 부하 절감 — 2026-10-21

- 관리자 휴무·후보 조회에서 전체 계획 재이관/쓰기 제거. 같은 요청 내 시트 읽기 재사용. 비공개 원본의 미이관 계획은 읽을 수 있고 DB 취소가 우선한다. 다른 요청에서 변경된 상태를 다시 읽는다. 기사 로그인은 별도 휴무 조회 경로도 사용하므로 이 변경을 전체 로그인 속도 개선의 실측 결과로 해석하지 않는다.
- 위치 저장 응답에 최신 차량정보가 있거나 위치 저장 중이면 중복 차량 조회를 생략한다. 오래된 응답·실패·배차 변경 시 조회를 재개한다. GPS 관측 주기나 실제 운행 이벤트 저장은 줄이지 않는다.
- 관련 Node 검사와 공개 데이터·인증 경계 검사 통과. [Chrome/WebKit CI 39566227177](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39566227177) 성공. 검증 head `022d6528fa482c08311d788820667f1d80bfd9d8`. 최초 CI의 이전 캐시 이름 고정 검사를 새 버전으로 수정한 후 재검증했다.
- [PR53](https://github.com/skyballpd-wq/BUS70-TEST/pull/53) 병합 `6b5d89f8a22df6dcf53a4687af34917137e02afd`, [Pages 39566956256](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39566956256) 성공. 운영 index.html과 sw.js HTTP 200 및 검증 파일 바이트 일치 확인. Android 네이티브 변경이 없어 기존 서명 v82 APK를 유지한다.
- 기존 Apps Script 운영 배포를 버전 67로 갱신했다. URL·실행 계정·접근 권한은 유지했다. PrivateRouteStore.gs의 대상 함수만 검증본으로 반영하고 함수 밖 코드는 보존했다. 저장된 함수 2,167자, UTF-16 FNV-1a `1d978943` 대조. 임시 API 차량 진단은 원본으로 복원한 뒤 배포했다.
- 회사 검토용 350명 용량·보안·단계 전환 제안서와 Android/iPhone 설치 안내서를 작성했다. iPhone은 Safari/홈 화면 웹 앱이며 IPA나 화면 잠금 중 지속 위치 추적을 제공하지 않는다. 실제 휴대폰·실차 검증은 별도다.
- 350명 용량 평가는 코드 기반 계산이며 실부하 검증 아님. 운영 서버에 대량 시험 부하를 보내지 않았다. Cloudflare 도메인 연결만으로 Apps Script/Sheets 병목이 제거되지 않는다. 제안된 전용 API/DB 전환은 별도 부하 검증과 회사 결정 후 진행한다.

## v82.1 Android / iPhone 웹 호환성 — 2026-10-21

- 기준 원격 main `491ac38db31f40ceaec5d85f1ddc21194fe0a171`. Android 네이티브 코드는 변경하지 않으며 설치 파일은 기존 v82를 유지한다. iPhone은 Safari / 홈 화면 웹 앱으로 접근한다. iOS 설치용 앱은 아직 없다.
- 기기 기능을 확인해 Android 전용 예약 시험·알람음 선택과 미지원 진동 설정을 숨긴다. 웹 알림을 잠금 화면 예약 알람으로 표현하지 않는다. 직접 누르는 음성 시험은 서비스워커 대기 전에 시작한다.
- 웹 화면을 숨길 때 GPS watch를 정리하고 다시 열 때 새 watch로 재수신한다. 사용자 일시중지·완료한 운행·당일 배차 조건은 유지한다. 화면 잠금 중 누락된 경로를 추측하여 복원하지 않는다.
- GPS 상세에서 선택적으로 화면 켜짐 유지를 요청한다. 미지원·권한 거절·OS 해제 상태를 구분하며 추적 중지/로그아웃 시 해제한다. 이 기능은 백그라운드 위치 추적이 아니다.
- 사진 다중 첨부/촬영을 유지하고 MIME이 비어 있는 이미지 파일도 실제 디코딩으로 확인한다. 읽을 수 없는 HEIC 등은 JPEG/PNG 또는 재촬영 안내를 표시한다. 서버에는 기존처럼 용량을 제한한 JPEG만 보낸다.
- 검증 완료: Node 기능 검사와 [Chrome/WebKit CI 39543466266](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39543466266) 통과. 검증 head `fcf2e43c47cc9735ccd6d1fa735ff39a2772d0b8`. 실제 페이지의 합성 로그인·음성 호출·화면 복귀·일시중지/완료 보호·사진 5장·동일 내용 재전송·이미지 공유·날짜 선택을 확인했다. WebKit 검사의 임시 blob 주소 차단을 수정했고, 한글 줄바꿈 차이는 같은 필드 내 전체 문구와 글자 경계로 검증한다.
- [PR52](https://github.com/skyballpd-wq/BUS70-TEST/pull/52) 병합 `05eb8582887f8c20eca616ea36f3acf8da65359d`, [Pages 배포 39543679169](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39543679169) 성공. 운영 index.html, sw.js, mobile-compat.js?v=821, accident-report.js?v=821 모두 HTTP 200 및 검증 파일 바이트 일치 확인. Android 네이티브 변경이 없어 기존 서명 v82 APK를 유지한다.
- 실물 iPhone/Safari 음성·사진 선택·화면 잠금·수 시간 실차 운행 검증과 iOS 전용 백그라운드 앱은 미완료다. 브라우저 엔진 검사 통과를 실물 기기 확인으로 표현하지 않는다.
- Apple 공식 근거: [Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)는 별도 Push 서버 연동이 필요하며 현재 앱에 구현하지 않았다. [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)부터 홈 화면 웹 앱의 Screen Wake Lock을 지원한다. 기기별 실제 가능 여부를 기능 검사한다.

## v82 운영 서버 배포 완료 — 2026-10-21

- 승인된 Google 인증 후 기존 Apps Script 운영 배포를 버전 65에서 66으로 갱신했다. URL·실행 계정·접근 권한은 그대로 유지했다.
- PublicTransitApi.gs 저장본 전체가 검증된 저장소 코드와 일치. 공유 캐시/동시 요청 제어/429 대기/집계 적용 후 진단에서 HTTP 200, available=true, 차량 21대, 요청 집계 1건/응답 200 1건 확인.
- ManagerDispatch.gs의 당일 확정 배차 우선 후보 함수도 검증본과 대조해 반영했다. 이 함수 밖의 운영 편집본 차이는 덮어쓰지 않았다.
- 현재 API 연결 정상은 확인했으나 이전 429의 일일 한도/순간 제한 구분과 장시간 실차 검증은 미완료. 과거 실제 운행 시각은 수정하지 않았다.

## v82 실시간 기록 복원 후보 — 2026-10-21

- 기준 main: `7657867bff31476a5ae38a3feb5730e553f881e1` (PR49 이후 변경 보존).
- 출발 확인이 늦어져도 연속 관측의 첫 유효 시각을 사용한다. 같은 날짜·배차·차량을 먼저 대조한 경우 API 장애 중 연속 상행 GPS 근거로 기록을 계속한다. 예정 전 출발, 차고지 보행, 상하행 혼동, 오래된 차량 근거, 완료한 탕 재개는 허용하지 않는다. 당일 차량 대조가 한 번도 없으면 자동 출발 확정을 보류한다.
- 회차 후에는 도착지까지 남은 정류장 경로 거리를 표시한다. ETA는 최근 이동·정차 속도로 계산하며 교통 예측 서비스가 아니다. 정차 시 마지막 추정은 최대 60초만 표시하고 유지된 추정임을 구분한다. 정류장 사이에도 ETA를 표시하지만 음성 경고는 승인된 하행 기준점 이후 정류장에서만 판단한다.
- GBIS 요청은 노선별 동시 1건, 정상 응답 45초 공유 캐시를 사용한다. HTTP 429에는 Retry-After와 공유 지수 대기를 적용하고 일별 요청·응답 코드 집계를 보관한다. 외부 API 응답을 기다리는 동안 위치 저장 잠금을 유지하지 않는다. 특정 시각에 중단되는 분기는 없다. 실제 계정의 일일/순간 요청 한도 원인은 별도 운영 진단이 필요하다.
- 화면의 시각·수집 상태 갱신을 선택적인 지도·원형 그림 갱신보다 먼저 처리한다. API 장애 중 GPS 수신과 서버 전송 상태를 구분한다.
- 로컬 검증: 관련 Node 12개 파일 통과, Java/JUnit 18개 검사 통과. 전체 Node 검사에서 기존 `current-vehicle-scope.test.js` 실패가 확인되었고 이번 변경 대상은 아니다. 로컬 Chromium 다운로드 실패로 화면 검증은 CI에서 수행해야 한다.
- PR50 최초 검증 head `25a3b9bfbd1ca268a6a5e9606012cb9a34c6a666`: [서명 APK 빌드](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39538440844)와 [모바일 화면 CI](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39538494382) 성공. Android versionCode 82, versionName 0.82-live-recovery. APK SHA-256: `54808ed80332e30e8df4d70f0fe28b0300844149c1fc96061e59ba2cef0b02dd`.
- [PR50](https://github.com/skyballpd-wq/BUS70-TEST/pull/50) 병합: `711152bfc5b7f6811bee587089150b8eacea37b3`. 최종 화면 CI [39538904280](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39538904280) 성공, 320/360/412px 남은 거리·ETA·추정 기준시각·장애 상태 확인. 첫 Android 변경 head의 에뮬레이터 검사 [39538440708](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39538440708) 성공.
- [PR51](https://github.com/skyballpd-wq/BUS70-TEST/pull/51)에서 두 GPS 모듈 URL과 서비스워커 캐시를 함께 v82로 갱신했다. 기존 설치폰이 예전 모듈을 재사용하는 문제를 방지한다. 검증 head `9a9d184d3711ea18ac8b0ffdd3020dbf654c5954`, 화면 CI [39539473319](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39539473319) 성공. 병합 `2e44cd761e3e2301ba5eb8018471d36620642f76`, Pages 배포 [39539611412](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39539611412) 성공.
- 후속 상태: 운영 Apps Script 배포는 위의 버전 66 기록에서 완료. 실제 모바일 설치·실차 검증과 과거 누락 실제 시각 복구는 미완료. 과거 실제 시각은 변경하지 않았다.


확인 기준: 2026-10-18 KST. 코드 작성, 테스트, APK 빌드, 웹 배포와 실제 모바일 확인은 별도 단계로 기록한다. 작업 재개 시 최신 main과 PR·Actions 결과를 다시 확인한다. 운영 상세와 원본 확인 결과는 비공개 작업기록에서 관리한다.

## 최근 확인

- v75 휴무 안내와 정적 캐릭터 아이콘은 사용자의 모바일 화면 확인을 받았다.
- v76 변경은 휴무 안내 글자·줄바꿈과 투명 캐릭터 자산, Android 홈 화면 위젯이다.
- Android v76 구현·서명 APK 빌드·Android 시험 검증과 PR43 병합이 완료되었다. 휴무 화면 HTML 변경은 10/18 사용자 명시 승인 후 PR44 병합과 웹 v76.0 배포를 완료했다.

## v76 변경

- 휴무 제목·날짜·기간·설명 글자 크기와 간격을 정리한다. 한글 단어와 날짜 중간 줄바꿈을 방지하고 월별 날짜는 작은 목록으로 표시한다.
- 투명 PNG 앱 아이콘을 제공한다. 일반 런처 아이콘의 마스크와 효과는 런처 설정에 따른다.
- 별도의 홈 화면 위젯 **소신 버스 캐릭터**는 눈 깜박임, 웃음, 한 바퀴 회전, 점프, 제자리 복귀를 반복한다. 누르면 기존 앱을 연다.
- 위젯은 로컬 이미지와 ViewFlipper로 재생한다. 추가 서비스, 알람, 네트워크 또는 위치 호출을 사용하지 않는다. 시스템 애니메이션을 끈 상태로 추가하면 정적 캐릭터를 표시한다.
- 휴무 화면의 작은 캐릭터는 한 번 인사하며 움직임 감소 설정에서는 정지한다. 실제 운행 화면에는 추가하지 않는다.
- Android versionCode 76 / versionName 0.76-mascot. 웹 v76.0 배포 완료. 운행 판정과 서버 코드는 변경하지 않는다.

## 검증 범위

- 합성 데이터로 휴무 기간·날짜·계정 분리 및 기존 일정 조회를 확인한다.
- 브라우저에서 320/360/412px 화면과 150% 글자 확대, 움직임 감소 설정을 확인한다.
- Android에서 투명 픽셀, 위젯 생성·재생·화면 분리 시 정지, 클릭 연결을 확인한다.
- 빌드·배포 확인과 삼성 홈 화면의 실제 동작 확인을 구별한다. 실기기 미확인 동작을 완료로 표현하지 않는다.

## 별도 미완료 작업

- 외부 실시간 API의 장시간 안정성·계정별 제한 원인 검증. 현재 연결 확인은 위의 서버 버전 66 기록 참조.
- 누락 운행 기록의 근거 확인과 복구.
- 접속·트래픽 기능 검토와 실제 현장 검증.

전체 앱 HTML 공개 업로드와 기존 비공개 작업연계 시트 기록은 10/18 사용자 명시 승인을 받았다. 기존 서버 주소와 인증·권한 처리를 보존한 채 휴무 화면 변경을 반영한다.


## v76 검증 결과

- [PR43](https://github.com/skyballpd-wq/BUS70-TEST/pull/43) 병합: `9a8b9b08fd1fee9b14082d336d324315f4668429`. 검증 head: `9da9d7989e92290980f803ff9a00eb02487f9fd6`.
- [APK 빌드 39085800681](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39085800681) 및 [후속 빌드 39086147184](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39086147184) 성공. 전달 APK는 첫 빌드 산출물이며 이후 변경은 종료 시점 검증 테스트뿐이다.
- 전달 APK SHA-256: `289e35967892cc06b2f40c93ca0d58d9012e7855818551badbc45549fea9f5ed`. 기존 설치 버전과 서명 일치 확인.
- [Android 위젯 시험 39086147164](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39086147164) 성공. Android 15에서 RemoteViews 생성, 프레임 재생, 실제 창 분리 후 정지, 투명 픽셀, 정적 대체 표시 2개 통합 시험 통과. 순수 Java 동작 검증 2개도 통과.
- 삼성 휴대폰 홈 화면에 위젯 추가·실제 재생은 사용자 확인 대기. 홈 화면 길게 누르기 → 위젯 → 소신여객 기사 → 소신 버스 캐릭터.
- 휴무 HTML/CSS 수정본 공개 반영을 승인받아 PR44로 배포했다. 로컬 휴무·현재 날짜 검증, 브라우저 320/360/412px·150% 글자 확대·움직임 감소 검사 모두 통과했다.

## 웹 v76.0 배포 확인

- [PR44](https://github.com/skyballpd-wq/BUS70-TEST/pull/44) 병합: `35200d1e1b820e7e452b0f7537cff7d2c51537a6`. 검증 head: `fd06dda6af57b04fa404e708f59336a7b5d0221a`.
- [모바일 브라우저 검사 39089993975](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39089993975), [APK 빌드 39089987271](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39089987271) 성공. 합성 휴무 데이터의 작은 화면과 글자 확대 캡처를 검토했다.
- [Pages 배포 39090249876](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39090249876) 성공. 실제 서비스의 v76.0 표시를 브라우저에서 확인했다. HTML, 서비스워커, 웹매니페스트, 캐릭터 4개 이미지의 HTTP 200 응답과 검증 원본 일치를 확인했다.
- 기존 Android v76 설치본은 재설치 없이 웹 변경을 받는다. 서버 배포 및 운행 기록·배차·휴무 원장은 이번 변경 대상이 아니다.
- 실제 삼성 휴대폰의 글자 크기·위젯 재생은 사용자 확인 대기다. 브라우저 합성 검사와 Android 시험 결과를 실차 검증으로 간주하지 않는다.


## v78 원장 표·정류장별 도착 안내 준비

- 사용자 승인에 따라 앱 원장 표·모바일 지점표·XLSX의 항목과 실제 시각을 공통 모델로 표시한다. 실제 도착·복귀 시각은 빨간색이며 누락 시각을 계획으로 채우지 않는다. 현장 종이 원본의 세부 배치는 추후 대조한다.
- Android 78은 하행 역곡역북부 통과 후 각 정류장 도착 때 고강차고지 조기 도착을 판단한다. 동일 정류장 중복 안내를 억제하고 다음 정류장에서 재평가한다. 출발 전·완료·기준점 없음·오래된 위치에서는 경고하지 않는다.
- 로컬 순수 Java 경고 정책 7개 검사와 원장/XLSX·시각·과거 기록·초기 조회 회귀검사를 통과했다. 브라우저 및 서명 APK 빌드는 CI에서 확인한다.
- Apps Script 편집 접근 제한은 아직 해소되지 않았다. 서버 의존 기능은 준비 상태를 확인하며 운영 배포·실차 검증 완료로 표현하지 않는다.

- Android 78 고정 서명 빌드 [39102646538](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39102646538) 성공, 소스 `4b290cab7576be5ef9167396541a41747431bdd9`. 모바일 검사에서 새 예측 상태를 모르는 기존 격리 테스트 설정을 보완하여 재검사한다. 운영 Apps Script 수정은 이번 커밋에서 제외했다.

- [모바일 검사 39102834959](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39102834959) 통과. 320/412px 원장 열·행·빈 실제 시각·빨간 도착·스크롤 범위·기존 사고/휴무/날짜 흐름 확인. [Android 위젯 39102646499](https://github.com/skyballpd-wq/BUS70-TEST/actions/runs/39102646499) 통과. 대기·완료 상태와 대시보드 로컬 회귀 검사도 통과했다.
- APK78 SHA-256 `764aa4f02ef4ffa5693e60dc9150f2c554938de3774e4ae92ddecdfbc16242b7`, 기존 설치본과 인증서 일치 확인. 설치파일 빌드 소스 이후 변경은 시험·상태 문서뿐이다. 실제 차량 음성과 GPS 예측 정확도는 현장 확인이 남아 있다.


## Dispatch image export and roster consistency v81

- Add an Android PNG share chooser and document save flow. Validate filename, PNG bytes and size; share a private content URI with read permission only. Opening the chooser does not mean a message was sent.
- Keep browser sharing and download paths, identify older APKs, and reject stale images after roster/date/route changes.
- Use confirmed same-day dispatch when reconciling monthly leave plans, even when normalized timetables contain no roster. Keep explicit daily absence restrictions and unassigned planned leave exclusions. Show a visible missing-driver placeholder instead of an empty selector.
- The user explicitly approved publishing the 12 reviewed source files and the database field/business logic definitions, excluding real driver and dispatch records. PR48 contains the approved changes.
- Local manager dispatch, native export protocol, normalized data, driver dashboard and current-date tests pass. Mobile browser CI 39111941065 passed. Fixed-signature APK build 39111932746 passed; versionCode 81 / versionName 0.81-dispatch-share and the existing production certificate were verified.
- Android emulator run 39111932735 exposed a test-host launch timeout. The new export tests now use ActivityScenario with a fresh task and a MIME-aware document intent filter. In run 39112485489 the two export tests passed; an existing photo-test window-detach assertion failed once. Attempt 2 passed all six Android tests without further code changes. Runtime export code was unchanged by these test corrections.
- Qualified source: c14028a898ccb10899759b7e9899492ded5d49d5. Mobile browser run 39112487881 and fixed-signature release build 39112485484 also passed. The delivered APK comes from build 39111932746; subsequent changes affect only tests, their dependency and this status document. SHA-256: 7eda04b2b939306ed7c03860808342f32f22f14843f9c74df1106e2a9f4065e2.
- PR48 is ready to publish web v81.0 / service-worker cache soshin-ops-static-v81-dispatch-share. Deployment outcome is available in the repository Pages workflow and the private work handoff record.
- Apps Script roster deployment and real handset sharing remain separate, unverified steps. Protected browser-session access currently prevents the server patch from being applied. Operational roster and leave rows have not been rewritten.

## Dispatch board layout v81.1

- Field feedback confirms image generation and group-chat sharing on the pilot's smaller route board. Long departure labels overlapped the driver area, and a missing candidate blocked generation of the whole board.
- Render at most eight sequences per row with fixed text areas for sequence, departure time, full departure place, driver and the last three vehicle digits. More sequences add rows. Each text area uses measured wrapping and clipping. The heading includes the selected date, weekday and shift.
- Allow preview/export with missing assignments, mark unresolved and unassigned fields visibly, and preserve all sequence numbers. Generating an image does not save or invent an assignment. Confirmed assignment IDs missing from the candidate response remain visible as disabled placeholders.
- Monthly leave plans and confirmed daily assignments can differ after an offline change. Confirmed daily roster display takes priority; the changed leave date and agreement details remain unknown until verified. The server candidate-filter patch from v81 still requires Apps Script deployment; no operational leave or roster rows were changed for this presentation fix.
- Web-only change compatible with Android v81; no APK reinstall is required. Local manager dispatch/native export regressions and JavaScript syntax checks pass. Browser verification includes 8, 22, 32 and 80 synthetic sequences, missing fields, actual glyph bounds, timezone-independent weekday and Android PNG limits. CI/Pages results are recorded with the release handoff after verification.
