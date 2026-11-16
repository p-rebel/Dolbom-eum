import { NOTICE_METHOD_LABEL } from '../../api/labels';
import { AppFooter } from '../../layout/AppFooter';
import { AppHeader } from '../../layout/AppHeader';
import { AccountArea, PublicMenu } from '../../layout/PublicNav';
import { PageHead } from '../../layout/PageHead';
import { Link, PageTitle } from '../../router';
import { siteText } from '../../siteConfig';

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
const NOTICE_METHODS = `${NOTICE_METHOD_LABEL.SMS}·${NOTICE_METHOD_LABEL.MAIL}`;

export function PublicHome({ guide }: { guide: boolean }) {
  return (
    <>
      <AppHeader
        logoTo="/"
        account={<AccountArea />}
        menu={<PublicMenu />}
      />
      <main id="main" className="app-main">
        {guide ? <ApplyGuide /> : <HomeOverview />}
      </main>
      <AppFooter />
    </>
  );
}

/**
 * 공개 홈. 정부 누리집(보건복지부 지역사회 통합돌봄) 첫 화면 구성을 KRDS로 옮겼다(11/16):
 * 전체 폭 사진 영역 + 왼쪽 큰 문구, 사진 아래에 걸친 안내 상자(그림·설명·버튼 2개), 그 아래 섹션.
 * 사진·그림은 public/images의 home-hero.jpg·home-intro.png(AI 생성 예정). 파일이 없으면 색 배경만 보인다.
 */
function HomeOverview() {
  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="inner">
          <PageTitle id="home-title" className="home-hero-title">살던 곳에서,<br />이어지는 돌봄</PageTitle>
          <p className="home-hero-lead">
            의료·요양·돌봄을 지역에서 통합·연계하여,<br />
            누구나 익숙한 일상 속에서 건강한 삶을 이어가도록 지원합니다.
          </p>
        </div>
      </section>

      <div className="inner">
        <section className="home-intro" aria-labelledby="home-intro-title">
          <div className="home-intro-art" aria-hidden="true" />
          <div className="home-intro-text">
            <h2 id="home-intro-title">지역사회 통합돌봄이란?</h2>
            <p>의료·요양·돌봄을 지역에서 통합·연계하여, 누구나 익숙한 일상 속에서 건강한 삶을 이어가도록 지원하는 제도입니다.</p>
          </div>
          <div className="home-intro-actions">
            <Link className="krds-btn large primary" to="/apply/new">돌봄 신청하기 <i className="svg-icon ico-angle right" aria-hidden="true" /></Link>
            <Link className="krds-btn large secondary home-intro-guide" to="/apply">신청 안내 보기 <i className="svg-icon ico-angle right" aria-hidden="true" /></Link>
          </div>
        </section>

        <section id="care-overview" className="home-section" aria-labelledby="care-overview-heading">
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

        <section id="care-process" className="home-section" aria-labelledby="care-process-heading">
          <h2 id="care-process-heading">신청 후 진행 절차</h2>
          {/* 진행 상태가 아니라 절차 안내라 KRDS 단계 표시(완료·현재 표시) 대신 번호 목록으로 둔다. */}
          <ol className="home-process">
            {PROCESS.map((label, index) => (
              <li key={label}>
                <span className="home-process-num" aria-hidden="true">{index + 1}</span>
                <span className="home-process-label">{label}</span>
              </li>
            ))}
          </ol>
          <a href={OFFICIAL_GUIDE} className="registration-text-link" target="_blank" rel="noreferrer">보건복지부 공식 이용안내 (새 창)</a>
        </section>
      </div>
    </div>
  );
}

/**
 * 신청 안내. 대체할 누리집의 ‘지역사회 통합돌봄 이용안내’(mohw.go.kr menu.es?mid=a60200000000) 내용과
 * 정부24 서비스 안내 화면 구성을 따른다(11/16): 왼쪽 본문(신청방법 정의 목록 → 신청 전 확인 → 진행 절차),
 * 오른쪽에 화면을 내려도 따라오는 ‘온라인 신청’ 상자. 전에는 한 단에 짧은 목록만 있어 왼쪽으로 몰려 보였다.
 */
const APPLY_METHODS = [
  { title: '신청 창구', desc: '신청자 주소지 읍면동 행정복지센터, 국민건강보험공단 지사 등', note: siteText('이 누리집의 ‘신청서 작성’으로 온라인 신청(가상 시연)도 할 수 있습니다.', '이 누리집의 ‘신청서 작성’으로 온라인 신청도 할 수 있습니다.') },
  { title: '신청 방법', desc: siteText('방문 신청, 우편·팩스 신청, 온라인 신청(가상 시연)', '방문 신청, 우편·팩스 신청, 온라인 신청') },
  { title: '신청자', desc: '대상자, 대상자 가족(8촌 이내의 친족), 후견인, 시군구(직권 신청), 기관 담당자', note: '기관 담당자는 본인의 동의가 있는 경우 신청할 수 있습니다.' },
];
const GUIDE_STEPS = [
  { title: '신청', desc: '읍면동 행정복지센터·국민건강보험공단 지사 또는 온라인으로 신청합니다.' },
  { title: '사전조사', desc: '접수일 기준 5일 이내에 대면 또는 유선으로 조사하고 결과를 안내합니다.' },
  { title: '통합판정조사·자체조사', desc: '복합적인 의료·돌봄 필요도를 국민건강보험공단 또는 지자체가 조사합니다.' },
  { title: '개인별 지원계획', desc: '조사 결과를 토대로 개인의 특성과 욕구에 맞춘 서비스 목표와 내용을 정합니다.' },
  { title: '통합지원회의', desc: '시군구·읍면동·보건소·공단 등이 모여 지원계획을 승인하거나 변경합니다.' },
  { title: '서비스 제공', desc: '사업부서·제공기관에 연계하거나 대상자에게 직접 안내합니다.' },
  { title: '모니터링', desc: '최초 1개월 이내, 이후 3개월마다 이용 현황과 상태 변화를 확인합니다.' },
];

function ApplyGuide() {
  return (
    <div className="inner page registration-guide">
      <PageHead parents={[{ label: '홈', to: '/' }]} title="돌봄 신청 안내" />
      <p className="registration-lead">의료·요양·돌봄이 함께 필요한 분은 주소지 읍면동이나 이 누리집에서 지역사회 통합돌봄을 신청할 수 있습니다.</p>
      <div className="guide-layout">
        <div className="guide-body">
          <section className="guide-section" aria-labelledby="guide-method">
            <h2 id="guide-method">신청방법</h2>
            <dl className="guide-define">
              {APPLY_METHODS.map((item) => (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>
                    {item.desc}
                    {item.note && <p className="guide-note">{item.note}</p>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="guide-section" aria-labelledby="apply-checklist">
            <h2 id="apply-checklist">신청 전에 확인해 주세요</h2>
            <ul className="guide-check">
              <li>돌봄을 받는 분의 이름, 생년월일, 주소와 관할 지역</li>
              <li>가족이나 후견인이 신청하는 경우 신청인 정보와 대상자와의 관계</li>
              <li>필요한 돌봄과 안내받을 방법({NOTICE_METHODS}), 신청 유형에 맞는 증빙</li>
            </ul>
          </section>

          <section className="guide-section" aria-labelledby="guide-steps">
            <h2 id="guide-steps">신청 후 진행 절차</h2>
            <ol className="guide-steps">
              {GUIDE_STEPS.map((item, index) => (
                <li key={item.title}>
                  <span className="guide-step-num" aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="guide-aside" aria-labelledby="guide-apply-title">
          <h2 id="guide-apply-title">온라인 신청</h2>
          <p>{siteText('가상 정보로 신청서와 동의서를 작성해 가상 통합돌봄 접수처에 제출합니다.', '신청서와 동의서를 작성해 통합돌봄 접수처에 제출합니다.')}</p>
          <dl className="guide-aside-info">
            <div><dt>소요 시간</dt><dd>약 5분</dd></div>
            <div><dt>준비물</dt><dd>{siteText('대상자 정보, 가상 증빙(선택)', '대상자 정보, 증빙 서류(선택)')}</dd></div>
            <div><dt>결과 안내</dt><dd>내 신청 현황, {NOTICE_METHODS}</dd></div>
          </dl>
          <Link className="krds-btn large primary guide-aside-btn" to="/apply/new">신청서 작성</Link>
          <Link className="krds-btn medium secondary guide-aside-btn" to="/my/applications">내 신청 현황</Link>
          <a className="registration-text-link guide-aside-link" href={OFFICIAL_GUIDE} target="_blank" rel="noreferrer">보건복지부 통합돌봄 이용안내 (새 창)</a>
        </aside>
      </div>
    </div>
  );
}
