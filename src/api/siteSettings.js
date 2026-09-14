const DEFAULT_CMS_URL = 'https://admin.ddddnet.cn';
const CACHE_KEY = 'pod_site_settings_cache_v1';
const FETCH_TIMEOUT_MS = 3000;

export const DEFAULT_SITE_SETTINGS = {
  contactEmail: 'xuan@ddddnet.cn',
  wechatId: 'Zenooon',
  wechatGroupQrUrl: '',
  wechatGroupQrTitle: '扫码进群',
  wechatGroupQrSubtitle: '加入微信交流群',
  icpNumber: '',
};

const getCmsBaseURL = () => {
  try {
    const q = new URLSearchParams(window.location.search).get('cms');
    if (q) return q.replace(/\/$/, '');
    const ls = localStorage.getItem('pod_cms_url');
    if (ls) return ls.replace(/\/$/, '');
  } catch (e) {}
  return DEFAULT_CMS_URL;
};

export const readSiteSettingsCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') return { ...DEFAULT_SITE_SETTINGS, ...data };
  } catch (e) {}
  return null;
};

const writeCache = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch (e) {}
};

export const fetchSiteSettings = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${getCmsBaseURL()}/api/site-settings`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const merged = { ...DEFAULT_SITE_SETTINGS, ...data };
    writeCache(merged);
    return merged;
  } catch {
    return readSiteSettingsCache() || DEFAULT_SITE_SETTINGS;
  } finally {
    clearTimeout(timer);
  }
};
