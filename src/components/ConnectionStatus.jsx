import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { getBackendURL } from '../api/axios';
import { lt } from 'semver';

// 版本清单由前端部署站点自身托管（同域 /version.json），不再依赖私有仓库的
// GitHub Releases API（私有仓库对未鉴权请求返回 404）。
const VERSION_MANIFEST = '/version.json';

function ConnectionStatus({ onNavigateToDownload }) {
  const [status, setStatus] = useState('checking');
  const [localVersion, setLocalVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const fetchLatestVersion = async () => {
    try {
      const response = await fetch(VERSION_MANIFEST, {
        headers: {
          'Accept': 'application/json'
        },
        cache: 'no-cache'
      });

      if (response.ok) {
        const data = await response.json();
        const version = String(data.version || '').replace(/^v/, '');
        if (version) setLatestVersion(version);
      }
    } catch {
    }
  };

  const checkConnection = async () => {
    setStatus('checking');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${getBackendURL()}/api/health`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        setLocalVersion(data.version);
        setStatus('connected');
        
        if (latestVersion && data.version) {
          setUpdateAvailable(lt(data.version, latestVersion));
        }
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  };

  const handleRefresh = () => {
    setLatestVersion(null);
    setUpdateAvailable(false);
    fetchLatestVersion();
    checkConnection();
  };

  useEffect(() => {
    fetchLatestVersion();
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (latestVersion && localVersion) {
      setUpdateAvailable(lt(localVersion, latestVersion));
    }
  }, [latestVersion, localVersion]);

  const getStatusStyle = () => {
    if (updateAvailable) {
      return 'bg-orange-100 text-orange-700 border-orange-200';
    }
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'disconnected':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const getStatusIcon = () => {
    if (updateAvailable) {
      return <ArrowUpCircle className="w-4 h-4 animate-pulse" />;
    }
    switch (status) {
      case 'connected':
        return <Wifi className="w-4 h-4" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4" />;
      default:
        return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
  };

  const getStatusText = () => {
    if (updateAvailable) {
      return `客户端版本 v${localVersion}，有新版本 v${latestVersion} 可用`;
    }
    switch (status) {
      case 'connected':
        return localVersion ? `已连接 v${localVersion}` : '已连接本地客户端';
      case 'disconnected':
        return '未连接本地客户端';
      default:
        return '检测中...';
    }
  };

  return (
    <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${getStatusStyle()}`}>
      {getStatusIcon()}
      <span className="text-sm font-medium">{getStatusText()}</span>
      {updateAvailable && (
        <button
          onClick={onNavigateToDownload}
          className="inline-flex items-center space-x-1 bg-orange-500 text-white px-2 py-1 rounded text-xs hover:bg-orange-600 transition-colors"
          title="查看新版本"
        >
          <ArrowUpCircle className="w-3 h-3" />
          <span>更新</span>
        </button>
      )}
      <button
        onClick={handleRefresh}
        className="hover:bg-white/20 p-1 rounded transition-colors"
        title="重新检测"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
}

export default ConnectionStatus;