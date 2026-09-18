// 套餐（时长套餐）：公开只读，未登录也能拉取，供落地页展示
// 数据源：cms-worker GET /api/plans（存 cms/plans.json，后台「套餐管理」维护）

const DEFAULT_CMS_URL = 'https://admin.ddddnet.cn';
const CACHE_KEY = 'pod_plans_cache_v1';
const FETCH_TIMEOUT_MS = 3000;

export const DEFAULT_PLANS = {
  enabled: true,
  currency: '¥',
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

export const readPlansCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') return { ...DEFAULT_PLANS, ...data };
  } catch (e) {}
  return null;
};

const writeCache = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch (e) {}
};

export const fetchPlans = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${getCmsBaseURL()}/api/plans`, { method: 'GET', signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const merged = { ...DEFAULT_PLANS, ...data, items: Array.isArray(data.items) ? data.items : [] };
    writeCache(merged);
    return merged;
  } catch {
    return readPlansCache() || DEFAULT_PLANS;
  } finally {
    clearTimeout(timer);
  }
};

// 时长文案：90 天 →「3 个月」，365 天 →「12 个月」，不足月按天显示
export const formatDuration = (days) => {
  const d = Number(days) || 0;
  if (d % 365 === 0) return `${d / 365} 年`;
  if (d % 30 === 0) return `${d / 30} 个月`;
  return `${d} 天`;
};
