import { useState, useEffect } from 'react';

// 软件版本库公开接口（后台 cms-worker 提供）。顾客 Web 端从 admin 域名拉取，
// 走 CORS 白名单（ddddnet.cn / admin.ddddnet.cn）。
// dev 模式（localhost）跳过：避免污染 Console ERR_FAILED 噪声、抢占真正的错误信号
const ENDPOINT = import.meta.env?.DEV
  ? ''
  : 'https://admin.ddddnet.cn/api/software-versions';

// 返回 { server, gui, loading }：
//   server = 后端服务最新版（GUI 客户端会自动更新）
//   gui    = 客户端安装包最新版（重大更新，需手动替换）
export function useSoftwareVersion() {
  const [server, setServer] = useState(null);
  const [gui, setGui] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      // dev 模式短路（ENDPOINT 为空串）
      if (!ENDPOINT) { setLoading(false); return; }
      try {
        const r = await fetch(ENDPOINT, { cache: 'no-cache' });
        if (!r.ok) return;
        const data = await r.json();
        if (!alive) return;
        setServer(data.server || null);
        setGui(data.gui || null);
      } catch {
        /* 拉取失败不影响页面其他功能 */
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return { server, gui, loading };
}
