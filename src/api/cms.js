// ─── 云端 CMS（工具箱内容）只读客户端 ───
// 工具箱外链项由 admin.ddddnet.cn（pod-cms Worker）云端托管，与本地 EXE 后端解耦。
// 顾客前端只读 GET /api/toolbox；失败/超时则由调用方降级为内置兜底列表。

const DEFAULT_CMS_URL = 'https://admin.ddddnet.cn';
const CACHE_KEY = 'pod_toolbox_cache_v1';
const FETCH_TIMEOUT_MS = 3000;

// CMS 域可被 ?cms= 或 localStorage 覆盖（本地联调连本地 worker 用）
export const getCmsBaseURL = () => {
  try {
    const q = new URLSearchParams(window.location.search).get('cms');
    if (q) return q.replace(/\/$/, '');
    const ls = localStorage.getItem('pod_cms_url');
    if (ls) return ls.replace(/\/$/, '');
  } catch (e) {}
  return DEFAULT_CMS_URL;
};

// 读本地缓存（stale-while-revalidate：先渲染上次结果，再后台刷新）
export const readToolboxCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.items)) return data.items;
  } catch (e) {}
  return null;
};

const writeToolboxCache = (items) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, cachedAt: Date.now() }));
  } catch (e) {}
};

// 拉取云端工具项；带超时；失败抛错由调用方兜底
export const fetchToolbox = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${getCmsBaseURL()}/api/toolbox`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];
    writeToolboxCache(items);
    return items;
  } finally {
    clearTimeout(timer);
  }
};
