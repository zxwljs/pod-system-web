import { useState, useEffect, useCallback } from 'react';
import { apiRequest, apiCancelDxmTask, getBaseURL } from '../api/axios';
import { Clock, CheckCircle, XCircle, Loader, Trash2, RefreshCw, FolderOpen, X, Download, Ban } from 'lucide-react';

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 z-50 animate-slide-in`}>
      <CheckCircle className="w-5 h-5" />
      <span className="font-medium">{message}</span>
      <button onClick={onClose} className="hover:bg-white/20 rounded p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

function TaskProgress() {
  const [tasks, setTasks] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 2000);
    return () => clearInterval(interval);
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const loadTasks = async () => {
    try {
      const data = await apiRequest('/tasks');
      setTasks(data);
    } catch (error) {
      console.error('加载任务失败:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTasks();
    setIsRefreshing(false);
    showToast('刷新完成', 'success');
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('确定要删除这个任务记录吗？')) return;
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
    }
  };

  // 取消进行中的店小秘导出任务：中断在途上传、释放上传通道
  const handleCancelDxm = async (taskId) => {
    if (!confirm('确定要取消这个店小秘导出任务吗？将中断正在进行的图片上传。')) return;
    try {
      await apiCancelDxmTask(taskId);
      showToast('已取消导出', 'info');
      loadTasks();
    } catch (error) {
      showToast('取消失败: ' + error.message, 'error');
    }
  };

  // 下载已完成的店小秘导出文件（后端按任务缓存文件，过期前有效）
  const handleDownloadDxm = (taskId) => {
    const url = `${getBaseURL()}/dxm/tasks/${taskId}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'cancelled':
        return <Ban className="w-5 h-5 text-orange-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'processing':
        return '处理中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      case 'cancelled':
        return '已取消';
      default:
        return '未知';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">任务进度</h2>
          <p className="text-gray-500 mt-1">查看套图 / 侵权检测 / 店小秘导出等任务的实时状态</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {tasks.length > 0 ? (
        <div className="space-y-4">
          {tasks.map(task => {
            const isDxm = task.type === 'dxm-export';
            const isExcelMerge = task.type === 'excel-merge';
            const typeLabel = isDxm ? '店小秘导出' : task.type === 'copyright-check' ? '侵权检测' : isExcelMerge ? 'Excel 合并' : '批量套图';
            const typeBadgeColor = isDxm ? 'bg-purple-100 text-purple-700' : task.type === 'copyright-check' ? 'bg-amber-100 text-amber-700' : isExcelMerge ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700';
            const iconBg = task.status === 'processing' ? 'bg-blue-100'
              : task.status === 'completed' ? 'bg-green-100'
              : task.status === 'cancelled' ? 'bg-orange-100' : 'bg-red-100';
            return (
            <div
              key={task.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
                      {getStatusIcon(task.status)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-gray-900">{task.folderName}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColor}`}>{typeLabel}</span>
                      </div>
                      <p className="text-sm text-gray-500">任务ID: {task.id.slice(0, 8)}...</p>
                      <p className="text-xs text-gray-400 mt-1">创建时间: {formatTime(task.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                    {isDxm && task.status === 'processing' ? (
                      <button
                        onClick={() => handleCancelDxm(task.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-orange-50 text-orange-600 text-sm rounded-lg hover:bg-orange-100 transition-colors"
                        title="取消导出"
                      >
                        <Ban className="w-4 h-4" />
                        <span>取消</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>

                {task.status === 'processing' && (
                  <div className="space-y-2">
                    {isDxm ? (
                      <>
                        {/* 店小秘导出：不确定动画进度条（所有阶段均展示） */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 font-medium">{task.stepText || '进行中'}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-3 rounded-full bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500"
                            style={{
                              width: '40%',
                              animation: 'dxm-indeterminate 1.5s ease-in-out infinite'
                            }}
                          />
                        </div>
                        {task.lastLog && (
                          <p className="text-xs text-gray-500 truncate pt-0.5" title={task.lastLog}>{task.lastLog}</p>
                        )}
                        <style>{`
                          @keyframes dxm-indeterminate {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(350%); }
                          }
                        `}</style>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">进度</span>
                          <span className="font-medium text-gray-900">
                            {`${task.completed} / ${task.total} (${task.progress}%)`}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {task.status === 'completed' && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      {isDxm ? (
                        <>
                          <span className="text-gray-500">导出完成: </span>
                          <span className="font-medium text-green-600">{task.fileName || '上架表格'}</span>
                        </>
                      ) : task.type === 'copyright-check' ? (
                        <>
                          <span className="text-gray-500">检测完成: </span>
                          <span className="font-medium text-green-600">{task.results.length} 张图片</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-500">生成结果: </span>
                          <span className="font-medium text-green-600">{task.results.length} 张套图</span>
                        </>
                      )}
                    </div>
                    {isDxm ? (
                      task.hasFile ? (
                        <button
                          onClick={() => handleDownloadDxm(task.id)}
                          className="flex items-center space-x-1 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          <span>下载表格</span>
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">文件已过期</span>
                      )
                    ) : (
                      <button
                        onClick={() => window.location.href = task.type === 'copyright-check' ? '/#patterns' : '/#results'}
                        className="flex items-center space-x-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span>查看{task.type === 'copyright-check' ? '详情' : '结果'}</span>
                      </button>
                    )}
                  </div>
                )}

                {task.status === 'cancelled' && (
                  <div className="flex items-center space-x-2 text-sm text-orange-600">
                    <Ban className="w-4 h-4" />
                    <span>任务已取消{task.lastLog ? `（${task.lastLog}）` : ''}</span>
                  </div>
                )}

                {task.status === 'failed' && (
                  <div className="text-sm text-red-600">
                    <span className="font-medium">错误信息:</span> {task.error}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">暂无任务</h3>
          <p className="text-gray-500 mt-2">在"图案库"中点击"批量套图"/"侵权检测"，或在结果页导出"店小秘上架表格"后，会在这里显示进度</p>
        </div>
      )}
    </div>
  );
}

export default TaskProgress;