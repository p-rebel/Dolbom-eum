import { useEffect, useRef, type ReactNode } from 'react';
import { MOCK_API_ENABLED } from '../api/mockFlag';
import { Link } from '../router';
import { OFFICIAL_SITE } from '../siteConfig';
import { SiteUtility } from './SiteUtility';

/**
 * 공통 상단(KRDS krds-header). 로그인 전후 모든 화면에 같은 위치로 둔다.
 * 가상 데이터 시연 표시는 항상 보인다. 공개 화면은 역할별 로그인 링크를, 업무 화면은 계정과 메뉴를 전달한다.
 * KRDS 공식 누리집 표시(masthead)는 정부 누리집 탑재 때만 켠다(`siteConfig.ts`, 기본 꺼짐).
 * 시연 서버에서 켜면 실제 정부 누리집으로 오인될 수 있다.
 */
export function AppHeader({ logoTo, account, menu }: { logoTo: string; account?: ReactNode; menu?: ReactNode }) {
  const headerRef = useRef<HTMLElement>(null);

  // KRDS 상단은 화면을 내려도 위에 붙어 있다(position: sticky). 따라다니는 상자·목차 이동이 상단 밑으로 가려지지 않게
  // 실제 높이를 --app-header-height로 알린다. 글자 크기 설정·줄바꿈으로 높이가 바뀌어 고정값으로 둘 수 없다(11/16).
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--app-header-height', `${Math.round(header.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div id="krds-skip-link">
        <a href="#main">본문 바로가기</a>
      </div>
      {OFFICIAL_SITE && (
        <div id="krds-masthead">
          <div className="toggle-wrap">
            <div className="toggle-head">
              <div className="inner">
                <span className="nuri-txt">이 누리집은 대한민국 공식 전자정부 누리집입니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
      <header id="krds-header" ref={headerRef}>
        <div className="header-in">
          <div className="header-container">
            <div className="inner">
              <SiteUtility />
              <div className="header-branding">
                {/* 공식 표시를 켜면 운영기관 로고(정부 상징 + 보건복지부 지역사회 통합돌봄) 옆에 서비스 이름을 둔다. */}
                {OFFICIAL_SITE ? (
                  <div className="logo app-logo app-logo-official">
                    <Link to={logoTo}>
                      <img src="/images/mohw-logo.png" alt="보건복지부 지역사회 통합돌봄" width={374} height={48} />
                      <span className="app-logo-service">돌봄e음</span>
                    </Link>
                  </div>
                ) : (
                  <div className="logo app-logo">
                    <Link to={logoTo}>돌봄e음</Link>
                  </div>
                )}
                {!OFFICIAL_SITE && <span className="krds-badge bg-light-secondary">가상 사례 시연</span>}
                {MOCK_API_ENABLED && <span className="krds-badge bg-light-warning">목업 모드</span>}
                {account}
              </div>
            </div>
          </div>
          {menu}
        </div>
      </header>
    </>
  );
}
