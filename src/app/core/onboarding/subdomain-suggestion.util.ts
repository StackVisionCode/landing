const MAX_SUBDOMAIN_LENGTH = 63;

export function suggestSubdomainFromOfficeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_SUBDOMAIN_LENGTH)
    .replace(/-+$/g, '');
}
