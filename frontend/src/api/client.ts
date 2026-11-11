const API_BASE_PATH = '/api/v1';

export function apiFetch(path: `/${string}`, options?: RequestInit) {
  return fetch(`${API_BASE_PATH}${path}`, options);
}
