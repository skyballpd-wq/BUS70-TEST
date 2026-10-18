# 공통 기술 작업현황

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

- 외부 실시간 API의 실제 응답 및 연결 상태 확인.
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
- Local manager dispatch, native export protocol, normalized data, driver dashboard and current-date tests pass. Browser tests could not run because no Chromium executable is installed; Android compilation/emulator tests remain unverified. Automatic approval review blocked publication of the 12 changed public-repository files, so no v81 CI build, merge or web deployment occurred. Server roster patch deployment and real handset sharing remain separate, unverified steps.
