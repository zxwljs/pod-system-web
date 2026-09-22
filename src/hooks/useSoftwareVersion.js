import { useCallback, useEffect, useRef, useState } from 'react';

// 软件版本库公开接口（后台 cms-worker 提供）。顾客 Web 端从 admin 域名拉取，
// 走 CORS 白名单（ddddnet.cn / admin.ddddnet.cn）。
//
// dev 模式默认跳过：避免污染 Console ERR_FAILED 噪声、抢占真正的错误信号。
// 如需本地联调（例如调试下载页），可用 ?cms=https://admin.ddddnet.cn
// 或 localStorage.setItem('pod_cms_url', 'https://admin.ddddnet.cn') 显式指定。
const PROD_ENDPOINT = 'https://admin.ddddnet.cn/api/software-versions';

const resolveEndpoint = () => {
  let override = '';
  try {
    override = new URLSearchParams(window.location.search).get('cms')
      || localStorage.getItem('pod_cms_url')
      || '';
  } catch (e) { /* 非浏览器环境忽略 */ }
  if (override) return `${override.replace(/\/$/, '')}${new URL(PROD_ENDPOINT).pathname}`;
  if (import.meta.env?.DEV) return '';
  return PROD_ENDPOINT;
};

// 返回 { server, gui, loading, error, fetchedAt, reload }：
//   server = 后端服务最新版（GUI 客户端会自动更新）
//   gui    = 客户端安装包最新版（重大更新，需手动替换）
// reload() = 立即重新拉取（下载页「获取失败，重试」用）
export function useSoftwareVersion() {
  const [server, setServer] = useState(null);
  const [gui, setGui] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const endpoint = resolveEndpoint();
    // dev 模式短路（未显式指定 cms 地址）
    if (!endpoint) { setLoading(false); return null; }
    try {
      const r = await fetch(endpoint, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!aliveRef.current) return null;
      setServer(data.server || null);
      setGui(data.gui || null);
      setError(null);
      setFetchedAt(Date.now());
      return data;
    } catch (e) {
      // 拉取失败不影响页面其他功能，但要让调用方能区分「无版本」与「拉不到」
      if (aliveRef.current) setError(e?.message || 'fetch_failed');
      return null;
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, [load]);

  const reload = useCallback(async () => {
    setLoading(true);
    return load();
  }, [load]);

  return { server, gui, loading, error, fetchedAt, reload };
}
