export type LoginAudience = 'applicant' | 'staff';

export function isApplicantPath(path: string) {
  return path === '/apply/new' || path === '/my/applications' || path.startsWith('/my/applications/');
}

export function isStaffPath(path: string) {
  return path === '/cases' || path.startsWith('/cases/') || path === '/catalog'
    || path === '/intake' || path.startsWith('/intake/');
}

export function loginAudienceFor(path: string): LoginAudience | null {
  if (path === '/login/applicant') return 'applicant';
  if (path === '/login/staff' || path === '/login') return 'staff';
  return null;
}

export function loginPathFor(path: string) {
  const audience = isApplicantPath(path) ? 'applicant' : 'staff';
  return '/login/' + audience + '?next=' + encodeURIComponent(path);
}

export function loginDestination(audience: LoginAudience) {
  const next = new URLSearchParams(window.location.search).get('next') ?? '';
  if (audience === 'applicant') return isApplicantPath(next) ? next : '/apply/new';
  return isStaffPath(next) ? next : '/cases';
}
