# BUS70-TEST
소신여객 양성기사 운행 관리 테스트 버전

## 배차판 사진 확인 등록

- `apps-script/BoardEntry.gs`를 Apps Script 프로젝트에 추가합니다.
- `Code.gs`의 `doPost`가 `validateDispatchBoard`, `registerDispatchBoard`를 `bus70AuthAction_`으로 전달해야 합니다.
- 사진은 휴대폰에서 참고용으로만 표시되며 서버나 외부 AI 서비스로 전송되지 않습니다.
- 사용자가 입력한 날짜·순차·차량번호 뒤 3자리만 차량DB·시간표·기존 배차와 대조합니다.
- 검증 결과는 10분 동안만 임시 보관되며 사용자가 최종 확인해야 `배차DB`에 등록됩니다.

## 소장용 날짜별 배차 현황

- `apps-script/ManagerDispatch.gs`는 소장 권한 사용자가 날짜·근무조별 1~11순차의 기사와 차량을 선택해 저장합니다.
- `Code.gs`의 `doPost`가 `managerDispatchBootstrap`, `saveManagerDispatchDay`도 `bus70AuthAction_`으로 전달해야 합니다.
- 소장 권한은 `계정DB`의 `권한=소장/관리자` 또는 스크립트 속성 `BUS70_MANAGER_DRIVER_IDS`로 제한합니다.
- 저장 전 기사·차량 중복과 시간표 연결을 검증하고 변경 내역을 `변경이력DB`에 기록합니다.
- 상황판·시간표 OCR은 저장값과 대조하는 보조 수단이며 OCR 결과만으로 배차를 자동 확정하지 않습니다.
- 생성된 PNG는 Web Share 기능으로 카카오톡 채팅방 선택 화면에 전달합니다. 카카오톡 정책상 채팅방 선택과 최종 전송은 사용자가 수행합니다.
