# BUS70-TEST
소신여객 양성기사 운행 관리 테스트 버전

## 배차판 사진 확인 등록

- `apps-script/BoardEntry.gs`를 Apps Script 프로젝트에 추가합니다.
- `Code.gs`의 `doPost`가 `validateDispatchBoard`, `registerDispatchBoard`를 `bus70AuthAction_`으로 전달해야 합니다.
- 사진은 휴대폰에서 참고용으로만 표시되며 서버나 외부 AI 서비스로 전송되지 않습니다.
- 사용자가 입력한 날짜·순차·차량번호 뒤 3자리만 차량DB·시간표·기존 배차와 대조합니다.
- 검증 결과는 10분 동안만 임시 보관되며 사용자가 최종 확인해야 `배차DB`에 등록됩니다.
