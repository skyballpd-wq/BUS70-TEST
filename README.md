# BUS70-TEST
소신여객 양성기사 운행 관리 테스트 버전

## 배차판 자동 판독

- `apps-script/BoardOcr.gs`를 Apps Script 프로젝트에 추가합니다.
- `Code.gs`의 `doPost`가 `analyzeDispatchBoard`, `registerDispatchBoard`를 `bus70AuthAction_`으로 전달해야 합니다.
- Apps Script의 스크립트 속성에 `BUS70_GEMINI_API_KEY`를 등록합니다.
- 서버 배포와 키 등록을 검증한 뒤 `index.html`의 `BOARD_OCR_ENABLED`를 `true`로 전환합니다.
- 선택 사항으로 `BUS70_GEMINI_MODEL`을 등록할 수 있으며 기본값은 `gemini-2.5-flash`입니다.
- 사진은 판독 요청 중 Gemini API로 전송되지만 스프레드시트나 Apps Script 속성에 저장하지 않습니다.
- 판독 결과는 10분 동안만 임시 보관되며 사용자가 확인해야 `배차DB`에 등록됩니다.
