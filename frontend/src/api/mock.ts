// 백엔드 API가 준비되기 전, 화면을 눌러 보기 위한 가벼운 목업.
// 데이터는 모두 가짜이고, 입력 검증·권한·버전 충돌 같은 규칙은 실제 서버(D-04·D-05)가 맡는다.
// 응답 모양만 D-04와 같게 맞춘다. 사례는 이 브라우저 localStorage에만 저장한다.

import { MOCK_PASSWORD } from './mockFlag';
import type { Account, AllowedAction, CaseDetail, CaseStatus, CatalogItem, DemoProfile } from './types';

const ACCOUNTS: Account[] = [
  { id: 'demo-town-a', displayName: '목업 읍면동 담당자', role: 'TOWN', districtCode: 'DEMO-A', townCode: 'DEMO-A-1' },
  { id: 'demo-district-a', displayName: '목업 시군구 담당자', role: 'DISTRICT', districtCode: 'DEMO-A', townCode: null },
];

const PROFILES: DemoProfile[] = [
  {
    code: 'MOCK-PROFILE-01',
    beneficiaryName: '목업 대상자',
    applicantName: '목업 신청인',
    noticeRecipientName: '목업 신청인',
    region: { districtCode: 'DEMO-A', townCode: 'DEMO-A-1', sido: '목업시', sigungu: '목업구' },
  },
];

function catalogRow(n: number, programName: string, providerName: string, categoryLarge: string): CatalogItem {
  return {
    id: `mock-service-${n}`,
    datasetVersion: 'mock',
    programName,
    providerName,
    providerAddress: n === 3 ? null : `목업시 목업구 목업로 ${n}`,
    providerPhone: n === 3 ? null : `000-0000-000${n}`,
    categoryLarge,
    categoryMiddle: '목업 중분류',
    sido: '목업시',
    sigungu: '목업구',
    sigunguGu: null,
    sourceName: '목업 자료',
    sourceUrl: null,
    referenceDate: '2026-01-01',
  };
}

const CATALOG: CatalogItem[] = [
  catalogRow(1, '목업 방문 건강관리', '목업 기관 가', '건강관리예방'),
  catalogRow(2, '목업 방문 진료', '목업 기관 나', '보건의료'),
  catalogRow(3, '목업 식사 지원', '목업 기관 다', '일상생활돌봄'),
  catalogRow(4, '목업 주거 개선', '목업 기관 라', '주거복지'),
  catalogRow(5, '목업 방문 요양', '목업 기관 마', '장기요양'),
  catalogRow(6, '목업 기타 지원', '목업 기관 바', '기타'),
];

const SESSION_KEY = 'dolbomeum.mock.session';
const CASES_KEY = 'dolbomeum.mock.cases';

function load<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없으면 새로고침 시 목업 상태가 사라진다.
  }
}

/** 목업 사례를 모두 지운다. */
export function resetMockData() {
  save(window.localStorage, CASES_KEY, []);
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fail(status: number, code: string, message: string, field: string | null = null) {
  return json(status, { error: { code, message, field } });
}

function body(init?: RequestInit): Record<string, any> {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : {};
}

/** 화면 버튼을 눌러 볼 수 있을 만큼만 D-05 흐름을 흉내 낸다. */
function allowedActions(account: Account, detail: CaseDetail): AllowedAction[] {
  const town = account.role === 'TOWN';
  const next: Partial<Record<CaseStatus, AllowedAction['action']>> = town
    ? { RECEIVED: 'RECORD_SCREENING', ASSESSED: 'SAVE_DRAFT', PLAN_DRAFTED: 'SAVE_DRAFT' }
    : { SCREENED: 'RECORD_ASSESSMENT' }; // 확정(30번) 이후는 목업이 흉내 내지 않는다. 실제 API로 확인한다.
  const action = next[detail.status];
  return action ? [{ action, itemId: null }] : [];
}

function update(account: Account, detail: CaseDetail, changes: Partial<CaseDetail>, action: AllowedAction['action']) {
  const cases = load<CaseDetail[]>(window.localStorage, CASES_KEY, []);
  const version = detail.version + 1;
  const next: CaseDetail = {
    ...detail,
    ...changes,
    version,
    events: [
      {
        id: `event-${Date.now()}`,
        action,
        fromStatus: detail.status,
        toStatus: changes.status ?? detail.status,
        actorDisplayName: account.displayName,
        actorRole: account.role,
        recordedAt: new Date().toISOString(),
        version,
        itemId: null,
        summary: '목업 기록',
      },
      ...detail.events,
    ],
  };
  save(window.localStorage, CASES_KEY, cases.map((item) => (item.id === detail.id ? next : item)));
  return json(200, { ...next, allowedActions: allowedActions(account, next) });
}

function route(path: string, init?: RequestInit): Response {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  const method = (init?.method ?? 'GET').toUpperCase();

  if (pathname === '/session' && method === 'POST') {
    const { username, password, audience } = body(init);
    if (audience === 'applicant') {
      return fail(403, 'FORBIDDEN', '신청자 제출은 실제 API 모드에서 시연해 주세요.');
    }
    const account = ACCOUNTS.find((item) => item.id === username);
    if (!account || password !== MOCK_PASSWORD) {
      return fail(401, 'UNAUTHENTICATED', '계정명 또는 비밀번호가 올바르지 않습니다.');
    }
    save(window.sessionStorage, SESSION_KEY, account.id);
    return json(200, account);
  }
  if (pathname === '/session' && method === 'DELETE') {
    window.sessionStorage.removeItem(SESSION_KEY);
    return new Response(null, { status: 204 });
  }

  const account = ACCOUNTS.find((item) => item.id === load(window.sessionStorage, SESSION_KEY, ''));
  if (!account) {
    return fail(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  }
  const cases = load<CaseDetail[]>(window.localStorage, CASES_KEY, []);
  const caseId = pathname.match(/^\/cases\/([^/]+)/)?.[1];
  const detail = cases.find((item) => item.id === caseId);

  if (pathname === '/session') return json(200, account);
  if (pathname === '/demo-profiles') return json(200, { items: PROFILES });

  if (pathname === '/cases' && method === 'GET') {
    const status = params.get('status');
    const filtered = cases.filter((item) => !status || item.status === status);
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.max(1, Number(params.get('pageSize')) || 20);
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    return json(200, { items, page, pageSize, total: filtered.length });
  }
  if (pathname === '/cases' && method === 'POST') {
    const input = body(init);
    const profile = PROFILES.find((item) => item.code === input.profileCode) ?? PROFILES[0];
    const created: CaseDetail = {
      id: `mock-case-${Date.now()}`,
      receiptNumber: `MOCK-${String(cases.length + 1).padStart(4, '0')}`,
      beneficiaryName: profile.beneficiaryName,
      receivedOn: input.receivedOn,
      status: 'RECEIVED',
      version: 1,
      region: profile.region,
      profile,
      noticeMethod: input.noticeMethod,
      evidenceChecked: input.evidenceChecked,
      screening: null,
      assessment: null,
      plan: null,
      monitoring: null,
      monitorings: [],
      events: [],
      allowedActions: [],
    };
    save(window.localStorage, CASES_KEY, [created, ...cases]);
    return json(201, { ...created, allowedActions: allowedActions(account, created) });
  }

  if (caseId && !detail) return fail(404, 'NOT_FOUND', '찾을 수 없습니다.');
  if (detail && method === 'GET') return json(200, { ...detail, allowedActions: allowedActions(account, detail) });
  if (detail && pathname.endsWith('/screening')) {
    const { screenedOn, method: way, outcome } = body(init);
    return update(account, detail, { status: 'SCREENED', screening: { screenedOn, method: way, outcome } }, 'RECORD_SCREENING');
  }
  if (detail && pathname.endsWith('/assessment')) {
    const { assessedOn, resultReceivedOn, outcome, route, reason } = body(init);
    return update(account, detail, {
      status: outcome === 'NOT_ELIGIBLE' ? 'NOT_ELIGIBLE' : 'ASSESSED',
      assessment: { assessedOn, resultReceivedOn, outcome, route: route ?? 'NHIS', reason: reason ?? null },
    }, 'RECORD_ASSESSMENT');
  }
  if (detail && pathname.endsWith('/plan')) {
    const { preparedOn, goal, serviceIds } = body(init);
    const items = (serviceIds as string[]).map((id, index) => ({
      id: `item-${index + 1}`,
      catalog: CATALOG.find((row) => row.id === id)!,
      linkage: null,
      delivery: null,
    }));
    return update(account, detail, { status: 'PLAN_DRAFTED', plan: { preparedOn, goal, items, confirmation: null, notice: null } }, 'SAVE_DRAFT');
  }

  if (pathname === '/catalog/nhis-filters') {
    return json(200, {
      sidos: ['목업시'],
      sigungus: params.get('sido') ? ['목업구'] : [],
      categoriesLarge: [...new Set(CATALOG.map((row) => row.categoryLarge!))],
    });
  }
  if (pathname === '/catalog/nhis-services') {
    const q = params.get('q') ?? '';
    const category = params.get('categoryLarge');
    const items = CATALOG.filter(
      (row) => (!category || row.categoryLarge === category) && (!q || row.programName!.includes(q) || row.providerName!.includes(q)),
    );
    const page = Number(params.get('page') ?? '1');
    const pageSize = Number(params.get('pageSize') ?? '20');
    return json(200, { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length });
  }

  return fail(501, 'MOCK_NOT_IMPLEMENTED', `목업에 아직 없는 API입니다: ${method} ${pathname}`);
}

export async function mockFetch(path: string, init?: RequestInit): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return route(path, init);
}
