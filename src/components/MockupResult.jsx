import { useState, useEffect, useRef, useReducer, useCallback, useMemo } from 'react'
import { flushSync, createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { apiRequest, getImageUrl, getBackendURL, getBaseURL, apiGetShops, apiGetSaveConfig,
  apiGetPublishTemplates, apiPublishFolder, apiRetryPublish, apiGetPublishResults, apiGenerateTitle, apiUpdateTitle, apiGetTitlePrompts,
  apiGetDxmTemplates, apiExportDxm, apiGetDxmTasks, apiCancelDxmTask, apiGenerateTitlesBatch, apiCancelTitleGen,
  apiGetTemuTemplates } from '../api/axios'
import { FolderOpen, Download, RefreshCw, ImageIcon, Eye, Trash2, X, Loader2, CheckCircle, AlertCircle, FolderOutput, Settings as SettingsIcon, Sparkles, Send, Edit3, RotateCcw, Move, Store, GripVertical, Search } from 'lucide-react'
import AdjustModal from './AdjustModal'
import ImageSearchPanel from './ImageSearchPanel'

// 色名 → 色块 hex（用于映射表左侧预览）
const COLOR_HEX = {
  '白': '#ffffff', '白色': '#ffffff', '米白': '#f5f5dc', '杏': '#f0c8a0', '杏色': '#f0c8a0',
  '黑': '#1f2937', '黑色': '#1f2937', '灰': '#9ca3af', '灰色': '#9ca3af', '深灰': '#4b5563', '深灰色': '#4b5563',
  '红': '#ef4444', '红色': '#ef4444', '胭脂红': '#c2185b', '酒红': '#7f1d1d',
  '蓝': '#3b82f6', '蓝色': '#3b82f6', '深蓝': '#1e3a8a', '深蓝色': '#1e3a8a', '宝蓝': '#1d4ed8', '天蓝': '#60a5fa', '藏青': '#1e3a5f',
  '绿': '#22c55e', '绿色': '#22c55e', '墨绿': '#064e3b',
  '咖啡': '#6f4e37', '咖啡色': '#6f4e37', '卡其': '#c3b091', '棕色': '#78350f',
  '粉': '#ec4899', '粉色': '#ec4899', '紫': '#8b5cf6', '紫色': '#8b5cf6', '黄': '#eab308', '黄色': '#eab308', '橙': '#f97316', '橙色': '#f97316'
}

// 修复类型 → 角标文案/样式（repairType 由后端返回，兼容旧数据无 repairType）
const REPAIR_LABELS = {
  'outline-glow':  { text: '已描边·光晕',   cls: 'bg-amber-100 text-amber-700 border-amber-200', title: '图案与衣服颜色太接近，已加柔光晕描边' },
  'outline-solid': { text: '已描边·实线',   cls: 'bg-amber-100 text-amber-700 border-amber-200', title: '图案与衣服颜色太接近，已加实线描边' },
  'invert':        { text: '已反色',         cls: 'bg-blue-100 text-blue-700 border-blue-200',     title: '图案与衣服颜色太接近，已智能反色' },
  'invert-fallback': { text: '反色+描边兜底', cls: 'bg-purple-100 text-purple-700 border-purple-200', title: '反色后对比度仍不足，已自动补描边兜底' },
  'invert-failed': { text: '反色后仍不清晰', cls: 'bg-red-100 text-red-700 border-red-200',        title: '反色后对比度仍不足，已保留原图' }
}
function getRepairLabel(type) {
  return REPAIR_LABELS[type] || { text: '已自动修复', cls: 'bg-amber-100 text-amber-700 border-amber-200', title: '图案与衣服颜色太接近，已自动修复' }
}

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
  const [shops, setShops] = useState([])
  const [selectedShopId, setSelectedShopId] = useState('all') // 当前筛选的店铺：'all' | 'shared' | shopId
  const [templates, setTemplates] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [showImageSearch, setShowImageSearch] = useState(false) // 以图搜图面板
  const [searchMatches, setSearchMatches] = useState(null) // 以图搜图命中: {type, results, matchMap, focusKey}
  const [mockupSearchTab, setMockupSearchTab] = useState('all') // 'all' | 'search'
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

  // ─── 微调印花位置 ───
  const [adjustColor, setAdjustColor] = useState(null)
  const adjustModalRef = useRef(null) // { color, ... } 打开微调弹窗

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

  // ─── TEMU 半托管一键上架 ───
  const [temuTemplates, setTemuTemplates] = useState([])
  const [selectedTemuTemplateId, setSelectedTemuTemplateId] = useState('')
  // 颜色映射直接用模板已存的 defaultColorMap（设置页配置），结果页不再维护本地副本
  const [temuModalOpen, setTemuModalOpen] = useState(false)
  const [temuColorWarnings, setTemuColorWarnings] = useState([])
  const [temuLogs, setTemuLogs] = useState([])
  const [temuListing, setTemuListing] = useState(false)
  const [temuPrice, setTemuPrice] = useState('')
  const [temuMock, setTemuMock] = useState(false) // 🧪 模拟模式：打 localhost:8787，跳过真实凭证
  const [temuExtInstalled, setTemuExtInstalled] = useState(false)
  // 扩展已重载但当前页面未刷新（content script 上下文失效）——需要用户硬刷新本页
  const [temuExtExpired, setTemuExtExpired] = useState(false)
  const temuRequestIdRef = useRef(null)
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

  // 加载默认输出路径与店铺列表(进入结果页时拉一次,够用——不依赖用户每次都重读)
  useEffect(() => {
    const loadDefaultPath = async () => {
      try {
        setIsLoadingSaveConfig(true)
        const [cfg, shopList] = await Promise.all([
          apiGetSaveConfig(),
          apiGetShops().catch(e => { console.error('加载店铺失败:', e); return [] })
        ])
        setDefaultOutputPath(cfg.defaultOutputPath || '')
        setHasDefaultOutputPath(!!cfg.hasDefaultOutputPath)
        setShops(shopList || [])
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

  // 从 URL hash 解析参数,支持新标签页直接打开指定组
  useEffect(() => {
    const parseHashAndNavigate = async () => {
      const hash = window.location.hash.slice(1)
      const parts = hash.split('/').filter(Boolean)
      // 格式: results/{folderId}/{groupName}
      if (parts.length >= 3 && parts[0] === 'results') {
        const folderId = parts[1]
        const groupName = decodeURIComponent(parts.slice(2).join('/')) // groupName 可能包含斜杠
        try {
          const data = await apiRequest(`/folders/${folderId}`)
          setSelectedFolder(data)
          const group = data.mockups?.find(m => m.groupName === groupName)
          if (group) {
            setSelectedGroup(group)
          } else {
            console.warn('未找到对应的组:', groupName)
          }
        } catch (e) {
          console.error('加载文件夹失败:', e)
        }
      }
    }
    parseHashAndNavigate()
    window.addEventListener('hashchange', parseHashAndNavigate)
    return () => window.removeEventListener('hashchange', parseHashAndNavigate)
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

  // 加载 TEMU 上架模板
  useEffect(() => {
    const load = async () => {
      try {
        const t = await apiGetTemuTemplates()
        setTemuTemplates(t || [])
      } catch (e) { console.error('加载 TEMU 模板失败:', e) }
    }
    load()
  }, [])

  // 监听扩展回传的进度/完成消息 + 探活
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data
      if (!d || !d.type) return
      if ((d.type === 'DD_TEMU_LISTING_PROGRESS' || d.type === 'DD_TEMU_LISTING_DONE') && d.requestId === temuRequestIdRef.current) {
        if (d.type === 'DD_TEMU_LISTING_PROGRESS') setTemuLogs(prev => [...prev, d.log])
        if (d.type === 'DD_TEMU_LISTING_DONE') {
          setTemuListing(false)
          if (d.ok) setTemuLogs(prev => [...prev, '✓ 上架完成: ' + (d.message || '')])
          else setTemuLogs(prev => [...prev, '✗ 失败: ' + (d.message || '未知错误')])
        }
      }
      // 扩展上下文失效 / 通信错误
      if (d.type === 'DD_TEMU_LISTING_ERROR' && d.requestId === temuRequestIdRef.current) {
        setTemuListing(false)
        setTemuLogs(prev => [...prev, '✗ 扩展错误: ' + (d.error || '未知')])
      }
      if (d.type === 'DD_TEMU_EXT_PONG') {
        // expired=true 表示扩展已重载但页面未刷新（content script 上下文失效）
        if (d.expired) {
          setTemuExtInstalled(false)
          setTemuExtExpired(true)
        } else {
          setTemuExtInstalled(true)
          setTemuExtExpired(false)
        }
      }
    }
    window.addEventListener('message', onMsg)
    const ping = setInterval(() => window.postMessage({ type: 'DD_TEMU_EXT_PING' }, '*'), 2000)
    return () => { window.removeEventListener('message', onMsg); clearInterval(ping) }
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
      const foldersWithMockups = data
        .filter(f => f.mockups && f.mockups.length > 0)
        .sort((a, b) => {
          // 套图结果页独立排序：优先 mockupResultSortOrder，回退 sortOrder（未单独拖过时跟随图案库），再回退 createdAt
          const oa = typeof a.mockupResultSortOrder === 'number' ? a.mockupResultSortOrder
            : (typeof a.sortOrder === 'number' ? a.sortOrder : Infinity)
          const ob = typeof b.mockupResultSortOrder === 'number' ? b.mockupResultSortOrder
            : (typeof b.sortOrder === 'number' ? b.sortOrder : Infinity)
          if (oa !== ob) return oa - ob
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return tb - ta
        })
      setFolders(foldersWithMockups)
    } catch (error) {
      console.error('加载文件夹失败:', error)
      showToast('加载文件夹失败', 'error')
    }
  }

  // 多店铺：按当前选中店铺过滤文件夹列表（套图结果继承所属文件夹的 shopIds）
  const filteredFolders = useMemo(() => {
    if (selectedShopId === 'all') return folders
    if (selectedShopId === 'shared') return folders.filter(f => (f.shopIds || []).length === 0)
    return folders.filter(f => {
      const ids = f.shopIds || []
      return ids.length === 0 || ids.includes(selectedShopId)
    })
  }, [folders, selectedShopId])

  // 套图结果页拖拽结束：本地即时重排 + 调 /folders/reorder（field=mockupResultSortOrder）落库，与图案库顺序解耦
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const handleMockupResultDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = filteredFolders.findIndex(f => f.id === active.id)
    const newIndex = filteredFolders.findIndex(f => f.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const orderedIds = arrayMove(filteredFolders, oldIndex, newIndex).map(f => f.id)
    setFolders(prev => {
      const from = prev.findIndex(f => f.id === active.id)
      const to = prev.findIndex(f => f.id === over.id)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
    try {
      await apiRequest('/folders/reorder', { method: 'POST', data: { orderedIds, field: 'mockupResultSortOrder' } })
    } catch (e) {
      console.error('套图结果排序保存失败:', e)
      loadFolders() // 失败回滚：重新拉取
    }
  }

  const loadTemplates = async () => {
    try {
      const templatesV2 = await apiRequest('/templates-v2')
      setTemplates(templatesV2)
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

  // 以图搜图命中后：在套图结果列表高亮命中组/颜色并切换到「搜索结果」视图
  const applySearchMatches = (result, results, type) => {
    const resultsArr = results || []
    const matchMap = {}
    for (const r of resultsArr) {
      if (r.url) matchMap[r.url] = r.similarity
      // mockup-pattern 结果用 groupName + colorName 做兜底匹配（URL 可能不一致）
      if (r.groupName && r.colorName) matchMap[`${r.groupName}///${r.colorName}`] = r.similarity
    }
    setSearchMatches({
      type,
      results: resultsArr,
      matchMap,
      queryName: result?.groupName || result?.colorName || '以图搜图',
      focusKey: result?.url || null,
    })
    setCurrentPage(1)
    setMockupSearchTab('search')
  }

  const clearSearchMatches = () => {
    setSearchMatches(null)
    setCurrentPage(1)
    setMockupSearchTab('all')
  }

  const locateInMockups = (url) => {
    setMockupSearchTab('all')
    setTimeout(() => {
      const el = document.querySelector('[data-search-focus="1"]')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
  }

  const handleDownloadSingle = async (url, name) => {
    try {
      const ext = (url.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/)?.[1] || 'jpg').toLowerCase()
      await downloadBlob(getImageUrl(url), `${name}.${ext}`)
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

  // 解析当前文件夹应使用的输出路径：单店铺且店铺配置路径 → 店铺路径；否则回退默认路径
  const resolveOutputPath = () => {
    const folderShopIds = selectedFolder?.shopIds || []
    if (folderShopIds.length === 1) {
      const shop = shops.find(s => s.id === folderShopIds[0])
      if (shop?.outputPath?.trim()) return shop.outputPath.trim()
    }
    return defaultOutputPath || ''
  }

  // ─── "保存到本地" handlers ───
  // 共享单页保存:走 save-to-disk 接口
  const handleSaveToDisk = async (page, pageSizeVal) => {
    if (!selectedFolder?.mockups || !selectedFolder.id || saveState.isSaving) return

    const effectiveOutputPath = resolveOutputPath()
    if (!effectiveOutputPath) {
      showToast('请先在「设置 → 通用」中配置默认输出路径，或为当前店铺配置导出路径', 'error')
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
          outputPath: effectiveOutputPath
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

    const effectiveOutputPath = resolveOutputPath()
    if (!effectiveOutputPath) {
      showToast('请先在「设置 → 通用」中配置默认输出路径，或为当前店铺配置导出路径', 'error')
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
            outputPath: effectiveOutputPath
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

  useEffect(() => {
    console.log('[state] adjustColor changed:', adjustColor?.name || adjustColor)
  }, [adjustColor])

  // ─── 微调保存回调：更新本地状态（含细节图 URL 缓存刷新） ───
  const handleAdjustSaved = (updatedColor) => {
    if (!selectedFolder?.mockups || !selectedGroup) return

    const ts = Date.now()
    const urlWithTs = (url) => {
      if (!url) return url
      const sep = url.includes('?') ? '&' : '?'
      return url + sep + '_t=' + ts
    }
    const reloadedColor = {
      ...updatedColor,
      url: urlWithTs(updatedColor.url),
      detailImages: (updatedColor.detailImages || []).map(di => ({
        ...di,
        url: urlWithTs(di.url),
      })),
    }

    // 更新 selectedFolder 中的 mockup 数据
    setSelectedFolder(prev => ({
      ...prev,
      mockups: prev.mockups.map(m => {
        if (m.groupName !== selectedGroup.groupName) return m
        return {
          ...m,
          colors: m.colors.map(c =>
            c.name === reloadedColor.name ? reloadedColor : c
          ),
        }
      }),
    }))

    // 更新 selectedGroup（当前详情页）
    setSelectedGroup(prev => ({
      ...prev,
      colors: prev.colors.map(c =>
        c.name === reloadedColor.name ? reloadedColor : c
      ),
    }))

    showToast('微调已保存', 'success')
  }

  // ─── 获取当前组的原图案文件（优先用后端生成的 patternFiles，老数据 fallback 到 folder.images）───
  const getGroupPatternFiles = (group) => {
    if (group?.patternFiles && group.patternFiles.length > 0) return group.patternFiles
    if (!selectedFolder?.images || !group?.groupName) return []
    const areaCount = parseInt(selectedFolder.areaCount) || 1
    const gn = group.groupName
    const images = selectedFolder.images
    if (areaCount === 1) {
      return images
        .filter(im => im.name.replace(/\.\w+$/, '') === gn)
        .map(im => ({ url: im.path || `/uploads/folders/${selectedFolder.id}/${im.name}`, name: im.name }))
    }
    return images
      .filter(im => {
        const base = im.name.replace(/\.\w+$/, '')
        return base === gn || new RegExp('^' + gn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d+$').test(base)
      })
      .sort((a, b) => {
        const na = parseInt(a.name.replace(/\.\w+$/, '').split('-').pop()) || 0
        const nb = parseInt(b.name.replace(/\.\w+$/, '').split('-').pop()) || 0
        return na - nb
      })
      .map((im, idx) => ({ url: im.path || `/uploads/folders/${selectedFolder.id}/${im.name}`, name: `区域${idx + 1}` }))
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

  // ─── 叮当 → TEMU 半托管一键上架 ───
  const handleOpenTemuModal = () => {
    const tid = selectedTemuTemplateId
    if (!tid) { showToast('请先选择 TEMU 模板', 'error'); return }
    const tpl = temuTemplates.find(t => t.id === tid)
    if (!tpl) { showToast('模板不存在', 'error'); return }
    // 颜色映射直接用模板已存的 defaultColorMap（设置页配置）
    const colorMap = tpl.defaultColorMap || {}
    const mockColorNames = new Set()
    ;(selectedFolder?.mockups || []).forEach(g => (g.colors || []).forEach(c => mockColorNames.add(c.name)))
    const warns = []
    ;(tpl.colorSlots || []).forEach(slot => {
      const erp = colorMap[slot] || slot
      if (!mockColorNames.has(erp)) warns.push(`色槽「${slot}」→ 图套色「${erp}」在当前文件夹中不存在`)
    })
    setTemuColorWarnings(warns)
    setTemuLogs([])
    const fallback = (selectedFolder?.titleMeta?.price) || tpl.skeleton?.goodsPrice || ''
    setTemuPrice(fallback)
    setTemuModalOpen(true)
  }

  const handleTemuListing = () => {
    const tid = selectedTemuTemplateId
    const tpl = temuTemplates.find(t => t.id === tid)
    if (!tpl) { showToast('模板不存在', 'error'); return }
    const imagesByColor = {}
    ;(selectedFolder?.mockups || []).forEach(g => (g.colors || []).forEach(c => {
      imagesByColor[c.name] = {
        main: getImageUrl(c.url),
        preview: getImageUrl(c.preview),
        details: (c.detailImages || []).map(d => getImageUrl(d.url))
      }
    }))
    const firstGroup = (selectedFolder?.mockups || [])[0]
    const zhTitle = (selectedFolder?.generatedTitles && firstGroup) ? selectedFolder.generatedTitles[firstGroup.groupName] : ''
    const content = {
      titles: zhTitle ? { zh: zhTitle } : {},
      goodsPrice: temuPrice === '' ? undefined : Number(temuPrice),
      description: selectedFolder?.titleMeta?.description || '',
      tags: selectedFolder?.titleMeta?.tags || []
    }
    // 把模板的颜色↔ERP SKU 映射（colorSlotConfig）转为 colorAliases 格式发给扩展
    const mappingAliases = (tpl.colorSlotConfig || []).map((c) => ({
      templateColorSlot: c.slot, erpColorName: c.erpSku
    })).filter(m => m.erpColorName)
    const requestId = 'temu_' + Date.now()
    temuRequestIdRef.current = requestId
    setTemuListing(true)
    setTemuLogs(prev => [...prev, '已发送上架请求到扩展，等待处理...'])
    window.postMessage({
      type: 'DD_TEMU_LISTING_REQUEST',
      requestId,
      data: {
        folderName: selectedFolder?.name,
        template: { id: tpl.id, name: tpl.name, colorSlots: tpl.colorSlots, colorSlotConfig: tpl.colorSlotConfig || [], detailUseMainImage: tpl.detailUseMainImage !== false, skeleton: tpl.skeleton },
        content,
        colorAliases: mappingAliases,
        imagesByColor,
        mock: temuMock
      }
    }, '*')
    setTimeout(() => {
      if (temuRequestIdRef.current === requestId && temuListing) {
        setTemuLogs(prev => [...prev, '⏱ 未收到扩展响应：请确认已安装「叮当TEMU上架」扩展且已登录 TEMU 卖家中心'])
      }
    }, 8000)
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
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{selectedGroup.groupName}</h2>
                {selectedGroup.colors?.some(c => c.autoRepaired) && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-lg shadow-sm"
                    title="该组部分图案与衣服颜色太接近，已自动修复（描边或反色）"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    自动修复
                  </span>
                )}
              </div>
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

          {/* ─── 原图案（生产用透明 PNG）─── */}
          {(() => {
            const patternFiles = getGroupPatternFiles(selectedGroup)
            if (!patternFiles || patternFiles.length === 0) return null
            return (
              <div className="bg-blue-50/60 rounded-xl border border-blue-100 p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  {selectedGroup.colors?.some(c => c.autoRepaired) ? (
                    <>
                      <ImageIcon className="w-4 h-4 text-amber-500" />
                      生产原图
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium border border-amber-200">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        已自动修复
                      </span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 text-blue-500" />
                      原图案
                      <span className="text-xs font-normal text-gray-500">（生产用透明 PNG）</span>
                    </>
                  )}
                  </h3>
                  <span className="text-xs text-gray-500">{patternFiles.length} 张</span>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                  {patternFiles.map((pf, idx) => (
                    <div
                      key={idx}
                      className="aspect-square rounded-lg overflow-hidden border border-gray-200 relative group cursor-pointer"
                      style={{
                        backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                        backgroundSize: '10px 10px',
                        backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                        backgroundColor: '#ffffff'
                      }}
                      onClick={() => window.open(getImageUrl(pf.url), '_blank')}
                      title={pf.name}
                    >
                      <LazyImage
                        src={getImageUrl(pf.url)}
                        alt={pf.name}
                        className="w-full h-full object-contain p-1"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="flex space-x-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadSingle(pf.url, `${selectedGroup.groupName}_pattern_${idx + 1}`); }}
                            className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                          >
                            下载
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(getImageUrl(pf.url), '_blank'); }}
                            className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                          >
                            预览
                          </button>
                        </div>
                      </div>
                      {patternFiles.length > 1 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                          <p className="text-white text-[10px] text-center truncate">{pf.name}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {selectedGroup.colors && selectedGroup.colors.length > 0 ? (
            <div className="space-y-5">
              {/* 颜色数量统计 */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">各颜色套图</h3>
                <span className="text-sm text-gray-500">
                  共 {selectedGroup.colors.length} 个颜色
                </span>
              </div>

              {/* 方案A：纵向堆叠颜色区块 */}
              {selectedGroup.colors.map((color, index) => (
                <div key={index} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* 颜色区块头部 */}
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center space-x-3">
                      <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: color.colorCode || '#6b7280' }} />
                      <span className="text-sm font-bold text-gray-900">{color.name}</span>
                      {color.autoRepaired && (() => {
                        const lb = getRepairLabel(color.repairType)
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${lb.cls}`} title={lb.title}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            {lb.text}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          console.log('[微调] 点击颜色:', color.name, 'templateId:', selectedFolder?.templateId)
                          flushSync(() => setAdjustColor(color))
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs hover:border-blue-400 hover:text-blue-600 transition-colors"
                        title="微调印花位置"
                      >
                        <Move className="w-3.5 h-3.5" />
                        <span>微调</span>
                      </button>
                      <button
                        onClick={() => handleDownloadSingle(color.url, `${selectedGroup.groupName}_${color.name}`)}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-gray-900/70 text-white rounded-lg text-xs hover:bg-gray-900/90 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>下载主图</span>
                      </button>
                      <button
                        onClick={() => window.open(getImageUrl(color.url), '_blank')}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-gray-900/70 text-white rounded-lg text-xs hover:bg-gray-900/90 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>预览</span>
                      </button>
                    </div>
                  </div>

                  {/* ─── 该颜色使用的生产原图（自动修复过的颜色展示对应的描边版）─── */}
                  {(() => {
                    // 优先用该颜色专属的生产版图案，确保描边颜色对应实际衣服
                    const pfs = (color.prodPatterns && color.prodPatterns.length > 0)
                      ? color.prodPatterns
                      : getGroupPatternFiles(selectedGroup)
                    if (!pfs || pfs.length === 0) return null
                    const hasRepair = color.autoRepaired
                    return (
                      <div className="px-5 py-2 border-b border-gray-100 bg-blue-50/40 flex items-center gap-3">
                        <span className="text-[11px] text-gray-500 font-medium flex-shrink-0">生产原图</span>
                        {hasRepair && (() => {
                          const lb = getRepairLabel(color.repairType)
                          return (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${lb.cls}`} title={lb.title}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                              {lb.text}
                            </span>
                          )
                        })()}
                        <div className="flex gap-1.5">
                          {pfs.map((pf, idx) => (
                            <div
                              key={idx}
                              className="w-10 h-10 rounded border border-gray-200 overflow-hidden flex-shrink-0 cursor-pointer"
                              style={{
                                backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                                backgroundSize: '6px 6px',
                                backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                                backgroundColor: '#ffffff'
                              }}
                              onClick={() => window.open(getImageUrl(pf.url), '_blank')}
                              title={pf.name}
                            >
                              <LazyImage
                                src={getImageUrl(pf.url)}
                                alt={pf.name}
                                className="w-full h-full object-contain p-0.5"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* 颜色区块内容：主图 + 细节图 */}
                  <div className="p-5 space-y-4">
                    {/* 主图区 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">主图</h4>
                        <span className="text-xs text-gray-400">{color.preview ? 2 : 1} 张</span>
                      </div>
                      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                        {/* 主图1：color.url */}
                        <div
                          className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-white relative group cursor-pointer"
                          onClick={() => window.open(getImageUrl(color.url), '_blank')}
                        >
                          <LazyImage
                            src={getImageUrl(color.url)}
                            alt={`${selectedGroup.groupName}_${color.name}_main`}
                            className="w-full h-full object-contain p-1"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <div className="flex space-x-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownloadSingle(color.url, `${selectedGroup.groupName}_${color.name}_main`); }}
                                className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                              >
                                下载
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); window.open(getImageUrl(color.url), '_blank'); }}
                                className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                              >
                                预览
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* 主图2：color.preview（如果存在） */}
                        {color.preview && (
                          <div
                            className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-white relative group cursor-pointer"
                            onClick={() => window.open(getImageUrl(color.preview), '_blank')}
                          >
                            <LazyImage
                              src={getImageUrl(color.preview)}
                              alt={`${selectedGroup.groupName}_${color.name}_preview`}
                              className="w-full h-full object-contain p-1"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <div className="flex space-x-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDownloadSingle(color.preview, `${selectedGroup.groupName}_${color.name}_mockup`); }}
                                  className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                                >
                                  下载
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); window.open(getImageUrl(color.preview), '_blank'); }}
                                  className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                                >
                                  预览
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 细节图区 */}
                    {color.detailImages && color.detailImages.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">细节图</h4>
                          <span className="text-xs text-gray-400">{color.detailImages.length} 张</span>
                        </div>
                        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                          {color.detailImages.map((detailImg, detailIndex) => (
                            <div
                              key={detailIndex}
                              className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-white relative group cursor-pointer"
                              onClick={() => window.open(getImageUrl(detailImg.url), '_blank')}
                            >
                              <LazyImage
                                src={getImageUrl(detailImg.url)}
                                alt={detailImg.label}
                                className="w-full h-full object-contain p-1"
                              />
                              {/* hover 操作层 */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDownloadSingle(detailImg.url, `${selectedGroup.groupName}_${color.name}_${detailImg.label}`); }}
                                    className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                                  >
                                    下载
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); window.open(getImageUrl(detailImg.url), '_blank'); }}
                                    className="px-2 py-1 bg-white text-gray-900 rounded text-xs font-medium hover:bg-gray-100"
                                  >
                                    预览
                                  </button>
                                </div>
                              </div>
                              {/* 底部标签 */}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                                <p className="text-white text-[10px] text-center truncate">{detailImg.label}</p>
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

        {/* 微调印花位置弹窗 */}
        {adjustColor && (
          <AdjustModal
            open={!!adjustColor}
            onClose={() => setAdjustColor(null)}
            folderId={selectedFolder?.id}
            groupName={selectedGroup?.groupName}
            color={adjustColor}
            templateId={selectedFolder?.templateId}
            onSaved={handleAdjustSaved}
          />
        )}
      </div>
    )
  }

  if (selectedFolder) {
    const filteredMockups = (mockupSearchTab === 'search' && searchMatches)
      ? (selectedFolder.mockups || []).filter(g => searchMatches.results.some(r => r.groupName === g.groupName))
      : (selectedFolder.mockups || [])
    const totalItems = filteredMockups.length
    const totalDisplayPages = displayPageSize >= 9999 ? 1 : Math.ceil(totalItems / displayPageSize)
    const startIndex = (currentPage - 1) * displayPageSize
    const endIndex = displayPageSize >= 9999 ? totalItems : Math.min(startIndex + displayPageSize, totalItems)
    const pagedMockups = filteredMockups.slice(startIndex, endIndex)

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
              {/* 左组：保存（flex-1 占一半，前面加文字标识；三个操作组件等宽均分剩余空间） */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">保存</span>
                <select
                  value={downloadState.pageSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    dispatch({ type: 'SET_PAGE_SIZE', payload: v })
                    saveDispatch({ type: 'SET_PAGE_SIZE_SAVE', payload: v })
                  }}
                  className="flex-1 min-w-0 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  title="每页显示条数"
                >
                  <option value={10}>每页10</option>
                  <option value={20}>每页20</option>
                  <option value={50}>每页50</option>
                  <option value={100}>每页100</option>
                  <option value={200}>每页200</option>
                </select>
                {/* 下载按钮占 1/3，整格宽度 */}
                <div className="flex-1 min-w-0">
                  {downloadState.isDownloadingAllPages || downloadState.isDownloading ? (
                    <button
                      onClick={handleCancelDownload}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>取消下载</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDownloadAllPages}
                      disabled={!selectedFolder?.mockups || selectedFolder.mockups.length === 0}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Download className="w-4 h-4" />
                      <span>下载</span>
                    </button>
                  )}
                </div>
                {/* 保存到本地按钮占 1/3，整格宽度 */}
                <div className="flex-1 min-w-0">
                  {saveState.isSavingAllPages || saveState.isSaving ? (
                    <button
                      onClick={handleCancelSave}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>取消保存</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveAllPages}
                      disabled={!selectedFolder?.mockups || selectedFolder.mockups.length === 0 || !resolveOutputPath()}
                      title={!resolveOutputPath() ? '请先在「设置 → 通用」中配置默认输出路径，或为当前店铺配置导出路径' : '按 R01 规定的目录树直接展开到本地路径'}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-allowed"
                    >
                      <FolderOutput className="w-4 h-4" />
                      <span>保存到本地</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 中央竖分隔条 */}
              <div className="w-px h-5 bg-gray-200 shrink-0" />

              {/* 右组：生成标题（flex-1 占另一半，前面加文字标识） */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap">生成标题</span>
                <select
                  value={selectedTitlePromptId}
                  onChange={(e) => setSelectedTitlePromptId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-0"
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
          </div>

          <div className="border-t border-gray-100" />

          {/* 下区：外部平台（店小秘 / 妙手 / 叮当内测） */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-green-500 rounded-full" />
              <span className="text-sm font-medium text-gray-700">外部平台</span>
              <span className="text-xs text-gray-400">店小秘 / 妙手 / 叮当</span>
            </div>
            <div className="flex items-stretch gap-3 flex-wrap">
              {/* 店小秘导出：标签 + 模板选择 + 操作按钮 内聚为一个迷你表单 */}
              <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                <span className="text-xs font-medium text-gray-500">店小秘</span>
                <select
                  value={selectedDxmTemplateId}
                  onChange={(e) => setSelectedDxmTemplateId(e.target.value)}
                  className="min-w-0 flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
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
              <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                <span className="text-xs font-medium text-gray-500">妙手代理</span>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="min-w-0 flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

            {/* 分隔线：把内测的「叮当→TEMU」和正式功能分开 */}
            <div className="my-3 border-t border-dashed border-gray-200" />

            {/* 下排：叮当 → TEMU 一键上架（内测，单独成行） */}
            <div className="flex items-center gap-2 px-3 py-2 border border-purple-200 rounded-lg bg-purple-50/60">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-600 text-white text-[10px] font-semibold rounded whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                内测中
              </span>
              <span className="text-xs font-medium text-purple-700">叮当→TEMU</span>
              <select
                value={selectedTemuTemplateId}
                onChange={(e) => setSelectedTemuTemplateId(e.target.value)}
                className="w-44 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- 选择 TEMU 模板 --</option>
                {temuTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name} ({(tpl.colorSlots || []).length}色)</option>
                ))}
              </select>
              {!temuExtInstalled && (
                temuExtExpired ? (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded whitespace-nowrap"
                    title="扩展已更新，当前页面需刷新才能重新连接"
                  >
                    扩展已更新 · 点击刷新页面
                  </button>
                ) : (
                  <span className="text-xs text-amber-600 whitespace-nowrap" title="未检测到扩展">扩展未连接</span>
                )
              )}
              <button
                type="button"
                onClick={handleOpenTemuModal}
                disabled={!selectedFolder?.mockups?.length || !selectedTemuTemplateId}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span>一键上架</span>
              </button>
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

        {/* 叮当 → TEMU 一键上架确认弹窗 */}
        {temuModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4" onClick={() => !temuListing && setTemuModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">确认一键上架到 TEMU（半托管）</h3>
                <button onClick={() => !temuListing && setTemuModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-600 mb-3">将把当前文件夹 {selectedFolder?.mockups?.length || 0} 个设计组的套图，套入所选 TEMU 模板骨架并上架。</p>
              {temuColorWarnings.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-sm text-amber-800 space-y-1">
                  <p className="font-medium">以下颜色映射未匹配到套图（对应图片将留空）：</p>
                  {temuColorWarnings.map((w, i) => <p key={i}>· {w}</p>)}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm text-green-700">颜色映射全部匹配 ✓</div>
              )}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">申报价 (¥)</label>
                <input type="text" value={temuPrice} onChange={(e) => setTemuPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <label className="flex items-center space-x-2 mb-3 text-sm text-gray-700 cursor-pointer select-none">
                <input type="checkbox" checked={temuMock} onChange={(e) => setTemuMock(e.target.checked)} className="w-4 h-4" />
                <span>🧪 模拟模式（打 localhost:8787，跳过真实 Anti-Content / Mallid 校验）</span>
              </label>
              {(temuListing || temuLogs.length > 0) && (
                <div className="bg-gray-900 text-gray-100 rounded-lg p-3 mb-3 font-mono text-xs space-y-1 max-h-56 overflow-y-auto">
                  {temuLogs.length === 0 ? <p>等待开始...</p> : temuLogs.map((log, i) => <p key={i} className="truncate">{log}</p>)}
                  {temuListing && <p className="animate-pulse text-purple-300">处理中...</p>}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button onClick={() => { if (!temuListing) setTemuModalOpen(false); }} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
                <button onClick={handleTemuListing} disabled={temuListing} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2 disabled:opacity-50">
                  {temuListing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{temuListing ? '上架中...' : '确认上架'}</span>
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
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setMockupSearchTab('all')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                      mockupSearchTab === 'all' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    全部
                  </button>
                  {searchMatches && searchMatches.results.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMockupSearchTab('search')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                        mockupSearchTab === 'search' ? 'bg-amber-100 text-amber-700' : 'text-amber-700 hover:bg-amber-50'
                      }`}
                    >
                      搜索结果 {searchMatches.results.length}
                    </button>
                  )}
                </div>
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
                    共 {totalItems} 个图案组
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

              {mockupSearchTab === 'search' && searchMatches && (
                <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
                  <span className="text-sm text-amber-800">
                    来自以图搜图：命中 <b>{searchMatches.results.length}</b> 个颜色
                    {searchMatches.type === 'mockup-pattern' ? '（引用该图案的套图）' : '（相似成品图）'}
                  </span>
                  <button onClick={clearSearchMatches} className="text-xs text-amber-700 underline hover:text-amber-900">清除高亮</button>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {pagedMockups.map((group, index) => {
                  const publishResult = publishResults?.find(r => r.groupName === group.groupName)
                  const isPublishingGroup = isPublishing && !publishResult
                  const hasTitle = !!selectedFolder.generatedTitles?.[group.groupName]
                  const titleError = titleErrors[group.groupName]
                  const hasAutoRepaired = group.colors?.some(c => c.autoRepaired)
                  const isSearchHit = searchMatches && searchMatches.results.some(r => r.groupName === group.groupName)
                  const searchHitCount = isSearchHit ? group.colors.filter(c => searchMatches.results.some(r => r.groupName === group.groupName && r.colorName === c.name)).length : 0
                  const isSearchFocus = searchMatches?.focusKey && searchMatches.results.some(r => r.groupName === group.groupName && (r.url === searchMatches.focusKey || `${r.groupName}///${r.colorName}` === searchMatches.focusKey))

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
                      className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all group cursor-pointer ${
                        isSearchHit ? 'border-amber-500 ring-2 ring-amber-200' : 'border-gray-200'
                      }`}
                      data-search-focus={isSearchFocus ? '1' : undefined}
                      onClick={(e) => {
                        // 默认新标签页打开;Ctrl/Cmd+点击在当前页切换
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedGroup(group)
                        } else {
                          e.preventDefault()
                          const hash = `#results/${selectedFolder.id}/${encodeURIComponent(group.groupName)}`
                          window.open(hash, '_blank')
                        }
                      }}
                    >
                      <div className="relative aspect-[3/4] bg-gray-50">
                        {group.preview && (
                          <LazyImage
                            src={getImageUrl(group.preview)}
                            alt={group.groupName}
                            className="w-full h-full object-contain p-2"
                          />
                        )}

                        {/* 自动修复标识：小黄点 */}
                        {hasAutoRepaired && (
                          <div
                            className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white shadow-sm z-10"
                            title="该组部分图案与衣服颜色太接近，已自动修复（描边或反色）"
                          />
                        )}

                        {/* 以图搜图命中标识 */}
                        {isSearchHit && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-medium shadow-sm">
                            命中 {searchHitCount} 色
                          </div>
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
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>
          <button
            onClick={() => setShowImageSearch(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            title="以图搜图：上传一张图案或成品图，查找相关的套图结果"
          >
            <Search className="w-4 h-4" />
            <span>以图搜图</span>
          </button>
          {shops.length > 0 && (
            <div className="relative flex-shrink-0">
              <Store className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedShopId}
                onChange={(e) => {
                  const v = e.target.value
                  setSelectedShopId(v)
                  // 当前打开的文件夹若被新筛选隐藏，则自动收起详情，避免查看错位
                  if (selectedFolder) {
                    const ids = selectedFolder.shopIds || []
                    const visible = v === 'all' || (v === 'shared' ? ids.length === 0 : (ids.length === 0 || ids.includes(v)))
                    if (!visible) setSelectedFolder(null)
                  }
                }}
                className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 text-sm font-medium text-gray-700 cursor-pointer appearance-none"
              >
                <option value="all">全店</option>
                <option value="shared">共享未分配</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {filteredFolders.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMockupResultDragEnd}>
          <SortableContext items={filteredFolders.map(f => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredFolders.map(folder => (
                <SortableFolderItem key={folder.id} id={folder.id}>
                  {({ dragHandleProps }) => (
                  <div
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group relative"
                  >
                    <div
                      {...dragHandleProps}
                      className="absolute top-2 left-2 z-10 p-1 rounded bg-white/80 hover:bg-white shadow-sm cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                      title="拖拽排序"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div
                      className="cursor-pointer"
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
                  </div>
                  )}
                </SortableFolderItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

      {/* 以图搜图面板 */}
      {showImageSearch && (
        <ImageSearchPanel
          defaultScope="mockup-results"
          defaultSearchBy="pattern"
          patternOptions={[]}
          onClose={() => setShowImageSearch(false)}
          onOpenMockup={(r, results) => {
            applySearchMatches(r, results, r.type)
            handleSelectFolder({ id: r.folderId, name: r.folderName })
            setShowImageSearch(false)
          }}
        />
      )}

    </div>
  )
}

// 套图结果页可拖拽卡片容器：拖拽手柄由 children 通过 dragHandleProps 放置（与图案库 SortableFolderItem 同模式）
function SortableFolderItem({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto'
  }
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : undefined}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  )
}

export default MockupResult