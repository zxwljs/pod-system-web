import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, ArrowUpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getBackendURL } from '../api/axios';
import { lt } from 'semver';
import { useSoftwareVersion } from '../hooks/useSoftwareVersion';

// 版本来源已与 GitHub Actions 解耦：不再读前端站点自身的 /version.json
// （由 Actions 按 package.json 生成），改为统一走后台 software-versions 接口，
// 后台发布新版本即生效，无需重新部署前端。
function ConnectionStatus({ onNavigateToDownload }) {
  const [status, setStatus] = useState('checking');
  const [localVersion, setLocalVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const { server } = useSoftwareVersion();

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

        if (server?.version && data.version) {
          setUpdateAvailable(lt(data.version, server.version));
        }
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('disconnected');
    }
  };

  const handleRefresh = () => {
    setUpdateAvailable(false);
    setShowChangelog(false);
    checkConnection();
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (server?.version && localVersion) {
      setUpdateAvailable(lt(localVersion, server.version));
    }
  }, [server, localVersion]);

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
      return `客户端版本 v${localVersion}，有新版本 v${server.version} 可用`;
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
    <div>
      <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${getStatusStyle()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        {updateAvailable && (
          <>
            <button
              onClick={() => onNavigateToDownload()}
              className="inline-flex items-center space-x-1 bg-orange-500 text-white px-2 py-1 rounded text-xs hover:bg-orange-600 transition-colors"
              title="查看新版本"
            >
              <ArrowUpCircle className="w-3 h-3" />
              <span>更新</span>
            </button>
            {server?.notes && (
              <button
                onClick={() => setShowChangelog(!showChangelog)}
                className="inline-flex items-center space-x-0.5 text-orange-600 px-1.5 py-1 rounded text-xs hover:bg-orange-200 transition-colors"
                title={showChangelog ? '收起更新说明' : '查看更新说明'}
              >
                {showChangelog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>说明</span>
              </button>
            )}
          </>
        )}
        <button
          onClick={handleRefresh}
          className="hover:bg-white/20 p-1 rounded transition-colors"
          title="重新检测"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      {updateAvailable && showChangelog && server?.notes && (
        <div className="mt-1.5 mx-3 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-[11px] font-semibold text-orange-700 mb-1">v{server.version} 更新说明</p>
          <pre className="text-[11px] text-orange-800 whitespace-pre-wrap leading-relaxed font-sans">{server.notes}</pre>
        </div>
      )}
    </div>
  );
}

export default ConnectionStatus;
