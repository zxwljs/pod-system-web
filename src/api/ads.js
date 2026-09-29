const DEFAULT_CMS_URL = 'https://admin.ddddnet.cn';
const CACHE_KEY = 'pod_ads_cache_v1';
const FETCH_TIMEOUT_MS = 3000;

// 默认广告配置(与后端 DEFAULT_ADS 对齐)
// globalEnabled 默认 false:后台未配置或未开启时,顾客端不渲染任何广告位
export const DEFAULT_ADS = {
  globalEnabled: false,
  globalLabel: '广告',
  globalLabelEnabled: true,
  items: [],
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

export const readAdsCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') return { ...DEFAULT_ADS, ...data };
  } catch (e) {}
  return null;
};

const writeCache = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch (e) {}
};

export const fetchAds = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${getCmsBaseURL()}/api/ads`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const merged = { ...DEFAULT_ADS, ...data };
    writeCache(merged);
    return merged;
  } catch {
    return readAdsCache() || DEFAULT_ADS;
  } finally {
    clearTimeout(timer);
  }
};
