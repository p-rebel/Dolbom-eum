import { Link } from '../router';
import { OFFICIAL_SITE } from '../siteConfig';

/**
 * 공통 하단(KRDS krds-footer).
 * 공식 표시를 켜면(`siteConfig.ts`) 대체할 보건복지부 지역사회 통합돌봄 누리집(https://www.mohw.go.kr/integratedcare/)의
 * 하단 내용을 그대로 옮긴다(11/16): 로고, 주소, 안내전화·당직실·FAX, 찾아오시는 길, SNS, 개인정보처리방침, 저작권.
 * 끄면 시연 서비스 정보만 둔다. 어느 쪽이든 가상 데이터 안내는 남긴다.
 */
const SNS = [
  { label: '페이스북', icon: 'ico-facebook', href: 'https://facebook.com/mohwpr' },
  { label: '트위터(X)', icon: 'ico-sns-x', href: 'https://twitter.com/mohwpr' },
  { label: '유튜브', icon: 'ico-youtube', href: 'https://youtube.com/user/mohwpr' },
  { label: '블로그', icon: 'ico-blog', href: 'https://blog.naver.com/mohw2016' },
  // 원본 누리집은 주소가 instargram.com으로 잘못 적혀 있어 바로잡았다.
  { label: '인스타그램', icon: 'ico-instagram', href: 'https://instagram.com/mohw_kr/' },
];

const DEMO_NOTICE = '청년공공AX서포터즈 프로젝트의 시연용 화면입니다. 모든 신청·대상자 정보는 가상 데이터이며 실제 개인정보를 처리하지 않습니다.';

export function AppFooter() {
  if (!OFFICIAL_SITE) {
    return (
      <footer id="krds-footer" className="app-footer">
        <div className="inner">
          <div className="f-cnt">
            <div className="f-info">
              <p className="app-footer-name">돌봄e음 · 가상 사례 시연</p>
              <p className="info-addr">{DEMO_NOTICE}</p>
            </div>
          </div>
          <div className="f-btm">
            <div className="f-btm-text">
              <div className="f-menu">
                <Link to="/login/staff">공무원·관리자 로그인</Link>
              </div>
              <p className="f-copy">© 2026 돌봄e음 팀</p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer id="krds-footer" className="app-footer app-footer-official">
      <div className="inner">
        <div className="f-logo app-footer-logo">
          <img src="/images/mohw-logo.png" alt="보건복지부 지역사회 통합돌봄" width={374} height={48} />
        </div>
        <div className="f-cnt">
          <div className="f-info">
            <p className="info-addr">(30113) 세종특별자치시 도움4로 13 보건복지부 (정부세종청사 10동)</p>
            <ul className="info-cs">
              <li>
                <span className="span">안내전화</span>{' '}
                <a href="tel:129" className="strong">보건복지상담센터 국번없이 129(무료)</a>
                <span className="span"> 평일 09:00~18:00, 긴급지원상담은 24시</span>
              </li>
              <li>
                <span className="span">당직실</span> <a href="tel:044-202-2118" className="strong">044-202-2118</a>
                <span className="span app-footer-gap">FAX</span> <span className="strong">044-202-3910</span>
              </li>
            </ul>
            <p className="info-addr app-footer-demo">{DEMO_NOTICE}</p>
          </div>
          <div className="f-link">
            <div className="link-go">
              <a href="https://mohw.go.kr/menu.es?mid=a10608000000" className="krds-btn medium text" target="_blank" rel="noreferrer" title="새 창 열기">
                찾아오시는 길 <i className="svg-icon ico-angle right" aria-hidden="true" />
              </a>
            </div>
            <div className="link-sns">
              {SNS.map((item) => (
                <a key={item.label} href={item.href} className="krds-btn xlarge icon border" target="_blank" rel="noreferrer" title="새 창 열기">
                  <span className="sr-only">{item.label}</span>
                  <i className={'svg-icon ' + item.icon} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="f-btm">
          <div className="f-btm-text">
            <div className="f-menu">
              <a href="https://mohw.go.kr/menu.es?mid=a10803000000" className="point" target="_blank" rel="noreferrer" title="새 창 열기">개인정보처리방침</a>
              {/* 상단에는 일반 이용자 ‘로그인’만 두고, 담당 공무원 로그인은 하단에서 들어간다(11/16). */}
              <Link to="/login/staff">공무원·관리자 로그인</Link>
            </div>
            <p className="f-copy">© COPYRIGHT MOHW. ALL RIGHTS RESERVED</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
