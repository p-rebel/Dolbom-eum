import { AppFooter } from '../../layout/AppFooter';
import { AppHeader } from '../../layout/AppHeader';
import { Link, PageTitle } from '../../router';

const OFFICIAL_GUIDE = 'https://www.mohw.go.kr/menu.es?mid=a60200000000';
const SUPPORT = [
  {
    title: '받을 수 있는 지원',
    detail: '방문진료, 요양, 식사와 이동 등 살던 곳에서 생활하는 데 필요한 돌봄을 연결합니다.',
  },
  {
    title: '신청할 수 있는 사람',
    detail: '돌봄이 필요한 본인이나 가족, 후견인이 신청할 수 있습니다.',
  },
  {
    title: '신청 전 준비',
    detail: '대상자의 주소지, 필요한 돌봄, 신청인과의 관계를 확인해 주세요.',
  },
];
const PROCESS = ['신청', '조사·판정', '지원계획', '서비스 제공', '모니터링'];

export function PublicHome({ guide }: { guide: boolean }) {
  return (
    <>
      <AppHeader
        logoTo="/"
        account={
          <div className="header-actions registration-logins">
            <Link to="/login/applicant" className="krds-btn small tertiary">신청자 로그인</Link>
            <Link to="/login/staff" className="krds-btn small secondary">공무원·관리자 로그인</Link>
          </div>
        }
        menu={
          <nav className="krds-main-menu registration-nav" aria-label="주 메뉴">
            <div className="inner">
              <ul className="gnb-menu">
                <li><Link to="/" aria-current={!guide ? 'page' : undefined} className={'gnb-main-trigger is-link' + (!guide ? ' active' : '')}>통합돌봄 한눈에 보기</Link></li>
                <li><Link to="/apply" aria-current={guide ? 'page' : undefined} className={'gnb-main-trigger is-link' + (guide ? ' active' : '')}>신청 안내</Link></li>
                <li><Link to="/my/applications" className="gnb-main-trigger is-link">내 신청 현황</Link></li>
              </ul>
            </div>
          </nav>
        }
      />
      <main id="main" className="app-main">
        {guide ? <ApplyGuide /> : <HomeOverview />}
      </main>
      <AppFooter />
    </>
  );
}

function HomeOverview() {
  return (
    <div className="inner registration-home">
      <div className="registration-overview">
        <div>
          <PageTitle>지역사회 통합돌봄 한눈에 보기</PageTitle>
          <p className="registration-lead">살던 곳에서 생활을 이어갈 수 있도록 지역의 의료, 요양, 일상 돌봄을 연결합니다.</p>
          <Link className="krds-btn large primary registration-cta" to="/apply">돌봄 신청하기 <span aria-hidden="true">→</span></Link>

          <section id="care-overview" className="registration-section" aria-labelledby="care-overview-heading">
            <h2 id="care-overview-heading">통합돌봄 안내</h2>
            <div className="registration-support">
              {SUPPORT.map((item) => (
                <section key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </section>
              ))}
            </div>
          </section>

          <section id="care-process" className="registration-section" aria-labelledby="care-process-heading">
            <h2 id="care-process-heading">신청 후 진행 절차</h2>
            <ol className="registration-process">{PROCESS.map((label) => <li key={label}>{label}</li>)}</ol>
            <a href={OFFICIAL_GUIDE} className="registration-text-link">보건복지부 공식 이용안내</a>
          </section>
        </div>
        <nav className="registration-toc" aria-label="이 페이지의 구성">
          <p>이 페이지의 구성</p>
          <a href="#care-overview">통합돌봄 안내</a>
          <a href="#care-process">신청 후 진행 절차</a>
        </nav>
      </div>
    </div>
  );
}

function ApplyGuide() {
  return (
    <div className="inner page registration-guide">
      <PageTitle>돌봄 신청 안내</PageTitle>
      <p className="registration-lead">가상 정보로 신청서와 동의서를 작성하고, 가상 통합돌봄 접수처에 제출할 수 있습니다.</p>
      <section className="registration-guide-panel" aria-labelledby="apply-checklist">
        <h2 id="apply-checklist">신청 전에 확인해 주세요</h2>
        <ul>
          <li>돌봄을 받는 분의 가상 이름, 생년월일, 주소와 관할 지역</li>
          <li>가족이나 후견인이 신청하는 경우 신청인 정보와 대상자와의 관계</li>
          <li>필요한 돌봄과 안내받을 방법, 신청 유형에 맞는 가상 증빙</li>
        </ul>
      </section>
      <div className="registration-actions">
        <Link className="krds-btn large primary" to="/apply/new">신청서 작성</Link>
        <a className="registration-text-link" href={OFFICIAL_GUIDE}>실제 신청 방법과 서류 확인</a>
      </div>
    </div>
  );
}
