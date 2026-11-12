import { useEffect, useState } from 'react';
import { getCase } from '../../api/cases';
import {
  ACTION_LABEL,
  ASSESSMENT_OUTCOME_LABEL,
  CONDITION_LABEL,
  CONTACT_METHOD_LABEL,
  DELIVERY_STATUS_LABEL,
  formatDateTime,
  LINKAGE_METHOD_LABEL,
  MEETING_OUTCOME_LABEL,
  nextStepLabel,
  NOTICE_METHOD_LABEL,
  orMissing,
  SCREENING_OUTCOME_LABEL,
  STATUS_LABEL,
} from '../../api/labels';
import type { ActionCode, CaseDetail } from '../../api/types';
import { ROLE_LABEL } from '../../auth/AuthContext';
import { EmptyBlock, ErrorBlock, FormMessage, LoadingBlock, StatusBadge } from '../../components/Feedback';
import { takeFlash } from '../../flash';
import { useApiData } from '../../hooks/useApiData';
import { PageHead } from '../../layout/PageHead';
import { Link } from '../../router';
import { AssessmentForm, ScreeningForm } from './RecordForms';
import { PlanDraftForm } from './PlanDraftForm';
import { ConfirmPlanForm, DeliveryForm, LinkageForm, MonitoringForm, NoticeForm } from './WorkflowForms';

const SECTIONS = [
  { id: 'section-receipt', title: '접수·조사' },
  { id: 'section-plan', title: '계획' },
  { id: 'section-tracking', title: '연계·제공' },
  { id: 'section-monitoring', title: '모니터링' },
  { id: 'section-history', title: '처리 이력' },
];

/** 입력 폼이 상세 화면에 저장 결과를 알리는 방법 */
export interface SaveHandlers {
  /** 저장 성공: 응답의 최신 상세로 바꾸고 결과를 알린다. */
  onSaved: (detail: CaseDetail, message: string) => void;
  /** 충돌·권한·연결 실패: 최신 상세를 다시 불러오고 사유를 알린다(D-02). */
  onReload: (message: string) => void;
}

type Notice = { tone: 'success' | 'error'; text: string };

/** UI-04 신청 상세. 읍면동·시군구가 같은 화면에서 기록을 확인하고, 허용된 동작만 입력한다. */
export function CaseDetailPage({ caseId }: { caseId: string }) {
  const { data: detail, error, loading, reload, setData } = useApiData((signal) => getCase(caseId, signal), [caseId]);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const flash = takeFlash();
    setNotice(flash ? { tone: 'success', text: flash } : null);
  }, [caseId]);

  const handlers: SaveHandlers = {
    onSaved: (next, message) => {
      setData(next);
      setNotice({ tone: 'success', text: message });
    },
    onReload: (message) => {
      setNotice({ tone: 'error', text: message });
      reload();
    },
  };

  if (loading && !detail) {
    return <LoadingBlock label="신청 상세를 불러오는 중입니다." />;
  }
  if (error && !detail) {
    const notFound = error.status === 404 || error.status === 403;
    return (
      <div className="inner page">
        <PageHead parents={[{ label: '신청 목록', to: '/cases' }]} title="신청 상세" />
        <ErrorBlock
          message={notFound ? '신청 건을 찾을 수 없거나 조회 권한이 없습니다.' : error.message}
          onRetry={notFound ? undefined : reload}
        >
          <Link to="/cases" className="krds-btn medium secondary">
            신청 목록으로
          </Link>
        </ErrorBlock>
      </div>
    );
  }
  if (!detail) {
    return null;
  }

  const can = (action: ActionCode) => detail.allowedActions.some((item) => item.action === action);

  return (
    <div className="krds-in-page-navigation-type">
      <div className="inner page">
      <PageHead
        parents={[{ label: '신청 목록', to: '/cases' }]}
        title={`${detail.receiptNumber} · ${detail.beneficiaryName}`}
        titleId="case-title"
      />

      <section className="summary-panel case-summary" aria-label="신청 요약">
        <dl className="info-list info-inline">
          <div>
            <dt>진행 상태</dt>
            <dd>
              <StatusBadge status={detail.status} />
            </dd>
          </div>
          <div>
            <dt>다음 작업</dt>
            <dd className="next-step">{nextStepLabel(detail)}</dd>
          </div>
          <div>
            <dt>관할</dt>
            <dd>
              {detail.region.sido} {detail.region.sigungu} · {detail.region.townCode}
            </dd>
          </div>
          <div>
            <dt>버전</dt>
            <dd>{detail.version}</dd>
          </div>
        </dl>
      </section>

      {notice && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}
      {error && <ErrorBlock message="최신 기록을 다시 불러오지 못했습니다." onRetry={reload} />}

      {/* 넓은 화면에서는 KRDS 규칙대로 오른쪽에 고정되고, 좁은 화면에서는 이 자리에 놓인다. */}
      <InPageNavigation title={detail.receiptNumber} />

      <section id="section-receipt" className="page-section" aria-labelledby="section-receipt-title">
        <h2 id="section-receipt-title" className="section-title">
          접수·조사
        </h2>
        <dl className="info-list info-table">
          <div>
            <dt>가상 대상자</dt>
            <dd>{detail.profile.beneficiaryName}</dd>
          </div>
          <div>
            <dt>대리 신청인</dt>
            <dd>{detail.profile.applicantName}</dd>
          </div>
          <div>
            <dt>안내대상</dt>
            <dd>{detail.profile.noticeRecipientName}</dd>
          </div>
          <div>
            <dt>접수일</dt>
            <dd>{detail.receivedOn}</dd>
          </div>
          <div>
            <dt>안내방식</dt>
            <dd>{NOTICE_METHOD_LABEL[detail.noticeMethod]}</dd>
          </div>
          <div>
            <dt>증빙 확인</dt>
            <dd>{detail.evidenceChecked ? '확인함' : '미확인'}</dd>
          </div>
        </dl>

        <h3 className="sub-title">사전조사</h3>
        {detail.screening ? (
          <dl className="info-list info-table">
            <div>
              <dt>조사일</dt>
              <dd>{detail.screening.screenedOn}</dd>
            </div>
            <div>
              <dt>방법</dt>
              <dd>{CONTACT_METHOD_LABEL[detail.screening.method]}</dd>
            </div>
            <div>
              <dt>결과</dt>
              <dd>{SCREENING_OUTCOME_LABEL[detail.screening.outcome]}</dd>
            </div>
          </dl>
        ) : can('RECORD_SCREENING') ? (
          <ScreeningForm detail={detail} {...handlers} />
        ) : (
          <p className="text-subtle">아직 기록되지 않았습니다.</p>
        )}

        <h3 className="sub-title">판정 결과</h3>
        {detail.assessment ? (
          <dl className="info-list info-table">
            <div>
              <dt>판정일</dt>
              <dd>{detail.assessment.assessedOn}</dd>
            </div>
            <div>
              <dt>판정 수신일</dt>
              <dd>{detail.assessment.resultReceivedOn}</dd>
            </div>
            <div>
              <dt>결과</dt>
              <dd>{ASSESSMENT_OUTCOME_LABEL[detail.assessment.outcome]}</dd>
            </div>
          </dl>
        ) : can('RECORD_ASSESSMENT') ? (
          <AssessmentForm detail={detail} {...handlers} />
        ) : (
          <p className="text-subtle">아직 기록되지 않았습니다.</p>
        )}
      </section>

      <section id="section-plan" className="page-section" aria-labelledby="section-plan-title">
        <h2 id="section-plan-title" className="section-title">
          계획
        </h2>
        {can('SAVE_DRAFT') ? (
          <>
            {/* 저장된 초안을 함께 보여 준다. 충돌(409)로 다시 불러왔을 때 최신 기록과 입력을 비교할 수 있다(D-02:68). */}
            {detail.plan && (
              <div className="saved-plan">
                <h3 className="sub-title">저장된 초안 (버전 {detail.version})</h3>
                <PlanView detail={detail} />
              </div>
            )}
            <h3 className="sub-title">{detail.plan ? '초안 수정' : '초안 작성'}</h3>
            <PlanDraftForm detail={detail} {...handlers} />
          </>
        ) : detail.plan ? (
          <PlanView detail={detail} />
        ) : (
          <EmptyBlock
            message={
              detail.assessment
                ? '읍면동에서 지원계획 초안을 작성합니다.'
                : '판정 결과가 기록되면 읍면동에서 지원계획 초안을 작성합니다.'
            }
          />
        )}
        {can('CONFIRM_PLAN') && (
          <>
            <h3 className="sub-title">{ACTION_LABEL.CONFIRM_PLAN}</h3>
            <ConfirmPlanForm detail={detail} {...handlers} />
          </>
        )}
        {can('RECORD_NOTICE') && (
          <>
            <h3 className="sub-title">{ACTION_LABEL.RECORD_NOTICE}</h3>
            <NoticeForm detail={detail} {...handlers} />
          </>
        )}
      </section>

      <section id="section-tracking" className="page-section" aria-labelledby="section-tracking-title">
        <h2 id="section-tracking-title" className="section-title">
          연계·제공
        </h2>
        {detail.plan?.confirmation ? (
          <TrackingTable detail={detail} />
        ) : (
          <EmptyBlock message="계획이 확정되면 서비스별 연계와 제공 현황을 기록합니다." />
        )}
        {detail.plan?.confirmation && <ItemActions detail={detail} handlers={handlers} />}
      </section>

      <section id="section-monitoring" className="page-section" aria-labelledby="section-monitoring-title">
        <h2 id="section-monitoring-title" className="section-title">
          모니터링
        </h2>
        {detail.monitoring ? (
          <MonitoringView detail={detail} />
        ) : (
          <>
            <EmptyBlock message="모든 서비스의 연계·제공 현황이 기록되면 읍면동에서 최초 모니터링을 기록합니다." />
            {detail.plan?.confirmation && <MissingRecords detail={detail} />}
          </>
        )}
        {can('RECORD_MONITORING') && (
          <>
            <h3 className="sub-title">{ACTION_LABEL.RECORD_MONITORING}</h3>
            <MonitoringForm detail={detail} {...handlers} />
          </>
        )}
      </section>

      <section id="section-history" className="page-section" aria-labelledby="section-history-title">
        <h2 id="section-history-title" className="section-title">
          처리 이력
        </h2>
        <div className="krds-table-wrap mob-scroll">
          <table className="tbl col data history-table">
            <caption>처리 이력. 최근 처리부터 처리 시각, 담당, 수행 동작, 상태 변화, 변경 요약을 표시합니다.</caption>
            <thead>
              <tr>
                <th scope="col">처리 시각</th>
                <th scope="col">담당</th>
                <th scope="col">수행 동작</th>
                <th scope="col">상태 변화</th>
                <th scope="col">변경 요약</th>
              </tr>
            </thead>
            <tbody>
              {detail.events.map((event) => (
                <tr key={event.id}>
                  <td className="nowrap">{formatDateTime(event.recordedAt)}</td>
                  <td>
                    <span className="nowrap">{event.actorDisplayName}</span>
                    <br />
                    <span className="text-subtle">{ROLE_LABEL[event.actorRole]}</span>
                  </td>
                  <td>{ACTION_LABEL[event.action]}</td>
                  <td>
                    {event.fromStatus ? `${STATUS_LABEL[event.fromStatus]} → ` : ''}
                    {STATUS_LABEL[event.toStatus]}
                  </td>
                  <td>
                    {event.summary}
                    {/* 항목 동작(연계·제공 현황)은 어느 서비스의 기록인지 서비스명을 붙인다(D-02 처리 이력, DEV-03 5절). */}
                    {event.itemId && (
                      <>
                        <br />
                        <span className="text-subtle">
                          {orMissing(detail.plan?.items.find((item) => item.id === event.itemId)?.catalog.programName)}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </div>
  );
}

/**
 * KRDS 페이지 내 이동(in_page_navigation). 데스크톱에서는 오른쪽에 고정되고 모바일에서는 본문 위에 놓인다.
 * KRDS ui-script.js 대신 화면에 보이는 영역을 따라 현재 항목(active)을 표시한다.
 */
function InPageNavigation({ title }: { title: string }) {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="krds-in-page-navigation-area">
      <div className="in-page-navigation-header">
        <p className="quick-caption">이 페이지의 구성</p>
        <p className="quick-title">{title}</p>
      </div>
      <nav className="in-page-navigation-list" aria-label="신청 상세 구성">
        <ul>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={active === section.id ? 'active' : undefined}
                aria-current={active === section.id ? 'location' : undefined}
                onClick={() => setActive(section.id)}
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * 작업 32·33. 서버가 허용한 항목별 동작(연계 기록 → 제공 현황 기록)을 계획 순서로 보여 주고, 버튼을 누른 항목의 폼을 펼친다.
 * 닫거나 다른 항목을 열어도 저장 전 입력은 숨긴 채 유지하고(F-35), 409 재조회 뒤에도 입력을 남긴다(D-02:68).
 * 저장에 성공한 항목의 폼만 닫고 지운다.
 */
function ItemActions({ detail, handlers }: { detail: CaseDetail; handlers: SaveHandlers }) {
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [mountedIds, setMountedIds] = useState<string[]>([]);
  const items = detail.plan?.items ?? [];
  const rows = items
    .map((item, index) => ({ item, index, action: detail.allowedActions.find((allowed) => allowed.itemId === item.id)?.action }))
    .filter((row) => row.action === 'RECORD_LINKAGE' || row.action === 'RECORD_DELIVERY');
  if (rows.length === 0) return null;

  function toggle(itemId: string) {
    if (visibleId === itemId) {
      setVisibleId(null);
      return;
    }
    setVisibleId(itemId);
    setMountedIds((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]));
  }

  function itemHandlers(itemId: string): SaveHandlers {
    return {
      onSaved: (next, message) => {
        setVisibleId((id) => (id === itemId ? null : id));
        setMountedIds((ids) => ids.filter((id) => id !== itemId));
        handlers.onSaved(next, message);
      },
      onReload: handlers.onReload,
    };
  }

  return (
    <>
      <h3 className="sub-title">항목별 기록</h3>
      <ol className="plan-item-list">
        {rows.map(({ item, index, action }) => {
          const open = visibleId === item.id;
          const formId = `item-form-${item.id}`;
          const label =
            action === 'RECORD_LINKAGE' ? ACTION_LABEL.RECORD_LINKAGE : item.delivery ? '제공 현황 수정' : ACTION_LABEL.RECORD_DELIVERY;
          return (
            <li key={item.id}>
              <div className="plan-item-row">
                <div>
                  <p className="plan-item-title">
                    {index + 1}. {orMissing(item.catalog.programName)}
                  </p>
                  <p className="text-subtle">
                    {orMissing(item.catalog.providerName)} ·{' '}
                    {item.linkage ? LINKAGE_METHOD_LABEL[item.linkage.method] : '연계 전'} ·{' '}
                    {item.delivery ? DELIVERY_STATUS_LABEL[item.delivery.status] : '제공 현황 기록 전'}
                  </p>
                </div>
                <button
                  type="button"
                  className="krds-btn medium secondary"
                  aria-expanded={open}
                  aria-controls={formId}
                  onClick={() => toggle(item.id)}
                >
                  {/* 닫아 둔 폼에 저장 전 입력이 남아 있음을 알린다. */}
                  {open ? '닫기' : mountedIds.includes(item.id) ? `${label} (작성 중)` : label}
                  <span className="sr-only"> {orMissing(item.catalog.programName)}</span>
                </button>
              </div>
              {mountedIds.includes(item.id) && (
                <div id={formId} className="item-form" hidden={!open}>
                  {action === 'RECORD_LINKAGE' ? (
                    <LinkageForm detail={detail} item={item} {...itemHandlers(item.id)} />
                  ) : (
                    <DeliveryForm detail={detail} item={item} {...itemHandlers(item.id)} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * 모니터링 전, 계획 항목 중 연계·제공 현황이 빠진 서비스와 빠진 값을 보여 준다.
 * D-02:54 ‘누락된 항목은 서비스명과 빠진 값을 표시한다’ — 2026-11-13 김재현 해석(DEV-03 4절), 이동수 님 확인 요청 중.
 */
function MissingRecords({ detail }: { detail: CaseDetail }) {
  const rows = (detail.plan?.items ?? [])
    .map((item, index) => ({
      item,
      index,
      missing: [!item.linkage && '연계', !item.delivery && '제공 현황'].filter((value): value is string => !!value),
    }))
    .filter((row) => row.missing.length > 0);
  if (rows.length === 0) return null;

  return (
    <div className="missing-records">
      <h3 className="sub-title">아직 기록되지 않은 항목 ({rows.length}건)</h3>
      <ul className="missing-list">
        {rows.map(({ item, index, missing }) => (
          <li key={item.id}>
            {index + 1}. {orMissing(item.catalog.programName)} — <strong>{missing.join(', ')}</strong> 기록 전
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanView({ detail }: { detail: CaseDetail }) {
  const plan = detail.plan!;
  return (
    <>
      {/* 계획 요약: 수립일·목표와 확정·안내를 한 목록으로 묶고, 그 아래에 선택한 서비스를 둔다. */}
      <dl className="info-list info-table">
        <div>
          <dt>수립일</dt>
          <dd>{plan.preparedOn}</dd>
        </div>
        <div>
          <dt>지원 목표</dt>
          <dd>{plan.goal}</dd>
        </div>
        <div>
          <dt>회의 결과</dt>
          <dd>{plan.confirmation ? `${plan.confirmation.meetingOn} ${MEETING_OUTCOME_LABEL[plan.confirmation.outcome]}` : '확정 전'}</dd>
        </div>
        <div>
          <dt>안내일</dt>
          <dd>
            {plan.notice
              ? `${plan.notice.announcedOn} · ${detail.profile.noticeRecipientName} · ${NOTICE_METHOD_LABEL[detail.noticeMethod]}`
              : '안내 전'}
          </dd>
        </div>
      </dl>
      <h3 className="sub-title">선택한 서비스 ({plan.items.length}개)</h3>
      <ol className="plan-item-list">
        {plan.items.map((item) => (
          <li key={item.id}>
            <p className="plan-item-title">{orMissing(item.catalog.programName)}</p>
            <p>{orMissing(item.catalog.providerName)}</p>
            <p className="plan-item-meta">
              {orMissing(item.catalog.sourceName)} · {orMissing(item.catalog.referenceDate)} 기준 · <code>{item.catalog.id}</code>
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

function TrackingTable({ detail }: { detail: CaseDetail }) {
  return (
    <div className="krds-table-wrap mob-scroll">
      <table className="tbl col data">
        <caption>서비스별 연계와 제공 현황</caption>
        <thead>
          <tr>
            <th scope="col">프로그램</th>
            <th scope="col">출처</th>
            <th scope="col">연계</th>
            <th scope="col">제공 현황</th>
          </tr>
        </thead>
        <tbody>
          {detail.plan!.items.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {orMissing(item.catalog.programName)}
                <br />
                <span className="text-subtle">{orMissing(item.catalog.providerName)}</span>
              </th>
              <td>
                {orMissing(item.catalog.sourceName)}
                <br />
                <span className="text-subtle">{orMissing(item.catalog.referenceDate)} 기준</span>
              </td>
              <td>
                {item.linkage
                  ? `${item.linkage.linkedOn} ${LINKAGE_METHOD_LABEL[item.linkage.method]}${item.linkage.destinationLabel ? ` · ${item.linkage.destinationLabel}` : ''}`
                  : '연계 전'}
                {/* 대상자 안내는 제공기관을 후보로 표시한다(D-02:53, expected-results 7~9). */}
                {item.linkage?.method === 'PERSON_GUIDANCE' && (
                  <>
                    <br />
                    <span className="text-subtle">후보 제공기관 · {orMissing(item.catalog.providerName)}</span>
                  </>
                )}
              </td>
              <td>
                {item.delivery
                  ? `${DELIVERY_STATUS_LABEL[item.delivery.status]} · ${item.delivery.observedOn}${item.delivery.reason ? ` · ${item.delivery.reason}` : ''}`
                  : '기록 전'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonitoringView({ detail }: { detail: CaseDetail }) {
  const monitoring = detail.monitoring!;
  const items = detail.plan?.items ?? [];
  return (
    <>
      <dl className="info-list info-table">
        <div>
          <dt>기록일·방법</dt>
          <dd>
            {monitoring.monitoredOn} · {CONTACT_METHOD_LABEL[monitoring.method]}
          </dd>
        </div>
        <div>
          <dt>상태 변화</dt>
          <dd>{CONDITION_LABEL[monitoring.condition]}</dd>
        </div>
        <div>
          <dt>후속 검토</dt>
          <dd>
            {monitoring.reviewNeeded ? '후속 검토 필요' : '후속 검토 불필요'}
            {monitoring.reviewNeeded && monitoring.reviewReason && (
              <>
                <br />
                <span>후속 검토 사유: {monitoring.reviewReason}</span>
              </>
            )}
          </dd>
        </div>
      </dl>
      <ul className="plan-item-list">
        {monitoring.observations.map((observation) => {
          const item = items.find((planItem) => planItem.id === observation.itemId);
          return (
            <li key={observation.itemId}>
              <p className="plan-item-title">{orMissing(item?.catalog.programName)}</p>
              {item?.delivery && (
                <p>
                  기존 제공 현황 · {DELIVERY_STATUS_LABEL[item.delivery.status]}
                </p>
              )}
              <p>
                모니터링 확인 · {DELIVERY_STATUS_LABEL[observation.status]}
                {observation.reason ? ` · ${observation.reason}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
