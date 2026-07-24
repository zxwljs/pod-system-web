import { useState, useRef, useEffect } from 'react'
import { apiRequest, getBackendProtocolInfo } from '../api/axios'
import { FolderOpen, ArrowRight, Play, Eye, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Trash2, X, HardDrive, ChevronRight, ArrowUp } from 'lucide-react'

function FileRenameTool() {
  const [folderPath, setFolderPath] = useState('')
  const [selectedFolderName, setSelectedFolderName] = useState('')
  const [prefix, setPrefix] = useState('IT001')
  const [areaCount, setAreaCount] = useState(2)
  const [startGroupIndex, setStartGroupIndex] = useState(1)
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [executeResult, setExecuteResult] = useState(null)
  const [error, setError] = useState('')
  const [executing, setExecuting] = useState(false)
  const [executed, setExecuted] = useState(false)
  const fileInputRef = useRef(null)

  // 记住上次使用的路径
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pod_rename_folder_path')
      if (saved) setFolderPath(saved)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      if (folderPath) {
        localStorage.setItem('pod_rename_folder_path', folderPath)
      }
    } catch {}
  }, [folderPath])

  // ─── 目录浏览器 ───
  const [showBrowseModal, setShowBrowseModal] = useState(false)
  const [browsePath, setBrowsePath] = useState('')
  const [browseFolders, setBrowseFolders] = useState([])
  const [browseParent, setBrowseParent] = useState(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')

  const loadBrowsePath = async (p) => {
    setBrowseLoading(true)
    setBrowseError('')
    try {
      const data = await apiRequest('/browse-folder', {
        method: 'POST',
        data: { path: p || '' }
      })
      setBrowsePath(data.path || '')
      setBrowseFolders(data.folders || [])
      setBrowseParent(data.parent || null)
    } catch (err) {
      setBrowseError(err.message || '浏览目录失败')
    } finally {
      setBrowseLoading(false)
    }
  }

  const openBrowser = async () => {
    setError('')
    setBrowseError('')
    setShowBrowseModal(true)
    await loadBrowsePath('')
  }

  const handleBrowseSelect = () => {
    if (browsePath) {
      setFolderPath(browsePath)
    }
    setShowBrowseModal(false)
  }

  const handlePreview = async () => {
    setError('')
    setExecuteResult(null)
    setExecuted(false)

    if (!folderPath.trim()) {
      setError('请输入文件夹路径')
      return
    }
    if (!prefix.trim()) {
      setError('请输入命名前缀（如 IT001）')
      return
    }

    setLoading(true)
    try {
      const data = await apiRequest('/rename-batch', {
        method: 'POST',
        data: {
          folderPath: folderPath.trim(),
          prefix: prefix.trim(),
          areaCount: parseInt(areaCount),
          startGroupIndex: parseInt(startGroupIndex),
          mode: 'preview'
        }
      })
      setPreviewData(data)
    } catch (err) {
      setError(err.message || '预览失败')
      setPreviewData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!previewData || !previewData.pairs || previewData.pairs.length === 0) {
      setError('请先预览重命名计划')
      return
    }

    if (!confirm(`确定要重命名 ${previewData.pairs.length} 个文件吗？\n\n此操作会直接修改本地文件夹中的文件名，不可撤销！\n\n文件夹: ${previewData.folderPath}`)) {
      return
    }

    setError('')
    setExecuting(true)
    try {
      const data = await apiRequest('/rename-batch', {
        method: 'POST',
        data: {
          folderPath: folderPath.trim(),
          prefix: prefix.trim(),
          areaCount: parseInt(areaCount),
          startGroupIndex: parseInt(startGroupIndex),
          mode: 'execute'
        }
      })
      setExecuteResult(data)
      setExecuted(true)
    } catch (err) {
      setError(err.message || '执行失败')
    } finally {
      setExecuting(false)
    }
  }

  const handleReset = () => {
    setPreviewData(null)
    setExecuteResult(null)
    setError('')
    setExecuted(false)
  }

  const handleFileSelect = async () => {
    setError('')
    try {
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker()
        const protocolInfo = getBackendProtocolInfo()

        if (protocolInfo.isMixedContent && !protocolInfo.isLocalhost) {
          setError('当前页面为 HTTPS，但后端为 HTTP，浏览器无法传递文件夹路径。请使用文本输入框手动输入路径。')
          return
        }

        // 浏览器标准 API 不返回绝对路径，只能拿到文件夹名字
        setSelectedFolderName(dirHandle.name)
        setError(`已选择文件夹「${dirHandle.name}」。\n浏览器无法自动获取完整路径，请手动在输入框中输入完整路径（可从资源管理器地址栏复制）。`)
      } else {
        setSelectedFolderName('')
        setError('当前浏览器不支持目录选择器，请手动在输入框中输入文件夹路径。\n\n提示：在资源管理器中打开目标文件夹，复制地址栏中的路径粘贴到此处。')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('选择文件夹失败:', err)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">文件名整理</h2>
        <p className="text-gray-500 mt-1">
          按顺序将本地文件夹中的图片批量重命名为 "编号-区域号-序号" 格式，如 IT001-001-1.png
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">本地文件夹路径</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="例如: D:\图案\2026年7月9日前后幅MM7.8"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={openBrowser}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors flex items-center"
                  title="浏览本地目录"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                在资源管理器地址栏复制完整路径后粘贴到此处
              </p>
              {selectedFolderName && (
                <p className="text-xs text-blue-600 mt-1">
                  已选择文件夹「{selectedFolderName}」，请在上面补全完整路径
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">命名前缀</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="IT001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">起始组号</label>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={startGroupIndex}
                  onChange={(e) => setStartGroupIndex(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">区域数量</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={areaCount}
                  onChange={(e) => setAreaCount(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">命名格式预览</p>
              <p className="text-sm text-gray-700 font-mono">
                {prefix.trim() || 'IT001'}-{String(startGroupIndex).padStart(3, '0')}-1.png
              </p>
              <p className="text-xs text-gray-400 mt-1">
                每 {areaCount} 张图片编为一组，组号从 {startGroupIndex} 开始自动递增
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handlePreview}
                disabled={loading}
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                <Eye className="w-5 h-5" />
                <span>{loading ? '扫描中...' : '预览计划'}</span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center space-x-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                <span>重置</span>
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">使用说明</h3>
            <div className="bg-blue-50 rounded-lg p-4 space-y-3 text-sm text-blue-800">
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                <p>在资源管理器中打开目标文件夹，<strong>复制地址栏中的完整路径</strong>，粘贴到上方输入框</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                <p>设置命名前缀（如 IT001）、区域数量、起始组号</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                <p>点击<strong>"预览计划"</strong>查看重命名结果（不会实际修改文件）</p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="w-5 h-5 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">4</span>
                <p>确认无误后点击<strong>"执行重命名"</strong>，本地文件将被直接修改</p>
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">
                  <strong>注意：</strong>重命名会直接修改本地文件，不可撤销。建议先备份文件夹！
                </p>
              </div>
            </div>
          </div>
        </div>

        {previewData && !executed && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h3 className="font-semibold text-gray-900">重命名预览</h3>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {previewData.fileCount} 个文件
                </span>
              </div>
              <p className="text-xs text-gray-500">文件夹: {previewData.folderPath}</p>
            </div>

            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">原文件名</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600" style={{ width: '40px' }}></th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">新文件名</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewData.pairs.map((pair, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{index + 1}</td>
                      <td className="px-4 py-2 text-gray-600 font-mono text-xs">{pair.oldName}</td>
                      <td className="px-4 py-2 text-center">
                        <ArrowRight className="w-4 h-4 text-green-500 inline-block" />
                      </td>
                      <td className="px-4 py-2 text-blue-700 font-mono text-xs">{pair.newName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleExecute}
                disabled={executing}
                className="flex items-center space-x-2 px-6 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 shadow-md"
              >
                <Play className="w-5 h-5" />
                <span>{executing ? '执行中...' : '执行重命名'}</span>
              </button>
            </div>
          </div>
        )}

        {executeResult && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <div className="flex items-center space-x-3 mb-4">
              <h3 className="font-semibold text-gray-900">执行结果</h3>
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                {executeResult.success} 成功
              </span>
              {executeResult.failed > 0 && (
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                  {executeResult.failed} 失败
                </span>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">原文件名</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">新文件名</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {executeResult.results.map((r, index) => (
                    <tr key={index} className={r.ok ? 'hover:bg-gray-50' : 'bg-red-50'}>
                      <td className="px-4 py-2 text-gray-400">{index + 1}</td>
                      <td className="px-4 py-2 text-gray-600 font-mono text-xs">{r.oldName}</td>
                      <td className="px-4 py-2 text-blue-700 font-mono text-xs">{r.newName}</td>
                      <td className="px-4 py-2 text-center">
                        {r.ok ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 inline-block" />
                        ) : (
                          <div className="flex items-center justify-center space-x-1">
                            <XCircle className="w-5 h-5 text-red-500" />
                            <span className="text-xs text-red-600">{r.error}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 目录浏览弹窗 */}
      {showBrowseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowBrowseModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">选择文件夹</h3>
              <button onClick={() => setShowBrowseModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-mono truncate flex-1">
                  {browsePath || '我的电脑'}
                </span>
                {browseParent !== null && (
                  <button
                    onClick={() => loadBrowsePath(browseParent)}
                    className="p-1 hover:bg-gray-100 rounded flex-shrink-0"
                    title="返回上级"
                  >
                    <ArrowUp className="w-4 h-4 text-gray-500" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {browseLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
              ) : browseError ? (
                <div className="text-center py-8 px-4">
                  <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-red-600 whitespace-pre-wrap">{browseError}</p>
                  <button
                    onClick={() => loadBrowsePath(browsePath)}
                    className="mt-3 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                  >
                    重试
                  </button>
                </div>
              ) : browseFolders.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">此目录下没有子文件夹</div>
              ) : (
                <div className="space-y-1">
                  {browseFolders.map(folder => (
                    <button
                      key={folder}
                      onClick={() => loadBrowsePath(browsePath ? pathJoin(browsePath, folder) : folder)}
                      className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-blue-50 text-left transition-colors"
                    >
                      {browsePath ? (
                        <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      ) : (
                        <HardDrive className="w-5 h-5 text-gray-500 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-700 truncate">{folder}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleBrowseSelect}
                disabled={!browsePath}
                className="w-full px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                选择此文件夹
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 浏览器端路径拼接 (用 / 即可，后端会 resolve)
function pathJoin(a, b) {
  if (a.endsWith('\\') || a.endsWith('/')) return a + b
  return a + '\\' + b
}

export default FileRenameTool
