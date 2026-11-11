/**
 * 공통 하단. KRDS 체크리스트(푸터): 모든 화면에 일관된 위치로 제공하고, 서비스 이름·연락처·저작권을 둔다.
 * 시연 앱이라 실제 기관 주소·연락처·개인정보 처리방침이 없으며, 운영기관 식별자(정부 누리집 표시)는 쓰지 않는다.
 * 빠진 항목은 docs/development/DEV-03.md의 KRDS 예외로 기록한다.
 */
export function AppFooter() {
  return (
    <footer id="krds-footer" className="app-footer">
      <div className="inner">
        <div className="f-cnt">
          <div className="f-info">
            <p className="app-footer-name">돌봄e음 · 가상 사례 시연</p>
            <p className="info-addr">
              청년공공AX서포터즈 프로젝트의 시연용 화면입니다. 모든 신청·대상자 정보는 가상 데이터이며 실제 개인정보를 처리하지 않습니다.
            </p>
          </div>
        </div>
        <div className="f-btm">
          <div className="f-btm-text">
            <p className="f-copy">© 2026 돌봄e음 팀</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
