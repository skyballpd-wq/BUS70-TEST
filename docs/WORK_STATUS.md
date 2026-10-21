# 공통 기술 작업현황

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
