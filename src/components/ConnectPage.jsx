import { useState, useEffect } from 'react';
import { setBackendURL } from '../api/axios';
import { Loader2, CheckCircle, XCircle, Download, Server } from 'lucide-react';

const ConnectPage = () => {
  const [status, setStatus] = useState('checking');
  const [customPort, setCustomPort] = useState('3001');
  const [useCustomPort, setUseCustomPort] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      const port = useCustomPort ? customPort : '3001';
      const url = `http://localhost:${port}/api/health`;
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(url, {
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          setStatus('connected');
          setBackendURL(`http://localhost:${port}/api`);
          setTimeout(() => {
            window.location.hash = '#templates';
          }, 1500);
        } else {
          setStatus('disconnected');
        }
      } catch {
        setStatus('disconnected');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [useCustomPort, customPort]);

  const handleManualConnect = () => {
    setStatus('checking');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Server className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">叮当跨境ERP</h1>
          <p className="text-gray-500">正在检测本地服务连接...</p>
        </div>

        <div className="flex justify-center mb-8">
          {status === 'checking' && (
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="mt-3 text-gray-600">正在连接本地服务...</p>
            </div>
          )}
          
          {status === 'connected' && (
            <div className="flex flex-col items-center">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <p className="mt-3 text-xl font-semibold text-green-600">连接成功！</p>
              <p className="text-gray-500 mt-1">正在进入系统...</p>
            </div>
          )}
          
          {status === 'disconnected' && (
            <div className="flex flex-col items-center">
              <XCircle className="w-16 h-16 text-red-500" />
              <p className="mt-3 text-xl font-semibold text-red-600">未检测到本地服务</p>
              <p className="text-gray-500 mt-1">请下载并启动后端程序</p>
            </div>
          )}
        </div>

        {status === 'disconnected' && (
          <div className="space-y-4">
            <a
              href="https://gcn2ovxcjfar.feishu.cn/docx/F17dd1eLeoDyKpxHZxHcARf3n2b?from=from_copylink"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-xl font-medium transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>下载后端程序</span>
            </a>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="custom-port"
                  checked={useCustomPort}
                  onChange={(e) => setUseCustomPort(e.target.checked)}
                  className="w-4 h-4 text-blue-500 rounded"
                />
                <label htmlFor="custom-port" className="text-sm text-gray-600">使用自定义端口</label>
              </div>
              
              {useCustomPort && (
                <div className="flex space-x-2">
                  <span className="text-gray-500">http://localhost:</span>
                  <input
                    type="text"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-center"
                  />
                </div>
              )}
              
              <button
                onClick={handleManualConnect}
                className="w-full mt-3 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-xl font-medium transition-colors"
              >
                重新检测连接
              </button>
            </div>

            <div className="bg-blue-50 rounded-xl p-4">
              <h3 className="font-medium text-blue-800 mb-2">启动指南</h3>
              <ul className="text-sm text-blue-600 space-y-1">
                <li>1. 下载后端程序并解压</li>
                <li>2. 双击运行 exe 文件</li>
                <li>3. 等待命令行窗口显示服务启动</li>
                <li>4. 刷新页面或等待自动连接</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectPage;