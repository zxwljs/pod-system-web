import { useState, useEffect } from 'react';

// 版本清单由前端部署站点自身托管（同域 /version.json），不再依赖私有仓库的
// GitHub Releases API（私有仓库对未鉴权请求返回 404）。该文件由
// .github/workflows/publish-frontend.yml 在同步时根据 backend/package.json 自动生成。
const VERSION_MANIFEST = '/version.json';

export function useLatestVersion() {
  const [latestVersion, setLatestVersion] = useState(null);
  const [latestRelease, setLatestRelease] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchLatestVersion = async () => {
    try {
      const cachedVersion = localStorage.getItem('pod_latest_version');
      const cachedRelease = localStorage.getItem('pod_latest_release');
      const cachedTime = localStorage.getItem('pod_version_cache_time');
      
      if (cachedVersion && cachedRelease && cachedTime) {
        const cacheAge = Date.now() - parseInt(cachedTime);
        if (cacheAge < 3600000) {
          setLatestVersion(cachedVersion);
          setLatestRelease(JSON.parse(cachedRelease));
          setLoading(false);
          return;
        }
      }

      const response = await fetch(VERSION_MANIFEST, {
        headers: {
          'Accept': 'application/json'
        },
        cache: 'no-cache'
      });

      if (response.ok) {
        const data = await response.json();
        const version = String(data.version || '').replace(/^v/, '');
        if (!version) return;

        // 兼容 App.jsx 对 GitHub Release 对象字段（published_at / body）的使用
        const release = {
          tag_name: 'v' + version,
          published_at: data.publishedAt || null,
          body: data.notes || ''
        };

        setLatestVersion(version);
        setLatestRelease(release);

        localStorage.setItem('pod_latest_version', version);
        localStorage.setItem('pod_latest_release', JSON.stringify(release));
        localStorage.setItem('pod_version_cache_time', Date.now().toString());
      }
    } catch {
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLatestVersion();
    const interval = setInterval(fetchLatestVersion, 3600000);
    return () => clearInterval(interval);
  }, []);

  return { latestVersion, latestRelease, loading };
}