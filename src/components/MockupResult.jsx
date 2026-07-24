import { useState, useEffect, useRef, useReducer, useCallback } from 'react'
import { apiRequest, getImageUrl, getBackendURL, getBaseURL, apiGetSaveConfig,
  apiGetPublishTemplates, apiPublishFolder, apiRetryPublish, apiGetPublishResults, apiGenerateTitle, apiUpdateTitle, apiGetTitlePrompts,
  apiGetDxmTemplates, apiExportDxm, apiGetDxmTasks, apiCancelDxmTask, apiGenerateTitlesBatch, apiCancelTitleGen } from '../api/axios'
import { FolderOpen, Download, RefreshCw, ImageIcon, Eye, Trash2, X, Loader2, CheckCircle, AlertCircle, FolderOutput, Settings as SettingsIcon, Sparkles, Send, Edit3, RotateCcw } from 'lucide-react'
const LazyImage = ({ src, alt, className, onLoad }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={imgRef} className={className}>
      {!isLoaded && (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          onLoad={() => {
            setIsLoaded(true)
            onLoad?.()
          }}
          style={{ display: isLoaded ? 'block' : 'none' }}
        />
      )}
    </div>
  )
}

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  const Icon = type === 'success' ? CheckCircle : type === 'error' ? AlertCircle : Loader2

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 z-50 animate-pulse`}>
      <Icon className="w-5 h-5" />
      <span className="font-medium">{message}</span>
      <button onClick={onClose} className="hover:bg-white/20 rounded p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

const initialDownloadState = {
  isDownloading: false,
  status: '',
  progress: 0,
  currentPage: 1,
  totalPages: 1,
  pageSize: 50,
  isDownloadingAllPages: false
}

// ─── "保存到本地" 状态机 ───
// status: '' | 'preparing' | 'saving' | 'done'
// isSavingAllPages: 用于多页批量保存(参考 handleDownloadAllPages)
const initialSaveState = {
  isSaving: false,
  isSavingAllPages: false,
  status: '',
  currentPage: 1,
  totalPages: 1,
  pageSize: 50
}

const saveReducer = (state, action) => {
  switch (action.type) {
    case 'START_SAVE':
      return { ...state, isSaving: true, status: 'preparing' }
    case 'SET_SAVING':
      return { ...state, status: 'saving' }
    case 'SET_PAGE_INFO_SAVE':
      return { ...state, currentPage: action.payload.currentPage, totalPages: action.payload.totalPages }
    case 'SET_PAGE_SIZE_SAVE':
      return { ...state, pageSize: action.payload }
    case 'START_SAVE_ALL':
      return { ...state, isSavingAllPages: true, status: 'preparing' }
    case 'FINISH_SAVE':
      return { ...state, status: 'done' }
    case 'CANCEL_SAVE':
      return { ...state, isSaving: false, isSavingAllPages: false, status: '' }
    case 'RESET_SAVE':
      return { ...state, isSaving: false, isSavingAllPages: false, status: '' }
    default:
      return state
  }
}

const downloadReducer = (state, action) => {
  switch (action.type) {
    case 'START_DOWNLOAD':
      return { ...state, isDownloading: true, status: 'preparing', progress: 0 }
    case 'SET_DOWNLOADING':
      return { ...state, status: 'downloading' }
    case 'UPDATE_PROGRESS':
      return { ...state, progress: action.payload }
    case 'SET_PAGE_INFO':
      return { ...state, currentPage: action.payload.currentPage, totalPages: action.payload.totalPages }
    case 'START_DOWNLOAD_ALL':
      return { ...state, isDownloadingAllPages: true, status: 'preparing', progress: 0 }
    case 'FINISH_DOWNLOAD':
      return { ...state, status: 'done', progress: 100 }
    case 'CANCEL_DOWNLOAD':
      return { ...state, isDownloading: false, isDownloadingAllPages: false, status: '', progress: 0 }
    case 'RESET_DOWNLOAD':
      return { ...state, isDownloading: false, isDownloadingAllPages: false, status: '', progress: 0 }
    case 'SET_PAGE_SIZE':
      return { ...state, pageSize: action.payload }
    default:
      return state
  }
}

const downloadBlob = async (url, filename, options = {}) => {
  const { onProgress, signal } = options

  const fullUrl = url.startsWith('http') ? url : `${getBackendURL()}${url}`
  
  const response = await fetch(fullUrl, { 
    signal,
    headers: {
      'Accept': 'application/octet-stream, application/zip, image/*'
    }
  })

  if (!response.ok) {
    let errorText = ''
    try {
      errorText = await response.text()
    } catch (e) {
      errorText = '无法获取错误详情'
    }
    throw new Error(`下载失败: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const contentLength = parseInt(response.headers.get('Content-Length')) || 0
  const reader = response.body.getReader()
  const chunks = []
  let receivedLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    receivedLength += value.length

    if (onProgress && contentLength > 0) {
      const progress = Math.min(99, Math.round((receivedLength / contentLength) * 100))
      onProgress(progress)
    }
  }

  if (onProgress) {
    onProgress(100)
  }

  const blob = new Blob(chunks)
  const urlObj = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = urlObj
  link.download = decodeURIComponent(filename)
  document.body.appendChild(link)
  
  try {
    link.click()
  } catch (e) {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
  }
  
  document.body.removeChild(link)
  window.URL.revokeObjectURL(urlObj)

  return response
}

function MockupResult() {
  const [folders, setFolders] = useState([])
  const [templates, setTemplates] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  // 🔧 修复 H8:跟踪当前文件夹请求,用于取消上一次未完成的请求,避免 stale response 覆盖
  const folderRequestRef = useRef(null)
  const [displayPageSize, setDisplayPageSize] = useState(20)
  const [toast, setToast] = useState(null)
  const [downloadState, dispatch] = useReducer(downloadReducer, initialDownloadState)
  // ─── "保存到本地" 状态机 ───
  const [saveState, saveDispatch] = useReducer(saveReducer, initialSaveState)
  const [defaultOutputPath, setDefaultOutputPath] = useState('')
  const [hasDefaultOutputPath, setHasDefaultOutputPath] = useState(false)
  const [isLoadingSaveConfig, setIsLoadingSaveConfig] = useState(false)

  // ─── 标题生成（内联，镜像侵权检查：每组看图写标题，存 selectedFolder.generatedTitles）───
  const [generatingGroups, setGeneratingGroups] = useState({}) // { [groupName]: true }
  const [titleErrors, setTitleErrors] = useState({}) // { [groupName]: error }
  const [titlePromptOptions, setTitlePromptOptions] = useState([])
  const [selectedTitlePromptId, setSelectedTitlePromptId] = useState('')
  // 批量标题生成运行状态（SSE 进度用）
  const [titleGenBatchRunning, setTitleGenBatchRunning] = useState(false)
  const titleGenBatchESRef = useRef(null)
  const titleGenBatchTaskIdRef = useRef(null)
  // 组件卸载时关闭可能悬挂的批量进度 SSE
  useEffect(() => {
    return () => {
      if (titleGenBatchESRef.current) { titleGenBatchESRef.current.close(); titleGenBatchESRef.current = null }
    }
  }, [])
  // ─── 标题手动编辑（详情页内联）───
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const handleGenerateTitle = async (groupName, fileName, opts = {}) => {
    if (!selectedFolder?.id || generatingGroups[groupName]) return false
    setGeneratingGroups(prev => ({ ...prev, [groupName]: true }))
    try {
      const data = await apiGenerateTitle(selectedFolder.id, groupName, fileName, selectedTitlePromptId)
      setSelectedFolder(prev => ({
        ...prev,
        generatedTitles: { ...(prev.generatedTitles || {}), [groupName]: data.title },
        titleGenStatus: { ...(prev.titleGenStatus || {}), [groupName]: { status: 'success', at: Date.now() } }
      }))
      setTitleErrors(prev => { const n = { ...prev }; delete n[groupName]; return n })
      if (!opts.silent) showToast('标题已生成', 'success')
      return true
    } catch (e) {
      setTitleErrors(prev => ({ ...prev, [groupName]: e.message }))
      setSelectedFolder(prev => ({
        ...prev,
        titleGenStatus: { ...(prev.titleGenStatus || {}), [groupName]: { status: 'failed', error: e.message, at: Date.now() } }
      }))
      if (!opts.silent) showToast('生成失败：' + e.message, 'error')
      return false
    } finally {
      setGeneratingGroups(prev => { const n = { ...prev }; delete n[groupName]; return n })
    }
  }

  // 手动保存标题：乐观更新本地 state，失败回滚
  const handleSaveTitle = async () => {
    const groupName = selectedGroup?.groupName
    if (!groupName) return
    const newTitle = titleDraft.trim()
    if (!newTitle) { showToast('标题不能为空', 'error'); return }

    const prevTitle = selectedFolder.generatedTitles?.[groupName]
    const prevMeta = selectedFolder.titleMeta?.[groupName]
    setSelectedFolder(prev => ({
      ...prev,
      generatedTitles: { ...(prev.generatedTitles || {}), [groupName]: newTitle },
      titleMeta: { ...(prev.titleMeta || {}), [groupName]: { source: 'manual', updatedAt: Date.now() } }
    }))
    setEditingTitle(false)
    try {
      await apiUpdateTitle(selectedFolder.id, groupName, newTitle)
      showToast('标题已保存', 'success')
    } catch (e) {
      setSelectedFolder(prev => ({
        ...prev,
        generatedTitles: { ...(prev.generatedTitles || {}), [groupName]: prevTitle },
        titleMeta: { ...(prev.titleMeta || {}), [groupName]: prevMeta }
      }))
      showToast('保存失败：' + e.message, 'error')
    }
  }

  // 重新生成：若当前标题为手动修改过，先确认避免覆盖
  const handleRegenerateTitle = async (groupName) => {
    const meta = selectedFolder.titleMeta?.[groupName]
    if (meta?.source === 'manual') {
      if (!window.confirm('你已手动修改过该标题，确定用 AI 重新生成的结果覆盖吗？')) return
    }
    await handleGenerateTitle(groupName)
  }

  // mode: 'all' 全部 | 'missing' 补齐未生成 | 'failed' 批量重试失败
  // 手动改过的标题（titleMeta.source==='manual'）在 all/missing/failed 下都跳过，避免覆盖
  const handleGenerateAllTitles = async (mode = 'all') => {
    if (!selectedFolder?.mockups || titleGenBatchRunning) return
    const generated = selectedFolder.generatedTitles || {}
    const statusMap = selectedFolder.titleGenStatus || {}
    const meta = selectedFolder.titleMeta || {}

    const targets = selectedFolder.mockups.filter(m => {
      const g = m.groupName
      const isManual = meta[g]?.source === 'manual'
      if (mode === 'missing') return !generated[g] && !isManual
      if (mode === 'failed') return statusMap[g]?.status === 'failed' && !isManual
      return !isManual
    })

    if (targets.length === 0) {
      showToast('没有需要生成的标题', 'info')
      return
    }

    const label = mode === 'missing' ? '补齐未生成标题' : mode === 'failed' ? '重试失败标题' : '生成标题'
    // 乐观标记所有目标组为生成中，UI 实时显示进度
    setGeneratingGroups(prev => {
      const n = { ...prev }
      targets.forEach(t => { n[t.groupName] = true })
      return n
    })
    setTitleGenBatchRunning(true)
    showToast(`开始${label}（${targets.length} 项，并发生成）…`, 'info')

    let res
    try {
      // 视觉驱动：以"视觉效果图"为单元，直接传每张组的主图渲染图路径（colors[0].url / preview）
      // key=组名仅用于结果回写定位；imgUrl 才是喂给模型生成标题的图片
      res = await apiGenerateTitlesBatch(selectedFolder.id, {
        items: targets.map(t => ({
          key: t.groupName,
          imgUrl: (t.colors && t.colors[0] && t.colors[0].url) || t.preview || null
        })),
        promptId: selectedTitlePromptId
      })
    } catch (e) {
      setTitleGenBatchRunning(false)
      setGeneratingGroups({})
      showToast('启动失败：' + e.message, 'error')
      return
    }
    const taskId = res?.taskId
    if (!taskId) {
      setTitleGenBatchRunning(false)
      setGeneratingGroups({})
      showToast('启动失败：未返回任务 ID', 'error')
      return
    }
    titleGenBatchTaskIdRef.current = taskId

    // 连接 SSE 接收实时进度（后端并发生成，逐个回报）
    if (titleGenBatchESRef.current) { titleGenBatchESRef.current.close(); titleGenBatchESRef.current = null }
    const es = new EventSource(`${getBaseURL()}/title-gen/task/${taskId}/progress`)
    titleGenBatchESRef.current = es

    es.addEventListener('progress', (event) => {
      try {
        const d = JSON.parse(event.data)
        const g = d.groupName
        setSelectedFolder(prev => ({
          ...prev,
          generatedTitles: d.status === 'success'
            ? { ...(prev.generatedTitles || {}), [g]: d.title }
            : (prev.generatedTitles || {}),
          titleGenStatus: {
            ...(prev.titleGenStatus || {}),
            [g]: d.status === 'success'
              ? { status: 'success', at: Date.now() }
              : { status: 'failed', error: d.error, at: Date.now() }
          }
        }))
        setGeneratingGroups(prev => { const n = { ...prev }; delete n[g]; return n })
      } catch (_) { /* 忽略畸形事件 */ }
    })

    es.addEventListener('done', (event) => {
      try {
        const d = JSON.parse(event.data)
        showToast(
          `标题生成完成：成功 ${d.ok} 项${d.fail ? `，失败 ${d.fail} 项` : ''}`,
          d.fail ? 'error' : 'success'
        )
      } catch (_) {
        showToast('标题生成完成', 'success')
      } finally {
        es.close()
        titleGenBatchESRef.current = null
        titleGenBatchTaskIdRef.current = null
        setTitleGenBatchRunning(false)
      }
    })

    es.addEventListener('error', (event) => {
      let msg = '生成失败'
      try { const d = JSON.parse(event.data); msg = d.message || msg } catch (_) {}
      showToast('标题生成失败：' + msg, 'error')
      es.close()
      titleGenBatchESRef.current = null
      titleGenBatchTaskIdRef.current = null
      setTitleGenBatchRunning(false)
      setGeneratingGroups({})
    })

    es.addEventListener('cancelled', () => {
      showToast('已取消批量标题生成', 'info')
      es.close()
      titleGenBatchESRef.current = null
      titleGenBatchTaskIdRef.current = null
      setTitleGenBatchRunning(false)
      setGeneratingGroups({})
    })

    es.onerror = () => {
      // SSE 连接异常（如后端重启/网络中断）时静默关闭，避免重复弹错
      es.close()
      titleGenBatchESRef.current = null
      titleGenBatchTaskIdRef.current = null
      setTitleGenBatchRunning(false)
      setGeneratingGroups({})
    }
  }

  // 取消进行中的批量标题生成
  const handleCancelTitleGenBatch = async () => {
    const taskId = titleGenBatchTaskIdRef.current
    if (titleGenBatchESRef.current) { titleGenBatchESRef.current.close(); titleGenBatchESRef.current = null }
    titleGenBatchTaskIdRef.current = null
    setTitleGenBatchRunning(false)
    setGeneratingGroups({})
    if (taskId) {
      try { await apiCancelTitleGen(taskId) } catch (_) { /* 后端可能已结束 */ }
    }
  }

  // ─── 发布 ───
  const [publishTemplates, setPublishTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishResults, setPublishResults] = useState(null)

  // 店小秘上架模板导出
  const [dxmTemplates, setDxmTemplates] = useState([])
  const [selectedDxmTemplateId, setSelectedDxmTemplateId] = useState('')
  const [dxmModalOpen, setDxmModalOpen] = useState(false)
  const [dxmExporting, setDxmExporting] = useState(false)
  const [dxmColorWarnings, setDxmColorWarnings] = useState([])
  const [dxmLogs, setDxmLogs] = useState([])
  const [dxmActiveTaskId, setDxmActiveTaskId] = useState('')

  const abortControllerRef = useRef(null)
  const cancelDownloadRef = useRef(false)
  // 保存操作的取消:独立于下载,因为后端目前是同步阻塞实现(等 JSON 回来)
  const saveCancelRef = useRef(false)
  const dxmEventSourceRef = useRef(null)

  // 加载默认输出路径(进入结果页时拉一次,够用——不依赖用户每次都重读)
  useEffect(() => {
    const loadDefaultPath = async () => {
      try {
        setIsLoadingSaveConfig(true)
        const data = await apiGetSaveConfig()
        setDefaultOutputPath(data.defaultOutputPath || '')
        setHasDefaultOutputPath(!!data.hasDefaultOutputPath)
      } catch (e) {
        console.error('加载默认输出路径失败:', e)
      } finally {
        setIsLoadingSaveConfig(false)
      }
    }
    loadDefaultPath()
  }, [])

  useEffect(() => {
    loadFolders()
    loadTemplates()
  }, [])

  useEffect(() => {
    const loadTitlePrompts = async () => {
      try {
        const data = await apiGetTitlePrompts()
        setTitlePromptOptions(data.prompts || [])
        setSelectedTitlePromptId(data.defaultId || '')
      } catch (e) {
        console.error('加载标题提示词失败:', e)
      }
    }
    loadTitlePrompts()
  }, [])

  // 加载发布结果（用于卡片状态徽标持久显示）
  useEffect(() => {
    const loadResults = async () => {
      if (!selectedFolder?.id) return
      try {
        const data = await apiGetPublishResults(selectedFolder.id)
        if (data?.products) setPublishResults(data.products)
      } catch (e) {
        console.error('加载发布结果失败:', e)
      }
    }
    loadResults()
  }, [selectedFolder?.id])

  useEffect(() => {
    const loadPublishTemplates = async () => {
      try {
        const data = await apiGetPublishTemplates()
        setPublishTemplates(data || [])
      } catch (e) {
        console.error('加载发布模板失败:', e)
      }
    }
    loadPublishTemplates()
  }, [])

  // 关页重开 / 切换文件夹时，恢复进行中的店小秘导出任务（防重复导出、找回孤儿任务）
  useEffect(() => {
    if (!selectedFolder?.id) return
    let cancelled = false
    apiGetDxmTasks(selectedFolder.id).then(tasks => {
      if (cancelled) return
      const running = (tasks || []).find(t => t.status === 'running')
      if (running) {
        setDxmActiveTaskId(running.id)
        setDxmExporting(true)
        setDxmLogs(running.lastLog ? [running.lastLog] : ['检测到进行中的导出任务，正在恢复进度...'])
        attachDxmSSE(running.id, selectedFolder.id)
      } else {
        setDxmActiveTaskId('')
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedFolder?.id])

  // 加载店小秘上架模板
  useEffect(() => {
    const loadDxm = async () => {
      try {
        const data = await apiGetDxmTemplates()
        setDxmTemplates(data || [])
      } catch (e) {
        console.error('加载店小秘模板失败:', e)
      }
    }
    loadDxm()
  }, [])

  // 刊登进行中时，阻止误关窗口/刷新（浏览器原生确认弹窗）
  useEffect(() => {
    if (!isPublishing) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isPublishing])

  // 组件卸载时关闭店小秘导出 SSE
  useEffect(() => {
    return () => {
      if (dxmEventSourceRef.current) {
        dxmEventSourceRef.current.close()
        dxmEventSourceRef.current = null
      }
    }
  }, [])

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type })
  }, [])

  const hideToast = useCallback(() => {
    setToast(null)
  }, [])

  const loadFolders = async () => {
    try {
      const data = await apiRequest('/folders')
      const foldersWithMockups = data.filter(f => f.mockups && f.mockups.length > 0)
      setFolders(foldersWithMockups)
    } catch (error) {
      console.error('加载文件夹失败:', error)
      showToast('加载文件夹失败', 'error')
    }
  }

  const loadTemplates = async () => {
    try {
      const [templatesV1, templatesV2] = await Promise.all([
        apiRequest('/templates'),
        apiRequest('/templates-v2')
      ])
      setTemplates([...templatesV1, ...templatesV2])
    } catch (error) {
      console.error('加载模板失败:', error)
      showToast('加载模板失败', 'error')
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadFolders()
    if (selectedFolder) {
      try {
        const data = await apiRequest(`/folders/${selectedFolder.id}`)
        setSelectedFolder(data)
      } catch (error) {
        console.error('刷新文件夹详情失败:', error)
      }
    }
    setIsRefreshing(false)
    showToast('刷新完成', 'success')
  }

  const handleSelectFolder = async (folder) => {
    // 🔧 修复 H8:取消上一次未完成的请求,避免 stale response 覆盖新文件夹
    if (folderRequestRef.current) {
      folderRequestRef.current.abort()
    }
    const controller = new AbortController()
    folderRequestRef.current = controller

    try {
      const data = await apiRequest(`/folders/${folder.id}`, { signal: controller.signal })
      // 只有最新请求的响应才会被采纳
      if (folderRequestRef.current === controller) {
        setSelectedFolder(data)
        setSelectedGroup(null)
        folderRequestRef.current = null
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // 上一个请求被新请求取消,静默忽略
        return
      }
      console.error('加载文件夹详情失败:', error)
      showToast('加载文件夹详情失败', 'error')
    }
  }

  const handleBackToFolders = () => {
    setSelectedFolder(null)
    setSelectedGroup(null)
  }

  const handleBackToGroups = () => {
    setSelectedGroup(null)
  }

  const handleDownloadSingle = async (url, name) => {
    try {
      await downloadBlob(getImageUrl(url), `${name}_mockup.jpg`)
    } catch (error) {
      console.error('下载图片失败:', error)
      showToast('下载图片失败', 'error')
    }
  }

  const handleDownloadAll = async () => {
    if (!selectedFolder?.mockups || !selectedFolder.id || downloadState.isDownloading) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    
    dispatch({ type: 'START_DOWNLOAD' })

    try {
      await downloadBlob(
        `/api/folders/${selectedFolder.id}/download-zip`,
        `${selectedFolder.name}_mockups.zip`,
        {
          signal: controller.signal,
          onProgress: (pct) => {
            dispatch({ type: 'SET_DOWNLOADING' })
            dispatch({ type: 'UPDATE_PROGRESS', payload: pct })
          }
        }
      )

      dispatch({ type: 'FINISH_DOWNLOAD' })
      showToast('下载完成', 'success')

      setTimeout(() => {
        dispatch({ type: 'RESET_DOWNLOAD' })
      }, 1500)
    } catch (error) {
      if (error.code === 'ERR_CANCELED') {
        showToast('下载已取消', 'info')
      } else {
        console.error('下载失败:', error)
        showToast('下载失败，请重试', 'error')
      }
      dispatch({ type: 'CANCEL_DOWNLOAD' })
    } finally {
      abortControllerRef.current = null
    }
  }

  const handleDownloadPaged = async (page, pageSizeVal) => {
    if (!selectedFolder?.mockups || !selectedFolder.id || downloadState.isDownloading) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    
    dispatch({ type: 'START_DOWNLOAD' })
    dispatch({ type: 'SET_PAGE_INFO', payload: { currentPage: page, totalPages: Math.ceil(selectedFolder.mockups.length / pageSizeVal) } })

    try {
      const response = await downloadBlob(
        `/api/folders/${selectedFolder.id}/download-zip-paged?page=${page}&pageSize=${pageSizeVal}`,
        `${selectedFolder.name}_page_${page}_of_${Math.ceil(selectedFolder.mockups.length / pageSizeVal)}.zip`,
        {
          signal: controller.signal,
          onProgress: (pct) => {
            dispatch({ type: 'SET_DOWNLOADING' })
            dispatch({ type: 'UPDATE_PROGRESS', payload: pct })
          }
        }
      )

      const totalPages = parseInt(response.headers.get('x-total-pages')) || 1
      dispatch({ type: 'SET_PAGE_INFO', payload: { currentPage: page, totalPages } })
      dispatch({ type: 'FINISH_DOWNLOAD' })
      showToast(`第 ${page} 页下载完成`, 'success')

      setTimeout(() => {
        dispatch({ type: 'RESET_DOWNLOAD' })
      }, 1000)
    } catch (error) {
      if (error.code === 'ERR_CANCELED') {
        showToast('下载已取消', 'info')
      } else {
        console.error('下载失败:', error)
        showToast(`第 ${page} 页下载失败`, 'error')
      }
      dispatch({ type: 'CANCEL_DOWNLOAD' })
    } finally {
      abortControllerRef.current = null
    }
  }

  const handleDownloadAllPages = async () => {
    if (!selectedFolder?.mockups || !selectedFolder.id || downloadState.isDownloadingAllPages) return

    const totalGroups = selectedFolder.mockups.length
    const totalPages = Math.ceil(totalGroups / downloadState.pageSize)

    cancelDownloadRef.current = false
    dispatch({ type: 'START_DOWNLOAD_ALL' })
    dispatch({ type: 'SET_PAGE_INFO', payload: { currentPage: 1, totalPages } })

    let hasError = false

    for (let page = 1; page <= totalPages; page++) {
      if (cancelDownloadRef.current) break

      const currentController = new AbortController()
      abortControllerRef.current = currentController
      
      dispatch({ type: 'SET_PAGE_INFO', payload: { currentPage: page, totalPages } })
      dispatch({ type: 'UPDATE_PROGRESS', payload: Math.round(((page - 1) / totalPages) * 100) })

      try {
        await downloadBlob(
          `/api/folders/${selectedFolder.id}/download-zip-paged?page=${page}&pageSize=${downloadState.pageSize}`,
          `${selectedFolder.name}_page_${page}_of_${totalPages}.zip`,
          {
            signal: currentController.signal
          }
        )

        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        if (error.code === 'ERR_CANCELED') {
          showToast('下载已取消', 'info')
          hasError = true
          break
        }
        console.error(`第 ${page} 页下载失败:`, error)
        showToast(`第 ${page} 页下载失败，已跳过`, 'error')
        hasError = true
      }
    }

    abortControllerRef.current = null
    cancelDownloadRef.current = false

    if (!hasError) {
      dispatch({ type: 'UPDATE_PROGRESS', payload: 100 })
      dispatch({ type: 'FINISH_DOWNLOAD' })
      showToast('全部下载完成', 'success')
      setTimeout(() => {
        dispatch({ type: 'RESET_DOWNLOAD' })
      }, 1500)
    } else {
      dispatch({ type: 'CANCEL_DOWNLOAD' })
    }
  }

  const handleCancelDownload = () => {
    cancelDownloadRef.current = true
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    dispatch({ type: 'CANCEL_DOWNLOAD' })
  }

  // ─── "保存到本地" handlers ───
  // 共享单页保存:走 save-to-disk 接口
  const handleSaveToDisk = async (page, pageSizeVal) => {
    if (!selectedFolder?.mockups || !selectedFolder.id || saveState.isSaving) return

    if (!defaultOutputPath) {
      showToast('请先在「设置 → 通用」中配置默认输出路径', 'error')
      return
    }

    saveCancelRef.current = false
    saveDispatch({ type: 'START_SAVE' })
    saveDispatch({ type: 'SET_SAVING' })
    saveDispatch({ type: 'SET_PAGE_INFO_SAVE', payload: { currentPage: page, totalPages: Math.ceil(selectedFolder.mockups.length / pageSizeVal) } })

    try {
      const result = await apiRequest(`/folders/${selectedFolder.id}/save-to-disk`, {
        method: 'POST',
        data: {
          page,
          pageSize: pageSizeVal,
          defaultOutputPath
        }
      })

      if (saveCancelRef.current) {
        showToast('保存已取消', 'info')
        saveDispatch({ type: 'CANCEL_SAVE' })
        return
      }

      saveDispatch({ type: 'FINISH_SAVE' })
      const tail = result.missingFiles && result.missingFiles.length > 0
        ? `,缺失 ${result.missingFiles.length} 个文件`
        : ''
      showToast(
        `第 ${page} 页保存完成(${result.savedFiles} 个文件 → ${result.folderName}/page_${page}_of_${Math.ceil(selectedFolder.mockups.length / pageSizeVal)})${tail}`,
        result.missingFiles && result.missingFiles.length > 0 ? 'info' : 'success'
      )

      setTimeout(() => {
        saveDispatch({ type: 'RESET_SAVE' })
      }, 1500)
    } catch (error) {
      if (saveCancelRef.current) {
        showToast('保存已取消', 'info')
      } else {
        console.error('保存到本地失败:', error)
        if (error.message && error.message.includes('未指定输出路径')) {
          showToast('请先在「设置 → 通用」中配置默认输出路径', 'error')
        } else {
          showToast(`第 ${page} 页保存失败: ${error.message || '请重试'}`, 'error')
        }
      }
      saveDispatch({ type: 'CANCEL_SAVE' })
    }
  }

  // 批量保存:按页循环(参考 handleDownloadAllPages,但走 save-to-disk)
  const handleSaveAllPages = async () => {
    if (!selectedFolder?.mockups || !selectedFolder.id || saveState.isSaving) return

    if (!defaultOutputPath) {
      showToast('请先在「设置 → 通用」中配置默认输出路径', 'error')
      return
    }

    const totalPages = Math.ceil(selectedFolder.mockups.length / saveState.pageSize)
    saveCancelRef.current = false
    saveDispatch({ type: 'START_SAVE_ALL' })
    saveDispatch({ type: 'SET_PAGE_INFO_SAVE', payload: { currentPage: 1, totalPages } })

    let hasError = false
    let totalSaved = 0

    for (let page = 1; page <= totalPages; page++) {
      if (saveCancelRef.current) break

      saveDispatch({ type: 'SET_SAVING' })
      saveDispatch({ type: 'SET_PAGE_INFO_SAVE', payload: { currentPage: page, totalPages } })

      try {
        const result = await apiRequest(`/folders/${selectedFolder.id}/save-to-disk`, {
          method: 'POST',
          data: {
            page,
            pageSize: saveState.pageSize,
            defaultOutputPath
          }
        })
        totalSaved += result.savedFiles || 0
      } catch (error) {
        if (saveCancelRef.current) break
        console.error(`第 ${page} 页保存失败:`, error)
        showToast(`第 ${page} 页保存失败,已跳过`, 'error')
        hasError = true
      }
    }

    const wasCancelled = saveCancelRef.current
    saveCancelRef.current = false

    if (!hasError && !wasCancelled) {
      saveDispatch({ type: 'FINISH_SAVE' })
      showToast(`全部保存完成(共 ${totalSaved} 个文件)`, 'success')
      setTimeout(() => {
        saveDispatch({ type: 'RESET_SAVE' })
      }, 1500)
    } else {
      saveDispatch({ type: 'CANCEL_SAVE' })
    }
  }

  const handleCancelSave = () => {
    saveCancelRef.current = true
    saveDispatch({ type: 'CANCEL_SAVE' })
  }

  const handleDeleteGroup = async (groupName) => {
    if (!selectedFolder?.mockups || !selectedFolder.id) return

    if (!confirm(`确定要删除图案组 "${groupName}" 吗？此操作不可恢复。`)) return

    try {
      const mockupIndex = selectedFolder.mockups.findIndex(m => m.groupName === groupName)
      if (mockupIndex !== -1) {
        await apiRequest(`/folders/${selectedFolder.id}/mockups/${mockupIndex}`, { method: 'DELETE' })
        setSelectedFolder(prev => ({
          ...prev,
          mockups: prev.mockups.filter((_, i) => i !== mockupIndex)
        }))
        if (selectedGroup?.groupName === groupName) {
          setSelectedGroup(null)
        }
        showToast('删除成功', 'success')
      }
    } catch (error) {
      console.error('删除图案组失败:', error)
      showToast('删除失败，请重试', 'error')
    }
  }

  const handleDeleteAll = async () => {
    if (!selectedFolder?.mockups || selectedFolder.mockups.length === 0) return

    if (!confirm(`确定要删除所有 ${selectedFolder.mockups.length} 个图案组吗？此操作不可恢复。`)) return

    try {
      await apiRequest(`/folders/${selectedFolder.id}/mockups`, { method: 'DELETE' })
      setSelectedFolder(null)
      await loadFolders()
      showToast('删除成功', 'success')
    } catch (error) {
      console.error('删除套图失败:', error)
      showToast('删除失败，请重试', 'error')
    }
  }

  // ─── 发布 ───
  const handlePublish = async () => {
    if (!selectedTemplateId) { showToast('请先选择发布模板', 'error'); return }
    const items = selectedFolder?.mockups || []
    if (items.length === 0) { showToast('没有可发布的套图', 'error'); return }

    setIsPublishing(true)
    setPublishResults(null)

    const products = items.map(m => ({
      groupName: m.groupName,
      title: selectedFolder.generatedTitles?.[m.groupName] || m.groupName,
    }))

    try {
      const result = await apiPublishFolder(selectedFolder.id, selectedTemplateId, products)
      setPublishResults(result.results)
      showToast(result.results.every(r => r.status === 'success') ? '全部发布成功' : '部分发布失败，请查看详情', 'info')
    } catch (e) {
      showToast('发布失败: ' + e.message, 'error')
    } finally {
      setIsPublishing(false)
    }
  }

  // ─── 店小秘上架表格导出 ───
  const handleOpenDxmModal = () => {
    if (!selectedDxmTemplateId) { showToast('请先选择店小秘上架模板', 'error'); return }
    const tpl = dxmTemplates.find(t => t.id === selectedDxmTemplateId)
    if (!tpl) { showToast('模板不存在', 'error'); return }
    // 校验颜色映射：模板 colorMap 的套图色名 是否都在当前文件夹套图色集合内
    const mockColorNames = new Set()
    ;(selectedFolder?.mockups || []).forEach(g => (g.colors || []).forEach(c => mockColorNames.add(c.name)))
    const warns = []
    ;(tpl.colors || []).forEach(c => {
      const mapped = (tpl.colorMap && tpl.colorMap[c.name]) || c.name
      if (!mockColorNames.has(mapped)) {
        warns.push(`模板色「${c.name}」映射的套图色「${mapped}」在当前文件夹套图中不存在`)
      }
    })
    setDxmColorWarnings(warns)
    setDxmLogs([])
    setDxmModalOpen(true)
  }

  // 接管某个导出任务的 SSE 进度（供「点击导出」与「关页重开自动续接」复用）
  const attachDxmSSE = (taskId, folderId) => {
    const fid = folderId || selectedFolder?.id
    if (!taskId || !fid) return
    if (dxmEventSourceRef.current) {
      dxmEventSourceRef.current.close()
      dxmEventSourceRef.current = null
    }
    const es = new EventSource(`${getBaseURL()}/folders/${fid}/export-dxm-progress/${taskId}`)
    dxmEventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'log') setDxmLogs(prev => [...prev, data.message])
        else if (data.type === 'status') setDxmLogs(prev => [...prev, `阶段: ${data.step}`])
      } catch (e) { /* ignore malformed event */ }
    }

    es.onerror = (err) => {
      console.error('[SSE] 连接失败', err)
      setDxmLogs(prev => [...prev, '❌ 进度连接失败，请检查后端服务是否正常运行'])
      showToast('进度连接失败，请检查后端服务', 'error')
      es.close()
      dxmEventSourceRef.current = null
      setDxmExporting(false)
    }

    es.addEventListener('done', (event) => {
      try {
        const data = JSON.parse(event.data)
        const byteCharacters = atob(data.buffer)
        const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i))
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.fileName || `店小秘上架_${Date.now()}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showToast('已生成店小秘上架表格，开始下载', 'success')
        setDxmModalOpen(false)
      } catch (e) {
        showToast('下载文件失败: ' + e.message, 'error')
      } finally {
        es.close()
        dxmEventSourceRef.current = null
        setDxmExporting(false)
        setDxmActiveTaskId('')
      }
    })

    es.addEventListener('error', (event) => {
      let msg = '导出失败'
      try { const data = JSON.parse(event.data); msg = data.message || msg } catch (_) {}
      showToast('导出失败: ' + msg, 'error')
      es.close()
      dxmEventSourceRef.current = null
      setDxmExporting(false)
      setDxmActiveTaskId('')
    })

    es.addEventListener('cancelled', () => {
      showToast('已取消导出', 'info')
      es.close()
      dxmEventSourceRef.current = null
      setDxmExporting(false)
      setDxmActiveTaskId('')
      setDxmLogs(prev => [...prev, '导出已取消'])
    })
  }

  const handleDxmExport = async () => {
    if (!selectedFolder?.mockups?.length) { showToast('没有可导出的套图', 'error'); return }
    setDxmExporting(true)
    setDxmLogs(['正在启动导出任务...'])
    try {
      const data = await apiExportDxm(selectedFolder.id, selectedDxmTemplateId, selectedTitlePromptId)
      setDxmActiveTaskId(data.taskId)
      if (data.resumed) showToast('已有导出正在进行，已为你恢复进度', 'info')
      attachDxmSSE(data.taskId, selectedFolder.id)
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error')
      setDxmExporting(false)
    }
  }

  // 取消进行中的导出：通知后端中断在途上传并释放通道
  const handleCancelDxm = async () => {
    if (!dxmActiveTaskId) return
    try {
      await apiCancelDxmTask(dxmActiveTaskId)
      showToast('已取消导出', 'info')
    } catch (e) {
      showToast('取消失败: ' + e.message, 'error')
    }
    if (dxmEventSourceRef.current) { dxmEventSourceRef.current.close(); dxmEventSourceRef.current = null }
    setDxmExporting(false)
    setDxmActiveTaskId('')
    setDxmLogs([])
  }

  const handleRetryPublish = async (groupNames) => {
    if (!selectedTemplateId) { showToast('请选择发布模板', 'error'); return }
    setIsPublishing(true)
    try {
      const result = await apiRetryPublish(selectedFolder.id, selectedTemplateId, groupNames)
      // Merge new results with existing
      setPublishResults(prev => {
        const updated = [...(prev || [])]
        for (const r of result.results) {
          const idx = updated.findIndex(p => p.groupName === r.groupName)
          if (idx >= 0) updated[idx] = r
          else updated.push(r)
        }
        return updated
      })
      showToast('重试完成', 'info')
    } catch (e) {
      showToast('重试失败: ' + e.message, 'error')
    } finally {
      setIsPublishing(false)
    }
  }

  const getTemplateName = (templateId) => {
    const template = templates.find(t => t.id === templateId)
    return template?.name || '未知模板'
  }

  if (selectedGroup) {
    return (
      <div className="space-y-6">
        {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBackToGroups} 
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
          >
            <FolderOpen className="w-5 h-5" />
            <span>返回图案组列表</span>
          </button>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => handleDeleteGroup(selectedGroup.groupName)}
              className="flex items-center space-x-2 px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              <span>删除图案组</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedGroup.groupName}</h2>
              <p className="text-gray-500 mt-1">
                所属文件夹: {selectedFolder?.name} | 
                颜色数量: {selectedGroup.colors?.length || 0}
              </p>
            </div>
          </div>

            {/* ─── 标题信息卡片（支持手动编辑）─── */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-4 mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-purple-500 font-medium">商品标题</span>
            </div>
            {selectedFolder.generatedTitles?.[selectedGroup.groupName] || editingTitle ? (
              <div>
                {editingTitle ? (
                  <div className="space-y-2">
                    <textarea
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setEditingTitle(false)}
                        className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveTitle}
                        className="px-3 py-1.5 text-xs text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 line-clamp-2 flex-1">
                      {selectedFolder.generatedTitles?.[selectedGroup.groupName]}
                    </span>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingTitle(true); setTitleDraft(selectedFolder.generatedTitles?.[selectedGroup.groupName] || '') }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>编辑</span>
                      </button>
                      <button
                        onClick={() => handleRegenerateTitle(selectedGroup.groupName)}
                        disabled={generatingGroups[selectedGroup.groupName]}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
                      >
                        {generatingGroups[selectedGroup.groupName] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>重新生成</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">尚未生成标题，发布前需先生成标题</span>
                <button
                  onClick={() => handleGenerateTitle(selectedGroup.groupName)}
                  disabled={generatingGroups[selectedGroup.groupName]}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
                >
                  {generatingGroups[selectedGroup.groupName] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>AI 生成标题</span>
                </button>
              </div>
            )}
          </div>

          {selectedGroup.colors && selectedGroup.colors.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">各颜色套图</h3>
                <span className="text-sm text-gray-500">
                  共 {selectedGroup.colors.length} 个颜色
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedGroup.colors.map((color, index) => (
                  <div key={index} className="bg-gray-100 rounded-xl overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded font-medium">
                          {color.name}
                        </span>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDownloadSingle(color.url, `${selectedGroup.groupName}_${color.name}`)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                          >
                            <Download className="w-4 h-4" />
                            <span>下载主图</span>
                          </button>
                          <button
                            onClick={() => window.open(getImageUrl(color.url), '_blank')}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                          >
                            <Eye className="w-4 h-4" />
                            <span>预览</span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="bg-white rounded-lg p-2 mb-3">
                        <LazyImage
                          src={getImageUrl(color.url)}
                          alt={`${selectedGroup.groupName}_${color.name}`}
                          className="w-full aspect-[3/4] object-contain"
                        />
                        <p className="text-center text-xs text-gray-500 mt-1">主图</p>
                      </div>

                      {color.detailImages && color.detailImages.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-2">细节图:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {color.detailImages.map((detailImg, detailIndex) => (
                              <div key={detailIndex} className="relative bg-white rounded-lg overflow-hidden group">
                                <LazyImage
                                  src={getImageUrl(detailImg.url)}
                                  alt={detailImg.label}
                                  className="w-full aspect-[3/4] object-contain p-2"
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                                  <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleDownloadSingle(detailImg.url, `${selectedGroup.groupName}_${color.name}_${detailImg.label}`)}
                                      className="flex items-center space-x-1 px-2 py-1.5 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>下载</span>
                                    </button>
                                    <button
                                      onClick={() => window.open(getImageUrl(detailImg.url), '_blank')}
                                      className="flex items-center space-x-1 px-2 py-1.5 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors text-xs"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>预览</span>
                                    </button>
                                  </div>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-1">
                                  <p className="text-white text-xs text-center">{detailImg.label}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">暂无套图</h3>
              <p className="text-gray-500 mt-2">该图案组没有套图</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (selectedFolder) {
    const totalItems = selectedFolder.mockups?.length || 0
    const totalDisplayPages = displayPageSize >= 9999 ? 1 : Math.ceil(totalItems / displayPageSize)
    const startIndex = (currentPage - 1) * displayPageSize
    const endIndex = displayPageSize >= 9999 ? totalItems : Math.min(startIndex + displayPageSize, totalItems)
    const pagedMockups = selectedFolder.mockups?.slice(startIndex, endIndex) || []

    return (
      <div className="space-y-6">
        {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
        
        {/* 顶部导航栏：返回 + 删除 */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToFolders}
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
          >
            <FolderOpen className="w-5 h-5" />
            <span>返回文件夹列表</span>
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={!selectedFolder?.mockups || selectedFolder.mockups.length === 0}
            className="flex items-center space-x-2 px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-5 h-5" />
            <span>删除全部</span>
          </button>
        </div>

        {/* 操作卡片聚合：按场景分区 — 上「本地操作」/ 下「外部平台」 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* 上区：本地操作（下载 / 保存 / 标题生成） */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              <span className="text-sm font-medium text-gray-700">本地操作</span>
              <span className="text-xs text-gray-400">下载 / 保存 / 标题</span>
            </div>
            <div className="flex items-center flex-wrap gap-3">
              <select
                value={downloadState.pageSize}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  dispatch({ type: 'SET_PAGE_SIZE', payload: v })
                  saveDispatch({ type: 'SET_PAGE_SIZE_SAVE', payload: v })
                }}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>每页10</option>
                <option value={20}>每页20</option>
                <option value={50}>每页50</option>
                <option value={100}>每页100</option>
                <option value={200}>每页200</option>
              </select>

              {downloadState.isDownloadingAllPages || downloadState.isDownloading ? (
                <button
                  onClick={handleCancelDownload}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>取消下载</span>
                </button>
              ) : (
                <button
                  onClick={handleDownloadAllPages}
                  disabled={!selectedFolder?.mockups || selectedFolder.mockups.length === 0}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>下载</span>
                </button>
              )}

              {saveState.isSavingAllPages || saveState.isSaving ? (
                <button
                  onClick={handleCancelSave}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>取消保存</span>
                </button>
              ) : (
                <button
                  onClick={handleSaveAllPages}
                  disabled={!selectedFolder?.mockups || selectedFolder.mockups.length === 0 || !hasDefaultOutputPath}
                  title={!hasDefaultOutputPath ? '请先在「设置 → 通用」中配置默认输出路径' : '按 R01 规定的目录树直接展开到本地路径'}
                  className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FolderOutput className="w-4 h-4" />
                  <span>保存到本地</span>
                </button>
              )}

              <div className="w-px h-5 bg-gray-200" />

              <select
                value={selectedTitlePromptId}
                onChange={(e) => setSelectedTitlePromptId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">默认提示词</option>
                {titlePromptOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {(() => {
                const _gen = selectedFolder?.generatedTitles || {}
                const _st = selectedFolder?.titleGenStatus || {}
                const _meta = selectedFolder?.titleMeta || {}
                let _missing = 0, _failed = 0
                for (const m of (selectedFolder?.mockups || [])) {
                  const g = m.groupName
                  if (!_gen[g] && _meta[g]?.source !== 'manual') _missing++
                  if (_st[g]?.status === 'failed') _failed++
                }
                return (
                  <>
                    {titleGenBatchRunning ? (
                      <button
                        type="button"
                        onClick={handleCancelTitleGenBatch}
                        className="flex items-center space-x-2 px-5 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                        <span>取消生成</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleGenerateAllTitles('all')}
                          disabled={!selectedFolder?.mockups?.length}
                          className="flex items-center space-x-2 px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Sparkles className="w-5 h-5" />
                          <span>批量生成标题</span>
                        </button>
                        {_missing > 0 && (
                          <button
                            type="button"
                            onClick={() => handleGenerateAllTitles('missing')}
                            disabled={!selectedFolder?.mockups?.length}
                            className="flex items-center space-x-2 px-5 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Sparkles className="w-5 h-5" />
                            <span>补齐未生成 ({_missing})</span>
                          </button>
                        )}
                        {_failed > 0 && (
                          <button
                            type="button"
                            onClick={() => handleGenerateAllTitles('failed')}
                            disabled={!selectedFolder?.mockups?.length}
                            className="flex items-center space-x-2 px-5 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Sparkles className="w-5 h-5" />
                            <span>重试失败 ({_failed})</span>
                          </button>
                        )}
                      </>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* 下区：外部平台（店小秘 / TEMU 妙手） */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-green-500 rounded-full" />
              <span className="text-sm font-medium text-gray-700">外部平台</span>
              <span className="text-xs text-gray-400">店小秘 / TEMU 妙手</span>
            </div>
            <div className="flex items-start flex-wrap gap-3">
              {/* 店小秘导出：标签 + 模板选择 + 操作按钮 内聚为一个迷你表单 */}
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                <span className="text-xs font-medium text-gray-500">店小秘</span>
                <select
                  value={selectedDxmTemplateId}
                  onChange={(e) => setSelectedDxmTemplateId(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="">-- 选择店小秘模板 --</option>
                  {dxmTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name} (¥{tpl.overrides?.defaultPrice} 货号:{tpl.overrides?.itemNum})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleOpenDxmModal}
                  disabled={!selectedFolder?.mockups?.length}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  <span>导出表格</span>
                </button>
              </div>

              {/* TEMU 发布：标签 + 模板选择 + 操作按钮 内聚为一个迷你表单 */}
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                <span className="text-xs font-medium text-gray-500">妙手代理</span>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">-- 选择发布模板 --</option>
                  {publishTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name} (站点:{(tpl.publishSites||[]).join(',')}  ¥{tpl.defaultPrice})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={!selectedFolder?.mockups?.length || isPublishing}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{isPublishing ? '发布中...' : '发布到TEMU'}</span>
                </button>
              </div>
            </div>

            {isPublishing && (
              <div className="mt-3 flex items-center space-x-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>正在刊登中，请勿关闭或刷新当前窗口，否则刊登可能中断。</span>
              </div>
            )}

            {dxmExporting && (
              <div className="mt-3 flex items-center justify-between space-x-2 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">
                <div className="flex items-center space-x-2 min-w-0">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span className="truncate">店小秘导出进行中…{dxmLogs.length ? `（${dxmLogs[dxmLogs.length - 1]}）` : ''}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelDxm}
                  className="flex-shrink-0 flex items-center space-x-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 text-xs"
                >
                  <X className="w-3 h-3" />
                  <span>取消</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 妙手发布结果卡片：独立展示，避免操作卡片拥挤 */}
        {publishResults && publishResults.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center space-x-2">
                <span>妙手发布结果</span>
                <span className="text-xs text-gray-500">({publishResults.filter(r=>r.status==='success').length}/{publishResults.length})</span>
              </h4>
              {publishResults.some(r=>r.status!=='success')&&(
                <button onClick={()=>{const f=publishResults.filter(r=>r.status!=='success').map(r=>r.groupName);if(f.length)handleRetryPublish(f)}} disabled={isPublishing}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-xs">
                  <RotateCcw className="w-3 h-3"/><span>重试全部失败项</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {publishResults.map(result => (
                <div key={result.groupName} className={`flex items-center justify-between p-2 rounded-lg ${result.status==='success'?'bg-green-50':'bg-red-50'}`} title={result.error || ''}>
                  <div className="flex items-center space-x-1.5 min-w-0">
                    {result.status==='success'?<CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0"/>:<AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0"/>}
                    <span className="text-xs font-medium truncate">{result.groupName}</span>
                  </div>
                  {result.status!=='success'&&(
                    <button onClick={()=>handleRetryPublish([result.groupName])} disabled={isPublishing}
                      className="flex-shrink-0 flex items-center space-x-1 text-xs text-red-600 hover:text-red-800 ml-1">
                      <RotateCcw className="w-3 h-3"/><span>重试</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 店小秘导出确认弹窗 */}
        {dxmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4" onClick={() => !dxmExporting && setDxmModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">确认导出店小秘上架表格</h3>
                <button onClick={() => !dxmExporting && setDxmModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-600 mb-3">将把当前文件夹的 {selectedFolder?.mockups?.length || 0} 个设计组，按所选模板拼成一张上架表。</p>
              {dxmColorWarnings.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-sm text-amber-800 space-y-1">
                  <p className="font-medium">以下颜色映射未匹配到套图（对应商品图片将留空）：</p>
                  {dxmColorWarnings.map((w, i) => <p key={i}>· {w}</p>)}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm text-green-700">颜色映射全部匹配 ✓</div>
              )}

              {/* 导出进度日志 */}
              {(dxmExporting || dxmLogs.length > 0) && (
                <div className="bg-gray-900 text-gray-100 rounded-lg p-3 mb-3 font-mono text-xs space-y-1 max-h-56 overflow-y-auto">
                  {dxmLogs.length === 0 ? <p>等待开始...</p> : dxmLogs.map((log, i) => <p key={i} className="truncate">{log}</p>)}
                  {dxmExporting && <p className="animate-pulse text-indigo-300">处理中...</p>}
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button onClick={() => { if (dxmExporting) handleCancelDxm(); else setDxmModalOpen(false); }} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
                <button onClick={handleDxmExport} disabled={dxmExporting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2 disabled:opacity-50">
                  {dxmExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{dxmExporting ? '导出中...' : '导出并下载'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 默认输出路径提示(未配置时显示) */}
        {!hasDefaultOutputPath && !isLoadingSaveConfig && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>「保存到本地」需要先配置默认输出路径,请前往「设置 → 通用」填写。</span>
          </div>
        )}

        {(downloadState.isDownloading || downloadState.isDownloadingAllPages) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Loader2 className={`w-5 h-5 ${downloadState.isDownloadingAllPages ? 'text-blue-500' : 'text-amber-500'} animate-spin`} />
                <span className="font-medium text-gray-900">
                  {downloadState.isDownloadingAllPages 
                    ? `正在分段下载第 ${downloadState.currentPage} / ${downloadState.totalPages} 页`
                    : downloadState.status === 'downloading' 
                      ? `下载中 ${downloadState.progress}%`
                      : '服务器准备中…'
                  }
                </span>
              </div>
              <button
                onClick={handleCancelDownload}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${downloadState.isDownloadingAllPages ? 'bg-blue-500' : 'bg-amber-500'}`}
                style={{ width: `${downloadState.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 保存到本地 进度条 ── */}
        {(saveState.isSaving || saveState.isSavingAllPages) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Loader2 className={`w-5 h-5 ${saveState.isSavingAllPages ? 'text-purple-500' : 'text-amber-500'} animate-spin`} />
                <span className="font-medium text-gray-900">
                  {saveState.isSavingAllPages
                    ? `正在分段保存第 ${saveState.currentPage} / ${saveState.totalPages} 页`
                    : saveState.status === 'saving'
                      ? `第 ${saveState.currentPage} / ${saveState.totalPages} 页保存中…`
                      : '正在准备目录…'}
                </span>
              </div>
              <button
                onClick={handleCancelSave}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-gray-500 mb-1">输出到: {defaultOutputPath}</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${saveState.isSavingAllPages ? 'bg-purple-500' : 'bg-amber-500'}`}
                style={{
                  width: saveState.isSavingAllPages
                    ? `${Math.round((saveState.currentPage / Math.max(saveState.totalPages, 1)) * 100)}%`
                    : saveState.status === 'saving' ? '70%' : '10%'
                }}
              />
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedFolder.name}</h2>
              <p className="text-gray-500 mt-1">
                模板: {getTemplateName(selectedFolder.templateId)} | 
                图案组数量: {selectedFolder.mockups?.length || 0}
              </p>
            </div>
          </div>

          {selectedFolder.mockups && selectedFolder.mockups.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">图案组列表</h3>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">每页:</span>
                    <select
                      value={displayPageSize}
                      onChange={(e) => {
                        setDisplayPageSize(parseInt(e.target.value))
                        setCurrentPage(1)
                      }}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={9999}>全部</option>
                    </select>
                  </div>
                  <span className="text-sm text-gray-500">
                    共 {selectedFolder.mockups.length} 个图案组
                    {(() => {
                      const gen = selectedFolder.generatedTitles || {}
                      const st = selectedFolder.titleGenStatus || {}
                      const has = selectedFolder.mockups.filter(m => gen[m.groupName]).length
                      const failed = selectedFolder.mockups.filter(m => st[m.groupName]?.status === 'failed').length
                      return (<span key="title-count"> · <span className={has > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>{has} 个已生成标题</span>{failed > 0 && <span className="text-red-600 font-medium"> · {failed} 个失败</span>}</span>)
                    })()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {pagedMockups.map((group, index) => {
                  const publishResult = publishResults?.find(r => r.groupName === group.groupName)
                  const isPublishingGroup = isPublishing && !publishResult
                  const hasTitle = !!selectedFolder.generatedTitles?.[group.groupName]
                  const titleError = titleErrors[group.groupName]

                  // 左下角：发布状态
                  let statusBadge = null
                  if (isPublishingGroup) {
                    statusBadge = (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-500 text-white text-xs rounded-full font-medium shadow-sm">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>刊登中</span>
                      </span>
                    )
                  } else if (publishResult) {
                    if (publishResult.status === 'success') {
                      statusBadge = (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-500 text-white text-xs rounded-full font-medium shadow-sm">
                          <CheckCircle className="w-3 h-3" />
                          <span>已刊登</span>
                        </span>
                      )
                    } else {
                      statusBadge = (
                        <span
                          className="relative inline-flex items-center space-x-1 px-2.5 py-1 bg-red-500 text-white text-xs rounded-full font-medium shadow-sm cursor-help pointer-events-auto group/error"
                        >
                          <AlertCircle className="w-3 h-3" />
                          <span>刊登异常</span>
                          <div className="hidden group-hover/error:block absolute bottom-full left-0 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50 text-left">
                            <div className="font-medium mb-1 text-red-300">妙手刊登异常详情</div>
                            <div className="break-words leading-relaxed">{publishResult.error || '发布失败'}</div>
                            <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </span>
                      )
                    }
                  } else {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-1 bg-gray-500/80 text-white text-xs rounded-full font-medium shadow-sm">
                        未刊登
                      </span>
                    )
                  }

                  // 右下角：标题按钮（失败态持久化，刷新后仍显红可重试）
                  const titleFailed = !!titleError || selectedFolder.titleGenStatus?.[group.groupName]?.status === 'failed'
                  let titleColor = 'bg-gray-400 text-white'
                  if (titleFailed) titleColor = 'bg-red-500 text-white'
                  else if (hasTitle || generatingGroups[group.groupName]) titleColor = 'bg-blue-500 text-white'

                  return (
                    <div
                      key={index}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all group cursor-pointer"
                      onClick={() => setSelectedGroup(group)}
                    >
                      <div className="relative aspect-[3/4] bg-gray-50">
                        {group.preview && (
                          <LazyImage
                            src={getImageUrl(group.preview)}
                            alt={group.groupName}
                            className="w-full h-full object-contain p-2"
                          />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteGroup(group.groupName)
                          }}
                          className="absolute top-2 right-2 p-2 bg-white rounded-lg shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>

                        {/* 底部状态徽标 */}
                        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between pointer-events-none">
                          {statusBadge}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleGenerateTitle(group.groupName) }}
                            disabled={generatingGroups[group.groupName]}
                            className={`pointer-events-auto inline-flex items-center space-x-1 px-2.5 py-1 ${titleColor} text-xs rounded-full font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-70`}
                            title={titleFailed ? `标题生成失败：${titleError || selectedFolder.titleGenStatus?.[group.groupName]?.error || ''}` : (hasTitle ? selectedFolder.generatedTitles?.[group.groupName] : '点击生成标题')}
                          >
                            {generatingGroups[group.groupName] ? <Loader2 className="w-3 h-3 animate-spin" /> : titleFailed ? <AlertCircle className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                            <span>{titleFailed ? '重试' : '标题'}</span>
                          </button>
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="font-medium text-gray-900 text-sm truncate mb-1">{group.groupName}</h4>
                        {group.colors && group.colors.length > 0 && (
                          <div className="flex -space-x-1.5 mt-1">
                            {group.colors.slice(0, 5).map((color, colorIndex) => (
                              <div
                                key={colorIndex}
                                className="w-6 h-6 rounded-full border-2 border-white overflow-hidden"
                              >
                                <LazyImage
                                  src={getImageUrl(color.url)}
                                  alt={color.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            ))}
                            {group.colors.length > 5 && (
                              <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium">
                                +{group.colors.length - 5}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {totalDisplayPages > 1 && (
                <div className="flex items-center justify-center space-x-2 mt-6">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    首页
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-600">
                    第 {currentPage} / {totalDisplayPages} 页
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalDisplayPages, currentPage + 1))}
                    disabled={currentPage === totalDisplayPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalDisplayPages)}
                    disabled={currentPage === totalDisplayPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    末页
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">暂无套图</h3>
              <p className="text-gray-500 mt-2">请先在"图案库"中生成套图</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">套图结果</h2>
          <p className="text-gray-500 mt-1">查看各文件夹的套图效果</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {folders.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {folders.map(folder => (
            <div
              key={folder.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
              onClick={() => handleSelectFolder(folder)}
            >
              <div className="aspect-[3/4] bg-gray-50 relative">
                {folder.mockups && folder.mockups.length > 0 && folder.mockups[0]?.preview ? (
                  <LazyImage
                    src={getImageUrl(folder.mockups[0].preview)}
                    alt={folder.mockups[0].groupName}
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-300" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-blue-500 text-white text-xs rounded font-medium">
                  {folder.mockups?.length || 0}组
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-medium text-gray-900 text-sm truncate">{folder.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{getTemplateName(folder.templateId)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">暂无套图结果</h3>
          <p className="text-gray-500 mt-2">请先在"图案库"中创建文件夹、上传图案并生成套图</p>
        </div>
      )}
      
      {/* 标题现已内联在各组卡片与详情中，不再使用独立弹窗 */}

      {/* 标题现已内联在各组卡片与详情中，不再使用独立弹窗 */}

    </div>
  )
}

export default MockupResult