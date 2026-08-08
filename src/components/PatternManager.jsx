import { useState, useEffect, useRef } from 'react'
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
import { apiRequest, apiUpload, getImageUrl, apiStartCopyrightCheckTask, apiCopyrightCheckSingle } from '../api/axios'
import { getDuplicateIndex, getDuplicateSettings, saveDuplicateSettings, startScanAllDuplicates, getScanStatus, clearDuplicateIndex, ignoreDuplicateGroup, unignoreDuplicateGroup, getIgnoredGroups } from '../api/duplicate'
import { Plus, Trash2, Search, Upload, FolderOpen, ChevronRight, ChevronLeft, Wand2, CheckCircle2, X, ImageIcon, Shield, AlertTriangle, CheckCircle, HelpCircle, Loader2, Info, RefreshCw, FileText, Pencil, Copy, Settings2, AlertCircle, Group, GripVertical, LayoutGrid, List, Eye, Tag } from 'lucide-react'
import FileRenameTool from './FileRenameTool'

// 组内可拖拽图片：仅包裹一层 sortable，内容由 children 传入
function SortableGroupImage({ id, children, dragging }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled: dragging });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative bg-gray-50 rounded-lg overflow-hidden group touch-none ${
        isDragging ? 'opacity-50 ring-2 ring-blue-400 shadow-lg' : ''
      }`}
    >
      {children}
    </div>
  );
}

function PatternManager() {
  const [folders, setFolders] = useState([])
  const [templates, setTemplates] = useState([])
  const [products, setProducts] = useState([]) // 新增：商品列表
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFolder, setNewFolder] = useState({ name: '', areaCount: 2 })
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCount, setUploadCount] = useState({ current: 0, total: 0 })
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isCheckingCopyright, setIsCheckingCopyright] = useState(false)
  const [showCopyrightModal, setShowCopyrightModal] = useState(false)
  const [selectedImageDetail, setSelectedImageDetail] = useState(null)
  const [recheckingImage, setRecheckingImage] = useState(null)
  const [autoGrouping, setAutoGrouping] = useState(false)
  const [reorderingArea, setReorderingArea] = useState(false)

  // ─── 模板选择器弹窗相关 state ───
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [pickerProductId, setPickerProductId] = useState('all')
  const [pickerTagId, setPickerTagId] = useState(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerOnlyMatchArea, setPickerOnlyMatchArea] = useState(true)
  const [tempSelectedId, setTempSelectedId] = useState('')

  const [folderViewMode, setFolderViewMode] = useState(() => {
    try {
      return localStorage.getItem('patternManager_folderViewMode') || 'grid'
    } catch {
      return 'grid'
    }
  })
  const fileInputRef = useRef(null)
  const copyrightSubmittingRef = useRef(false)

  // 文件夹视图模式持久化
  useEffect(() => {
    try {
      localStorage.setItem('patternManager_folderViewMode', folderViewMode)
    } catch {}
  }, [folderViewMode])

  // 组内拖拽传感器：移动超过 5px 才触发拖拽，避免和点击按钮冲突
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // 二级 tab：'images' 显示原图案库，'rename' 显示文件名整理工具，'duplicate' 显示重复检测
  const [activeSubTab, setActiveSubTab] = useState('images')

  // ─── 重复检测扫描状态 ───
  const [scanRunning, setScanRunning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const [scanResult, setScanResult] = useState(null)
  const [scanError, setScanError] = useState('')
  const [scanPollTimer, setScanPollTimer] = useState(null)

  // 文件夹重命名编辑态
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const editingIdRef = useRef(null)

  // ─── 重复检测 ───
  const [duplicateIndex, setDuplicateIndex] = useState([])
  const [dupDetailFolderId, setDupDetailFolderId] = useState(null) // 展开重复详情面板的文件夹 id
  const [dupDeleting, setDupDeleting] = useState(false)
  const [dupToast, setDupToast] = useState('')
  // 空闲自动扫描
  const [idleScanConfig, setIdleScanConfig] = useState({ idleScan: false, idleScanSeconds: 60 })
  const [idleScanning, setIdleScanning] = useState(false)
  const idleTimerRef = useRef(null)
  const idleScanningRef = useRef(false)
  // 忽略分组
  const [dupIgnoredSubTab, setDupIgnoredSubTab] = useState('active') // 'active' | 'ignored'
  const [ignoredGroups, setIgnoredGroups] = useState([])
  const [ignoredGroupIds, setIgnoredGroupIds] = useState([])
  const [ignoredSummary, setIgnoredSummary] = useState({ totalRawGroups: 0, visibleGroups: 0 })

  useEffect(() => {
    loadFolders()
    loadTemplates()
    loadProducts()
    loadIdleScanConfig()
  }, [])

  // 由 Python 启动器「选文件夹并打开」跳转而来：自动切到「文件名整理」二级 tab
  useEffect(() => {
    const applyHashTool = () => {
      try {
        const hash = window.location.hash || ''
        const qIndex = hash.indexOf('?')
        const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '')
        const tool = params.get('tool')
        const tab = params.get('tab')
        if (tool === 'file-rename') {
          setActiveSubTab('rename')
        } else if (tab === 'duplicate') {
          setActiveSubTab('duplicate')
        }
      } catch {}
    }
    applyHashTool()
    window.addEventListener('hashchange', applyHashTool)
    return () => window.removeEventListener('hashchange', applyHashTool)
  }, [])

  const loadFolders = async () => {
    try {
      const data = await apiRequest('/folders')
      const sorted = [...data].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return tb - ta
      })
      setFolders(sorted)
    } catch (error) {
      console.error('加载文件夹失败:', error)
    }
    loadDuplicateIndex()
  }

  const loadDuplicateIndex = async () => {
    try {
      const idx = await getDuplicateIndex()
      setDuplicateIndex(Array.isArray(idx) ? idx : [])
    } catch (e) {
      setDuplicateIndex([])
    }
  }

  // 加载空闲扫描配置
  const loadIdleScanConfig = async () => {
    try {
      const cfg = await getDuplicateSettings()
      setIdleScanConfig({ idleScan: !!cfg.idleScan, idleScanSeconds: cfg.idleScanSeconds || 60 })
    } catch (e) {
      // 静默
    }
  }

  // 空闲触发全库扫描（轮询 scan-status 直到完成）
  const doIdleScan = async () => {
    if (idleScanningRef.current) return
    idleScanningRef.current = true
    setIdleScanning(true)
    showDupToast('空闲自动扫描中...')
    try {
      await startScanAllDuplicates({})
      // 轮询
      await new Promise(resolve => {
        const poll = async () => {
          try {
            const st = await getScanStatus()
            if (!st.running) { resolve(); return }
            setTimeout(poll, 1500)
          } catch {
            setTimeout(poll, 3000)
          }
        }
        setTimeout(poll, 1500)
      })
      // 完成，刷新索引 + 文件夹列表
      await loadDuplicateIndex()
      await loadFolders()
      // 取结果汇总
      try {
        const st = await getScanStatus()
        if (st.result) {
          showDupToast(`全库扫描完成：发现 ${st.result.totalGroups || 0} 组重复，涉及 ${st.result.scannedFolders || 0} 个文件夹`)
        } else {
          showDupToast('全库扫描完成')
        }
      } catch {
        showDupToast('全库扫描完成')
      }
    } catch (e) {
      // 409 等错误静默（可能已有手动扫描在跑）
    } finally {
      idleScanningRef.current = false
      setIdleScanning(false)
    }
  }

  // 空闲扫描：监听用户操作，无操作满 idleScanSeconds 触发
  useEffect(() => {
    if (!idleScanConfig.idleScan) return
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        doIdleScan()
      }, idleScanConfig.idleScanSeconds * 1000)
    }
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }))
    resetIdle() // 启动时开始计时
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetIdle))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleScanConfig.idleScan, idleScanConfig.idleScanSeconds])

  // 计算某文件夹参与跨文件夹重复的图片数与类型
  // 返回 { count, hasExact, hasSimilar }
  const getFolderDupInfo = (folderId) => {
    let count = 0
    let hasExact = false
    let hasSimilar = false
    const seen = new Set()
    for (const group of duplicateIndex) {
      const inThis = (group.images || []).find(im => im.folderId === folderId)
      if (!inThis) continue
      // 用 imageName 去重（同一张图可能参与多个 similar 组）
      const key = inThis.imageName
      if (seen.has(key)) continue
      seen.add(key)
      count++
      if (group.type === 'exact') hasExact = true
      else hasSimilar = true
    }
    return { count, hasExact, hasSimilar }
  }

  // 取某文件夹中参与重复的图片明细：[{ imageName, path, type, matches:[{folderId,folderName,imageName,path}] }]
  const getFolderDupDetails = (folderId) => {
    const map = new Map()
    for (const group of duplicateIndex) {
      const imgs = group.images || []
      const mine = imgs.find(im => im.folderId === folderId)
      if (!mine) continue
      if (!map.has(mine.imageName)) {
        map.set(mine.imageName, { imageName: mine.imageName, path: mine.path, type: group.type, matches: [] })
      }
      const entry = map.get(mine.imageName)
      // 类型升级：若任一组为 exact，则标 exact
      if (group.type === 'exact' && entry.type !== 'exact') entry.type = 'exact'
      for (const im of imgs) {
        if (im.folderId === folderId && im.imageName === mine.imageName) continue
        // 去重对方条目
        if (entry.matches.some(m => m.folderId === im.folderId && m.imageName === im.imageName)) continue
        entry.matches.push({ folderId: im.folderId, folderName: im.folderName, imageName: im.imageName, path: im.path })
      }
    }
    return Array.from(map.values())
  }

  // 判断单张图片是否重复，返回 { dup: boolean, type, matches } 或 null
  const getImageDupInfo = (folderId, imageName) => {
    const details = getFolderDupDetails(folderId)
    const found = details.find(d => d.imageName === imageName)
    return found || null
  }

  // 详情页重复标记展开 state
  const [detailDupPopup, setDetailDupPopup] = useState(null) // { imageName, type, matches }

  // 删除重复图片（当前文件夹或对方文件夹），无 confirm，按用户偏好
  const handleDeleteDupImage = async (folderId, fileName) => {
    setDupDeleting(true)
    try {
      await apiRequest(`/folders/${folderId}/images/${fileName}`, { method: 'DELETE' })
      // 刷新重复索引 + 文件夹列表
      await loadDuplicateIndex()
      await loadFolders()
      showDupToast(`已删除 ${fileName}`)
    } catch (e) {
      showDupToast('删除失败: ' + e.message, true)
    } finally {
      setDupDeleting(false)
    }
  }

  // 跳转到对方文件夹（同页切换）
  const handleJumpToDupFolder = async (folderId, folderName) => {
    setDupDetailFolderId(null)
    // 构造最小 folder 对象，handleSelectFolder 会重新加载完整数据
    await handleSelectFolder({ id: folderId, name: folderName })
  }

  const showDupToast = (msg, isError = false) => {
    setDupToast(msg)
    setTimeout(() => setDupToast(''), 2500)
  }

  // ─── 全库扫描相关 ───
  const pollScanStatusFn = async () => {
    try {
      const st = await getScanStatus()
      setScanRunning(st.running)
      setScanProgress(st.progress || 0)
      setScanTotal(st.total || 0)
      setScanResult(st.result || null)
      setScanError(st.error || '')
      if (st.running) {
        const t = setTimeout(pollScanStatusFn, 1500)
        setScanPollTimer(t)
      } else {
        setScanPollTimer(null)
        loadDuplicateIndex()
        loadFolders()
      }
    } catch (e) {
      const t = setTimeout(pollScanStatusFn, 3000)
      setScanPollTimer(t)
    }
  }

  const handleStartScan = async () => {
    setScanError('')
    setScanResult(null)
    try {
      // 先获取当前扫描配置
      const cfg = await getDuplicateSettings()
      await startScanAllDuplicates({ mode: cfg.scanMode || 'both', similarThreshold: cfg.similarThreshold || 5, scope: cfg.scope || 'cross' })
      setScanRunning(true)
      setScanProgress(0)
      if (scanPollTimer) clearTimeout(scanPollTimer)
      const t = setTimeout(pollScanStatusFn, 1000)
      setScanPollTimer(t)
    } catch (e) {
      setScanError(e.message || '启动扫描失败')
    }
  }

  const handleClearDupIndex = async () => {
    try {
      await clearDuplicateIndex()
      // 同步清空忽略列表（旧 groupId 已失效）
      const settings = await getDuplicateSettings()
      if (settings.ignoredGroupIds && settings.ignoredGroupIds.length > 0) {
        await saveDuplicateSettings({ ...settings, ignoredGroupIds: [] })
      }
      setIgnoredGroupIds([])
      setIgnoredGroups([])
      setDupDetailFolderId(null)
      setScanResult(null)
      loadDuplicateIndex()
      loadFolders()
      showDupToast('重复记录已清空')
    } catch (e) {
      showDupToast('清空失败: ' + e.message, true)
    }
  }

  // 切换到 duplicate tab 时加载扫描状态
  useEffect(() => {
    if (activeSubTab === 'duplicate') {
      loadDupIndexSummary()
      loadIgnoredGroups()
      loadScanStatusFn()
    }
    return () => {
      if (scanPollTimer) {
        clearTimeout(scanPollTimer)
        setScanPollTimer(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab])

  const loadScanStatusFn = async () => {
    try {
      const st = await getScanStatus()
      setScanRunning(st.running)
      setScanProgress(st.progress || 0)
      setScanTotal(st.total || 0)
      setScanResult(st.result || null)
      setScanError(st.error || '')
      if (st.running && !scanPollTimer) {
        const t = setTimeout(pollScanStatusFn, 1500)
        setScanPollTimer(t)
      }
    } catch (e) {
      // 静默
    }
  }

  const loadDupIndexSummary = async () => {
    try {
      const idx = await getDuplicateIndex()
      setDuplicateIndex(Array.isArray(idx) ? idx : [])
    } catch (e) {
      setDuplicateIndex([])
    }
  }

  const loadIgnoredGroups = async () => {
    try {
      const data = await getIgnoredGroups()
      setIgnoredGroups(data.ignoredGroups || [])
      setIgnoredGroupIds(data.ignoredGroupIds || [])
      setIgnoredSummary({ totalRawGroups: data.totalRawGroups || 0, visibleGroups: data.visibleGroups || 0 })
    } catch (e) {
      setIgnoredGroups([])
      setIgnoredGroupIds([])
    }
  }

  const handleIgnoreGroup = async (groupId) => {
    try {
      const res = await ignoreDuplicateGroup(groupId)
      setIgnoredGroupIds(res.ignoredCount ? [...ignoredGroupIds, groupId] : ignoredGroupIds)
      setDuplicateIndex(res.groups || [])
      loadIgnoredGroups()
      showDupToast('已忽略该分组')
    } catch (e) {
      showDupToast('忽略失败: ' + e.message, true)
    }
  }

  const handleUnignoreGroup = async (groupId) => {
    try {
      await unignoreDuplicateGroup(groupId)
      setIgnoredGroupIds(prev => prev.filter(id => id !== groupId))
      loadDupIndexSummary()
      loadIgnoredGroups()
      showDupToast('已恢复该分组')
    } catch (e) {
      showDupToast('恢复失败: ' + e.message, true)
    }
  }

  const loadTemplates = async () => {
    try {
      const data = await apiRequest('/templates-v2')
      const sorted = [...data].sort((a, b) => {
        const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : Infinity
        const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : Infinity
        if (orderA !== orderB) return orderA - orderB
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      })
      setTemplates(sorted.map(t => ({ ...t, version: 2 })))
    } catch (error) {
      console.error('加载模板失败:', error)
    }
  }

  const loadProducts = async () => {
    try {
      const data = await apiRequest('/products')
      setProducts(data)
    } catch (error) {
      console.error('加载商品失败:', error)
      setProducts([])
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolder.name) {
      alert('请填写文件夹名称')
      return
    }

    try {
      await apiRequest('/folders', {
        method: 'POST',
        data: {
          name: newFolder.name,
          areaCount: parseInt(newFolder.areaCount)
        }
      })
      loadFolders()
      setShowCreateModal(false)
      setNewFolder({ name: '', areaCount: 2 })
    } catch (error) {
      console.error('创建文件夹失败:', error)
      alert('创建失败，请重试')
    }
  }

  const handleDeleteFolder = async (id) => {
    if (!confirm('确定要删除这个文件夹吗？所有图片和套图结果都将被删除。')) return
    try {
      await apiRequest(`/folders/${id}`, { method: 'DELETE' })
      loadFolders()
      if (selectedFolder?.id === id) {
        setSelectedFolder(null)
      }
    } catch (error) {
      console.error('删除文件夹失败:', error)
    }
  }

  const handleSelectFolder = async (folder) => {
    try {
      const data = await apiRequest(`/folders/${folder.id}`)
      setSelectedFolder(data)
      setSelectedTemplateId(data.templateId || '')
    } catch (error) {
      console.error('加载文件夹详情失败:', error)
    }
  }

  // 进入重命名编辑态（A：点击 ✏️ 图标；B：双击名字）
  const handleStartRename = (folder) => {
    editingIdRef.current = folder.id
    setEditingFolderId(folder.id)
    setEditingName(folder.name)
  }

  const handleRenameCancel = () => {
    editingIdRef.current = null
    setEditingFolderId(null)
    setEditingName('')
  }

  const handleRenameSubmit = async (folderId) => {
    const newName = editingName.trim()
    if (editingIdRef.current !== folderId) return // 已结束编辑（Enter/Esc 已处理），避免重复提交
    if (!newName) {
      alert('文件夹名称不能为空')
      return
    }

    try {
      const updated = await apiRequest(`/folders/${folderId}`, {
        method: 'PATCH',
        data: { name: newName }
      })
      // 同步列表与已打开文件夹的标题
      setFolders(prev => prev.map(f => (f.id === folderId ? { ...f, name: updated.name } : f)))
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(prev => (prev ? { ...prev, name: updated.name } : prev))
      }
      handleRenameCancel()
    } catch (error) {
      console.error('重命名失败:', error)
      alert(error?.message || '重命名失败，请重试')
    }
  }

  const handleBack = () => {
    setSelectedFolder(null)
    loadFolders()
  }

  const handleUpload = async (e) => {
    if (!selectedFolder) return

    const files = Array.from(e.target.files)
    if (files.length === 0) return

    // Filter out non-image files (e.g., Thumbs.db, .DS_Store)
    const imageFiles = files.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop()
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)
    })

    if (imageFiles.length === 0) {
      alert('没有有效的图片文件')
      return
    }

    if (imageFiles.length < files.length) {
      console.log(`过滤掉 ${files.length - imageFiles.length} 个非图片文件`)
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadCount({ current: 0, total: imageFiles.length })

    const formData = new FormData()
    formData.append('folderId', selectedFolder.id)
    imageFiles.forEach(file => {
      formData.append('images', file)
    })

    try {
      const uploadRes = await apiUpload(`/folders/${selectedFolder.id}/upload`, formData)
      setUploadProgress(100)
      setTimeout(async () => {
        const data = await apiRequest(`/folders/${selectedFolder.id}`)
        setSelectedFolder(data)
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        // 上传后刷新重复索引（新图可能产生跨文件夹重复）
        loadDuplicateIndex()
        // 重复提示（FR-1）
        if (uploadRes && Array.isArray(uploadRes.duplicates) && uploadRes.duplicates.length > 0) {
          const names = [...new Set(uploadRes.duplicates.map(d => d.matchedFolderName).filter(Boolean))]
          const suffix = names.length ? `（与 ${names.slice(0, 2).join('、')}${names.length > 2 ? '等' : ''}）` : ''
          showDupToast(`检测到 ${uploadRes.duplicates.length} 张重复图片${suffix}，返回列表查看角标`)
        }
      }, 500)
    } catch (error) {
      console.error('上传失败:', error)
      alert('上传失败：' + (error?.message || '请重试'))
      setUploading(false)
    }
  }

  const handleDeleteImage = async (fileName) => {
    if (!confirm(`确定要删除 ${fileName} 吗？`)) return
    try {
      await apiRequest(`/folders/${selectedFolder.id}/images/${fileName}`, { method: 'DELETE' })
      const data = await apiRequest(`/folders/${selectedFolder.id}`)
      setSelectedFolder(data)
    } catch (error) {
      console.error('删除图片失败:', error)
    }
  }

  const handleAutoGroupUnmatched = async () => {
    if (!selectedFolder || !selectedFolder.id) return
    const areaCount = parseInt(selectedFolder.areaCount) || 1
    if (areaCount <= 1) {
      alert('单区域文件夹无需分组')
      return
    }

    const unmatched = (selectedFolder.images || []).filter(img => {
      if (!img?.name) return false
      const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
      return !match || parseInt(match[2]) > areaCount
    })

    if (unmatched.length === 0) {
      alert('当前没有未匹配图片')
      return
    }

    const tail = unmatched.length % areaCount

    // 计算当前目录已存在的 AG 最大组号，提示会自动接续、不会覆盖
    const prefix = 'AG'
    const groupRe = new RegExp(`^${prefix}-(\\d{3})-`)
    let maxGroup = 0
    for (const img of (selectedFolder.images || [])) {
      const m = img?.name?.match(groupRe)
      if (m) maxGroup = Math.max(maxGroup, parseInt(m[1]))
    }
    const startGroupStr = String(maxGroup + 1).padStart(3, '0')

    let msg = `将把 ${unmatched.length} 张未匹配图片按当前顺序每 ${areaCount} 张分为一组。\n（自动接续现有编号，不会覆盖已有分组；新图将从 ${prefix}-${startGroupStr}-1 开始，如 ${prefix}-${startGroupStr}-1、${prefix}-${startGroupStr}-2 ...）。`
    if (tail > 0) {
      msg += `\n\n注意：最后 ${tail} 张凑不齐一组，也会被重命名为 AG-xxx-${tail}，生成套图时会跳过该组。`
    }
    msg += '\n\n是否继续？'
    if (!confirm(msg)) return

    setAutoGrouping(true)
    try {
      const res = await apiRequest(`/folders/${selectedFolder.id}/auto-group-unmatched`, {
        method: 'POST',
        data: { prefix: 'AG' }
      })
      const data = await apiRequest(`/folders/${selectedFolder.id}`)
      setSelectedFolder(data)
      const warn = res.incompleteGroups > 0 ? '（有未凑齐的组，生成时会被跳过）' : ''
      alert(`自动分组完成：成功 ${res.success || 0}/${res.total || 0} 张${warn}`)
    } catch (error) {
      console.error('自动分组失败:', error)
      alert('自动分组失败：' + (error?.message || '请重试'))
    } finally {
      setAutoGrouping(false)
    }
  }

  // 组内拖拽后按新顺序重排区域号后缀
  const reorderArea = async (groupBaseName, order) => {
    if (!selectedFolder || reorderingArea) return
    setReorderingArea(true)
    try {
      await apiRequest(`/folders/${selectedFolder.id}/reorder-area`, {
        method: 'POST',
        data: { groupBaseName, order }
      })
      const data = await apiRequest(`/folders/${selectedFolder.id}`)
      setSelectedFolder(data)
    } catch (error) {
      console.error('组内重排失败:', error)
      alert('组内重排失败：' + (error?.message || '请重试'))
    } finally {
      setReorderingArea(false)
    }
  }

  const handleGenerateMockups = async () => {
    if (!selectedFolder || !selectedFolder.id) {
      alert('请先选择一个文件夹')
      return
    }

    if (!selectedTemplateId) {
      alert('请先选择模板')
      return
    }

    const validGroups = getValidImageGroups()
    if (validGroups.length === 0) {
      if (parseInt(selectedFolder.areaCount) > 1) {
        alert('没有找到符合命名规则的图片组。\n请确保图片命名格式为：名称-区域编号.png\n例如：0001-1.png（区域1）、0001-2.png（区域2）')
      } else {
        alert('文件夹中没有可用的图片，请先上传图片。')
      }
      return
    }

    // Warn about unmatched files（单区域不弹：所有图自成一组，无「未匹配」概念，与下方未匹配面板保持一致）
    // 注意：单区域只跳过「未匹配提示」，绝不能 return 掉整个函数，否则生成请求根本不会发出（按钮像「点了没反应」）
    if (selectedFolder.images && parseInt(selectedFolder.areaCount) > 1) {
      const unmatchedCount = selectedFolder.images.filter(img => {
        if (!img?.name) return false
        const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
        return !match || parseInt(match[2]) > selectedFolder.areaCount
      }).length
      if (unmatchedCount > 0) {
        if (!confirm(`有 ${unmatchedCount} 张图片未匹配命名规则，将被跳过。\n是否继续生成？`)) return
      }
    }

    // Validate areaCount matches template
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
    if (selectedTemplate) {
      const templateAreaCount = (selectedTemplate.printAreas || []).length
      if (templateAreaCount > 0 && selectedFolder.areaCount !== templateAreaCount) {
        alert(`文件夹的区域数量(${selectedFolder.areaCount})与模板的印花区域数量(${templateAreaCount})不匹配。\n请先调整文件夹或模板设置。`)
        return
      }
    }

    // Warn if mockups already exist
    if (selectedFolder.mockups && selectedFolder.mockups.length > 0) {
      if (!confirm(`当前文件夹已有 ${selectedFolder.mockups.length} 组套图结果。\n重新生成将替换所有已有结果，确定继续吗？`)) {
        return
      }
    }

    setIsGenerating(true)

    try {
      const data = await apiRequest(`/folders/${selectedFolder.id}/generate-mockups`, {
        method: 'POST',
        data: {
          templateId: selectedTemplateId
        }
      })
      console.log('套图任务创建成功:', data)
      alert('套图任务已创建！\n\n请切换到"任务进度"标签页查看实时状态。')
      window.location.href = '/#tasks'
    } catch (error) {
      console.error('创建套图任务失败:', error)
      const errMsg = error.message || '创建任务失败'
      alert('创建任务失败：' + errMsg)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyrightCheck = async () => {
    if (copyrightSubmittingRef.current) return
    if (!selectedFolder || !selectedFolder.id) {
      alert('请先选择一个文件夹')
      return
    }

    if (!selectedFolder.images || selectedFolder.images.length === 0) {
      alert('文件夹中没有图片')
      return
    }

    copyrightSubmittingRef.current = true
    setIsCheckingCopyright(true)

    try {
      const { taskId } = await apiStartCopyrightCheckTask(selectedFolder.id)
      window.location.href = '/#tasks'
    } catch (error) {
      console.error('创建侵权检测任务失败:', error)
      alert('创建检测任务失败：' + (error.message || '未知错误'))
    } finally {
      copyrightSubmittingRef.current = false
      setIsCheckingCopyright(false)
    }
  }

  const handleRecheckCopyright = async (fileName) => {
    if (!selectedFolder || !selectedFolder.id) return

    setRecheckingImage(fileName)

    try {
      const data = await apiCopyrightCheckSingle(selectedFolder.id, fileName)
      
      setSelectedFolder(prev => ({
        ...prev,
        images: prev.images.map(img => {
          if (img.name === fileName) {
            return {
              ...img,
              copyrightCheck: {
                riskLevel: data.riskLevel,
                reason: data.reason,
                suggestion: data.suggestion,
                checkedAt: new Date().toISOString()
              }
            }
          }
          return img
        })
      }))
    } catch (error) {
      console.error('重新检测失败:', error)
      alert('重新检测失败：' + (error.message || '未知错误'))
    } finally {
      setRecheckingImage(null)
    }
  }

  const getValidImageGroups = () => {
    if (!selectedFolder?.images || !Array.isArray(selectedFolder.images)) return []

    const areaCount = parseInt(selectedFolder.areaCount) || 1
    const groups = {}

    if (areaCount === 1) {
      // 单区域：每张图自成一组（忽略命名规则），同名多张各自保留；名字标错位置（-2/-3）也当单图首张
      selectedFolder.images.forEach((img, idx) => {
        if (!img?.name) return
        const displayName = img.name.replace(/\.\w+$/, '')
        const soloKey = `__solo_${idx}_${displayName}`
        groups[soloKey] = { displayName, solo: true }
      })
      return Object.keys(groups)
    }

    selectedFolder.images.forEach(img => {
      if (!img?.name) return
      const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
      if (match) {
        const baseName = match[1]
        const areaNum = parseInt(match[2])
        if (!groups[baseName]) {
          groups[baseName] = {}
        }
        groups[baseName][areaNum] = img.name
      }
    })

    return Object.keys(groups).filter(baseName => {
      const group = groups[baseName]
      for (let i = 1; i <= areaCount; i++) {
        if (!group[i]) return false
      }
      return true
    })
  }

  const filteredFolders = folders.filter(folder => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return true
    if (folder.name.toLowerCase().includes(term)) return true
    return folder.images?.some(img => img.name.toLowerCase().includes(term))
  })

  const getTemplateName = (templateId) => {
    const template = templates.find(t => t.id === templateId)
    return template?.name || '未知模板'
  }

  const getRiskLevelInfo = (riskLevel) => {
    switch (riskLevel) {
      case 'high':
        return { icon: AlertTriangle, color: 'bg-red-500', text: '高风险', textColor: 'text-red-600', bgColor: 'bg-red-50' }
      case 'medium':
        return { icon: AlertTriangle, color: 'bg-orange-500', text: '中风险', textColor: 'text-orange-600', bgColor: 'bg-orange-50' }
      case 'low':
        return { icon: CheckCircle, color: 'bg-green-500', text: '安全', textColor: 'text-green-600', bgColor: 'bg-green-50' }
      case 'unknown':
        return { icon: HelpCircle, color: 'bg-blue-500', text: '未知', textColor: 'text-blue-600', bgColor: 'bg-blue-50' }
      default:
        return { icon: Shield, color: 'bg-gray-400', text: '未检测', textColor: 'text-gray-600', bgColor: 'bg-gray-50' }
    }
  }

  if (selectedFolder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button 
            onClick={handleBack} 
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>返回文件夹列表</span>
          </button>
          <div className="flex items-center space-x-4">
            {selectedFolder.mockups && selectedFolder.mockups.length > 0 && (
              <button
                onClick={() => {
                  window.location.href = `/#results/${selectedFolder.id}`
                }}
                className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-md"
              >
                <Eye className="w-5 h-5" />
                <span>查看套图结果</span>
              </button>
            )}
          </div>
        </div>

        {/* 板块一：文件夹信息 + 模板选择 + 上传区 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedFolder.name}</h2>
                  <p className="text-gray-500 mt-1">
                    贴图区域数: {selectedFolder.areaCount} | 
                    图片数: {selectedFolder.images?.length || 0}
                  </p>
                </div>
                <button
                  onClick={handleCopyrightCheck}
                  disabled={isCheckingCopyright}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-md disabled:opacity-50"
                >
                  <Shield className="w-5 h-5" />
                  <span>{isCheckingCopyright ? '检测中...' : '批量侵权检测'}</span>
                </button>
              </div>

              {(() => {
                const currentSelected = templates.find(t => t.id === selectedTemplateId) || null;
                const currentProduct = currentSelected?.productId ? products.find(p => p.id === currentSelected.productId) : null;
                const currentTag = currentProduct && currentSelected?.tagId ? currentProduct.tags?.find(x => x.id === currentSelected.tagId) : null;
                const templateAreaCount = (currentSelected?.printAreas || []).length;
                const folderAreaCount = parseInt(selectedFolder?.areaCount) || 0;
                const isAreaMatch = !templateAreaCount || !folderAreaCount || templateAreaCount === folderAreaCount;
                const detailCount = (currentSelected?.colors || []).reduce((sum, c) => sum + (c.detailImages ? c.detailImages.length : 0), 0);
                const openPicker = () => {
                  console.log('[TemplatePicker] 打开选择器弹窗');
                  try {
                    setTempSelectedId(selectedTemplateId);
                    setPickerProductId(currentSelected?.productId ? currentSelected.productId : 'all');
                    setPickerTagId(currentSelected?.tagId || null);
                    setPickerSearch('');
                    setShowTemplatePicker(true);
                  } catch (e) {
                    console.error('[TemplatePicker] 打开失败:', e);
                  }
                };
                return (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium text-blue-800 mb-3">选择模板</label>
                    {currentSelected ? (
                      <div
                        onClick={openPicker}
                        className="bg-white border border-blue-300 rounded-xl px-5 py-4 flex items-center justify-between hover:border-blue-400 cursor-pointer transition shadow-sm"
                      >
                        <div className="flex items-center space-x-4 min-w-0">
                          <div className="w-16 h-20 bg-gray-50 rounded-lg overflow-hidden border border-gray-200 shrink-0 flex items-center justify-center">
                            {currentSelected.colors?.[0]?.imagePath ? (
                              <img src={getImageUrl(currentSelected.colors[0].imagePath)} alt="" className="w-full h-full object-contain p-1" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-gray-300" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 text-base truncate">{currentSelected.name || '未命名模板'}</div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
                              {currentProduct && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                  <Tag className="w-2.5 h-2.5" />
                                  {currentProduct.name}
                                </span>
                              )}
                              {currentTag && (
                                <>
                                  <span className="text-gray-400">/</span>
                                  <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{currentTag.name}</span>
                                </>
                              )}
                              {!currentProduct && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">未分类</span>
                              )}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isAreaMatch ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isAreaMatch ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                                {templateAreaCount || 0}个区域{isAreaMatch ? ' 匹配' : ` vs 文件夹${folderAreaCount}区域`}
                              </span>
                              {detailCount > 0 && <span className="text-gray-400">+{detailCount}细节图</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">套图时将使用该模板的印花区域设置和细节图配置</p>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openPicker(); }} className="shrink-0 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition flex items-center space-x-1.5">
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>更换模板</span>
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={openPicker}
                        className="bg-white border-2 border-dashed border-blue-300 rounded-xl px-6 py-5 flex items-center justify-between hover:bg-blue-50/50 cursor-pointer transition"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-16 h-20 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-300 shrink-0">
                            <ImageIcon className="w-7 h-7" />
                          </div>
                          <div>
                            <div className="text-gray-400 text-sm">暂无模板</div>
                            <div className="text-xs text-gray-300 mt-0.5">请选择一个模板，套图时将使用该模板的印花区域设置和细节图配置</div>
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openPicker(); }} className="shrink-0 px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition shadow-sm flex items-center space-x-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          <span>请选择模板</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

          {/* 批量套图按钮：仅在选择模板后显示 */}
          {selectedTemplateId && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                onClick={handleGenerateMockups}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md disabled:opacity-50"
              >
                <Wand2 className="w-5 h-5" />
                <span className="font-semibold text-base">{isGenerating ? '生成中...' : '批量套图'}</span>
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 border border-blue-600 rounded-lg text-white hover:bg-blue-600 cursor-pointer transition-colors"
              onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              style={{ opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? (
                <div className="flex items-center gap-3 w-full">
                  {uploadProgress === 100 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-300 shrink-0" />
                  ) : (
                    <Upload className="w-5 h-5 text-white shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {uploadProgress === 100 ? '上传完成!' : '正在上传...'}
                      </span>
                      <span className="text-sm text-blue-100">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-1.5">
                      <div
                        className="bg-white h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <FolderOpen className="w-5 h-5" />
                  <span className="text-sm font-medium">点击上传图案文件（支持文件夹 / Ctrl 多选）</span>
                </>
              )}
            </div>
            {!uploading && (
              <p className="text-xs text-gray-400 text-center">
                命名规则：名称-区域编号.png，例如 0001-1.png（区域1）、0001-2.png（区域2）
              </p>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            directory="true"
            webkitdirectory="true"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {/* 板块二：已上传图片列表 */}
        {selectedFolder.images && selectedFolder.images.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">已上传图片</h3>
              <div className="text-sm text-gray-500">
                找到 <span className="font-bold text-green-600">{getValidImageGroups().length}</span> 个有效图片组
              </div>
            </div>

              {(() => {
                const groups = {}
                const renderAreaCount = parseInt(selectedFolder.areaCount) || 1
                selectedFolder.images.forEach((img, idx) => {
                  if (!img?.name || !img?.path) return
                  const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
                  if (renderAreaCount === 1) {
                    // 单区域：每张图自成一组，忽略命名规则
                    const displayName = img.name.replace(/\.\w+$/, '')
                    const soloKey = `__solo_${idx}_${displayName}`
                    groups[soloKey] = [{ ...img, areaNum: 1, isValid: true, displayName }]
                  } else if (match) {
                    const baseName = match[1]
                    const areaNum = parseInt(match[2])
                    if (!groups[baseName]) {
                      groups[baseName] = []
                    }
                    groups[baseName].push({ ...img, areaNum, isValid: areaNum <= renderAreaCount })
                  }
                })

                const unmatchedImages = selectedFolder.images.filter(img => {
                  if (!img?.name) return false
                  if (parseInt(selectedFolder.areaCount) <= 1) return false // 单区域不显示「未匹配」，所有图都进图组
                  const match = img.name.match(/^(.+)-(\d{1,2})\.\w+$/)
                  return !match || parseInt(match[2]) > selectedFolder.areaCount
                })

                const sortedGroups = Object.keys(groups).sort()

                // 完整组（图片数 === 区域数 且 >1）且未在重排中 → 允许组内拖拽
                const isDraggableGroup = (name) =>
                  groups[name].length === selectedFolder.areaCount &&
                  selectedFolder.areaCount > 1 &&
                  !reorderingArea

                // 渲染单张组内图片的内部内容（不含外层容器，外层由拖拽/普通分支提供）
                const renderGroupImage = (img, areaNum) => {
                  const riskInfo = getRiskLevelInfo(img.copyrightCheck?.riskLevel)
                  const RiskIcon = riskInfo.icon
                  return (
                    <>
                      <img
                        src={getImageUrl(img.path)}
                        alt={img.name}
                        className="w-full aspect-square object-contain p-1 max-h-48"
                      />
                      <div className={`absolute top-1 left-1 px-1 py-0.5 text-white text-xs rounded ${
                        img.isValid ? 'bg-green-500' : 'bg-yellow-500'
                      }`}>
                        {areaNum}
                      </div>
                      {(() => {
                        const dupInfo = selectedFolder?.id ? getImageDupInfo(selectedFolder.id, img.name) : null
                        if (!dupInfo) return null
                        const isExact = dupInfo.type === 'exact'
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetailDupPopup(prev =>
                                prev && prev.imageName === img.name ? null : { imageName: img.name, type: dupInfo.type, matches: dupInfo.matches }
                              )
                            }}
                            className={`absolute top-1 right-1 p-1 text-white rounded shadow-sm ${isExact ? 'bg-red-500' : 'bg-orange-500'} hover:opacity-90 z-10`}
                            title={`重复图片（${isExact ? '完全重复' : '视觉近似'}），点击查看`}
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        )
                      })()}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.name) }}
                        className="absolute top-1 right-1 p-1 bg-white rounded shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                      >
                        <X className="w-3 h-3 text-red-500" />
                      </button>
                      <div
                        className="absolute bottom-1 right-1 flex items-center space-x-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedImageDetail({
                            name: img.name,
                            path: img.path,
                            copyrightCheck: img.copyrightCheck
                          })
                          setShowCopyrightModal(true)
                        }}
                      >
                        <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs ${riskInfo.bgColor} ${riskInfo.textColor} cursor-pointer`}>
                          <RiskIcon className="w-3 h-3" />
                          <span>{riskInfo.text}</span>
                        </div>
                        {img.copyrightCheck && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRecheckCopyright(img.name) }}
                            disabled={recheckingImage === img.name || isCheckingCopyright}
                            className="p-1 bg-blue-500 rounded shadow-sm hover:bg-blue-600 transition-all disabled:opacity-50"
                            title="重新检测"
                          >
                            {recheckingImage === img.name ? (
                              <Loader2 className="w-3 h-3 text-white animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 text-white" />
                            )}
                          </button>
                        )}
                      </div>
                    </>
                  )
                }

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {sortedGroups.map(groupName => (
                        <div 
                          key={groupName} 
                          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                {groupName.startsWith('__solo_') ? groups[groupName][0].displayName : groupName}
                              </span>
                              <span className="text-xs text-gray-500">
                                {groups[groupName].length} 区域
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              {isDraggableGroup(groupName) && (
                                <GripVertical className="w-4 h-4 text-gray-300" title="可拖拽调整区域顺序" />
                              )}
                              {groups[groupName].every(g => g.isValid) ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : (
                                <span className="text-yellow-500 text-xs">缺</span>
                              )}
                            </div>
                          </div>
                          {isDraggableGroup(groupName) ? (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={(event) => {
                                const { active, over } = event
                                if (!over || active.id === over.id) return
                                const imgs = groups[groupName]
                                const oldIndex = imgs.findIndex(g => g.name === active.id)
                                const newIndex = imgs.findIndex(g => g.name === over.id)
                                if (oldIndex === -1 || newIndex === -1) return
                                const newOrder = arrayMove(imgs, oldIndex, newIndex).map(g => g.name)
                                reorderArea(groupName, newOrder)
                              }}
                            >
                              <SortableContext
                                items={groups[groupName].map(g => g.name)}
                                strategy={rectSortingStrategy}
                              >
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedFolder.areaCount}, 1fr)` }}>
                                  {groups[groupName].map(img => (
                                    <SortableGroupImage key={img.name} id={img.name} dragging={reorderingArea}>
                                      {renderGroupImage(img, img.areaNum)}
                                    </SortableGroupImage>
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          ) : (
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedFolder.areaCount}, 1fr)` }}>
                              {Array.from({ length: selectedFolder.areaCount }, (_, i) => {
                                const areaNum = i + 1
                                const img = groups[groupName].find(g => g.areaNum === areaNum)
                                if (img) {
                                  return (
                                    <div key={areaNum} className="relative bg-gray-50 rounded-lg overflow-hidden group">
                                      {renderGroupImage(img, areaNum)}
                                    </div>
                                  )
                                }
                                return (
                                  <div key={areaNum} className="bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs aspect-square">
                                    {areaNum}缺失
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {unmatchedImages.length > 0 && (
                      <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                              未匹配图片
                            </span>
                            <span className="text-xs text-gray-500">共 {unmatchedImages.length} 张</span>
                          </div>
                          <button
                            onClick={handleAutoGroupUnmatched}
                            disabled={autoGrouping}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-medium rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm disabled:opacity-50"
                          >
                            {autoGrouping ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Group className="w-3.5 h-3.5" />
                            )}
                            <span>{autoGrouping ? '分组中...' : '按顺序一键分组'}</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-3">
                          {unmatchedImages.map(img => {
                            const riskInfo = getRiskLevelInfo(img.copyrightCheck?.riskLevel)
                            const RiskIcon = riskInfo.icon
                            return (
                              <div key={img.name} className="relative bg-gray-50 rounded-lg overflow-hidden group">
                                <img
                                  src={getImageUrl(img.path)}
                                  alt={img.name}
                                  className="w-full aspect-square object-contain p-1 max-h-28"
                                />
                                {(() => {
                                  const dupInfo = selectedFolder?.id ? getImageDupInfo(selectedFolder.id, img.name) : null
                                  if (!dupInfo) return null
                                  const isExact = dupInfo.type === 'exact'
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDetailDupPopup(prev =>
                                          prev && prev.imageName === img.name ? null : { imageName: img.name, type: dupInfo.type, matches: dupInfo.matches }
                                        )
                                      }}
                                      className={`absolute top-1 right-1 p-1 text-white rounded shadow-sm ${isExact ? 'bg-red-500' : 'bg-orange-500'} hover:opacity-90 z-10`}
                                      title={`重复图片（${isExact ? '完全重复' : '视觉近似'}），点击查看`}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )
                                })()}
                                <button
                                  onClick={() => handleDeleteImage(img.name)}
                                  className="absolute top-1 right-1 p-1 bg-white rounded shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                                >
                                  <X className="w-3 h-3 text-red-500" />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <p className="text-white text-xs truncate">{img.name}</p>
                                </div>
                                <div 
                                  className={`absolute bottom-1 right-1 flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs ${riskInfo.bgColor} ${riskInfo.textColor} cursor-pointer`}
                                  onClick={() => {
                                    setSelectedImageDetail({
                                      name: img.name,
                                      path: img.path,
                                      copyrightCheck: img.copyrightCheck
                                    })
                                    setShowCopyrightModal(true)
                                  }}
                                >
                                  <RiskIcon className="w-3 h-3" />
                                  <span>{riskInfo.text}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

        {selectedFolder.images && selectedFolder.images.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center py-8 text-gray-500">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>暂无图片，请上传图案文件</p>
          </div>
        )}

        {showCopyrightModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCopyrightModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">侵权检测结果</h3>
                <button onClick={() => setShowCopyrightModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedImageDetail ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <img
                      src={getImageUrl(selectedImageDetail.path)}
                      alt={selectedImageDetail.name}
                      className="w-24 h-24 object-contain rounded-lg bg-gray-100"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{selectedImageDetail.name}</p>
                      {selectedImageDetail.copyrightCheck?.riskLevel && (
                        <div className="flex items-center space-x-2 mt-2">
                          {(() => {
                            const riskInfo = getRiskLevelInfo(selectedImageDetail.copyrightCheck.riskLevel)
                            const RiskIcon = riskInfo.icon
                            return (
                              <span className={`flex items-center space-x-1 px-2 py-1 rounded text-sm ${riskInfo.bgColor} ${riskInfo.textColor}`}>
                                <RiskIcon className="w-4 h-4" />
                                <span>{riskInfo.text}</span>
                              </span>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedImageDetail.copyrightCheck && (
                    <div className="space-y-3">
                      {selectedImageDetail.copyrightCheck.reason && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm font-medium text-gray-700 mb-1">风险理由</p>
                          <p className="text-sm text-gray-600">{selectedImageDetail.copyrightCheck.reason}</p>
                        </div>
                      )}
                      {selectedImageDetail.copyrightCheck.suggestion && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <p className="text-sm font-medium text-blue-700 mb-1">使用建议</p>
                          <p className="text-sm text-blue-600">{selectedImageDetail.copyrightCheck.suggestion}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <Shield className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-800">检测结果汇总</span>
                    </div>
                    <p className="text-sm text-blue-700">批量侵权检测已完成！</p>
                    <p className="text-sm text-blue-600 mt-2">点击图片右下角的风险标识查看详细结果。</p>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-800">
                        <strong>免责声明：</strong>侵权检测结果仅供参考，不能作为法律依据。
                        请结合专业法律意见进行最终判断。
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 详情页单图重复详情弹出面板 */}
        {detailDupPopup && (() => {
          const { imageName, type, matches } = detailDupPopup
          const isExact = type === 'exact'
          return (
            <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setDetailDupPopup(null)}>
              <div className="absolute inset-0 bg-black/30" />
              <div
                className="relative bg-white rounded-t-2xl shadow-2xl w-full max-w-lg max-h-[60vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className={`px-5 py-3 text-white flex items-center justify-between ${isExact ? 'bg-red-500' : 'bg-orange-500'}`}>
                  <div className="flex items-center space-x-2">
                    <Copy className="w-4 h-4" />
                    <span className="font-medium text-sm truncate">{imageName}</span>
                    <span className="text-xs opacity-90">· {isExact ? '完全重复' : '视觉近似'}</span>
                  </div>
                  <button onClick={() => setDetailDupPopup(null)} className="p-1 hover:bg-white/20 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {matches.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center space-x-2 min-w-0">
                        <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{m.folderName || '未知文件夹'}</div>
                          <div className="text-xs text-gray-500 truncate">{m.imageName}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => handleJumpToDupFolder(m.folderId, m.folderName)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
                        >
                          跳转
                        </button>
                        <button
                          onClick={() => {
                            handleDeleteDupImage(m.folderId, m.imageName)
                            setDetailDupPopup(null)
                          }}
                          disabled={dupDeleting}
                          className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                          title="删除对方文件夹的这张图"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {matches.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">暂无匹配记录</p>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                  <button
                    onClick={() => {
                      handleDeleteDupImage(selectedFolder.id, imageName)
                      setDetailDupPopup(null)
                    }}
                    disabled={dupDeleting}
                    className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4 inline mr-1" />
                    删除当前图
                  </button>
                  <button
                    onClick={() => setDetailDupPopup(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      {idleScanning && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-purple-600 text-white rounded-lg shadow-lg text-sm flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>空闲扫描中...</span>
        </div>
      )}
      {dupToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-gray-800 text-white rounded-lg shadow-lg text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{dupToast}</span>
        </div>
      )}

      {/* ─── 模板选择器弹窗 ─── */}
      {showTemplatePicker && (() => {
        // ─ 统计数据 ─
        const productCounts = products.map(p => {
          const list = templates.filter(t => t.productId === p.id);
          const uncategorized = list.filter(t => !t.tagId).length;
          return {
            ...p,
            templateCount: list.length,
            tags: (p.tags || []).map(tg => ({
              ...tg,
              templateCount: list.filter(t => t.tagId === tg.id).length
            })),
            uncategorizedCount: uncategorized
          };
        });
        const allCount = templates.length;
        const uncategorizedCount = templates.filter(t => !t.productId).length;

        // ─ 过滤 ─
        const folderAreaCount = parseInt(selectedFolder?.areaCount) || 0;
        const productFilter = pickerProductId === 'all' ? null
          : pickerProductId === 'uncategorized' ? false
          : pickerProductId;
        const selectedProd = pickerProductId && pickerProductId !== 'all' && pickerProductId !== 'uncategorized'
          ? productCounts.find(p => p.id === pickerProductId) : null;

        let filtered = templates;
        if (productFilter === false) {
          filtered = filtered.filter(t => !t.productId);
        } else if (productFilter) {
          filtered = filtered.filter(t => t.productId === productFilter);
          if (pickerTagId === 'none') {
            filtered = filtered.filter(t => !t.tagId);
          } else if (pickerTagId) {
            filtered = filtered.filter(t => t.tagId === pickerTagId);
          }
        }
        if (pickerSearch.trim()) {
          const kw = pickerSearch.trim().toLowerCase();
          const productMap = Object.fromEntries(products.map(p => [p.id, p]));
          const tagMapPerProduct = {};
          products.forEach(p => { if (p.tags) p.tags.forEach(t => { tagMapPerProduct[p.id] = tagMapPerProduct[p.id] || {}; tagMapPerProduct[p.id][t.id] = t; }); });
          filtered = filtered.filter(t => {
            const name = (t.name || '').toLowerCase();
            const pname = productMap[t.productId]?.name?.toLowerCase() || '';
            const tname = tagMapPerProduct[t.productId]?.[t.tagId]?.name?.toLowerCase() || '';
            return name.includes(kw) || pname.includes(kw) || tname.includes(kw);
          });
        }
        if (pickerOnlyMatchArea && folderAreaCount) {
          filtered = filtered.filter(t => (t.printAreas || []).length === folderAreaCount);
        }
        filtered.sort((a, b) => {
          const ma = folderAreaCount && (a.printAreas || []).length === folderAreaCount;
          const mb = folderAreaCount && (b.printAreas || []).length === folderAreaCount;
          if (ma !== mb) return mb ? 1 : -1;
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        // ─ 打开时重置商品：如果选中的商品不存在于 products（例如空），重置 ─
        const confirmedTempId = tempSelectedId;
        const productMap = Object.fromEntries(products.map(p => [p.id, p]));
        const getTagOf = (t) => productMap[t.productId]?.tags?.find(x => x.id === t.tagId);
        const getProductOf = (t) => productMap[t.productId];

        const close = () => {
          setShowTemplatePicker(false);
        };
        const confirm = () => {
          setSelectedTemplateId(confirmedTempId);
          close();
        };
        const currentFolderArea = folderAreaCount;
        return (
          <div className="template-picker-modal fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={close} />
            <div className="relative w-full max-w-6xl h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              {/* 顶栏 */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">选择模板</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      当前文件夹 <span className="font-medium text-gray-700">{selectedFolder?.name}</span>
                      {currentFolderArea > 0 && <>，印花区域数 <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-semibold">{currentFolderArea}</span></>}
                    </p>
                  </div>
                </div>
                <button onClick={close} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 min-h-0 flex">
                {/* 左栏：商品分类 */}
                <aside className="w-56 shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto py-3">
                  <div className="px-3 pb-2 mb-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">商品分类</div>
                  </div>
                  <div className="space-y-0.5 px-2">
                    <button
                      onClick={() => { setPickerProductId('all'); setPickerTagId(null); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                        pickerProductId === 'all' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-700 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4" />
                        <span className="font-medium">全部模板</span>
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pickerProductId === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>{allCount}</span>
                    </button>
                    <button
                      onClick={() => { setPickerProductId('uncategorized'); setPickerTagId(null); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                        pickerProductId === 'uncategorized' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-700 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 opacity-60" />
                        <span className="font-medium">未分类</span>
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pickerProductId === 'uncategorized' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>{uncategorizedCount}</span>
                    </button>
                  </div>
                  {productCounts.length > 0 && (
                    <div className="mt-4 px-2">
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1.5">我的商品</div>
                      <div className="space-y-0.5">
                        {productCounts.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setPickerProductId(p.id); setPickerTagId(null); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between group ${
                              pickerProductId === p.id ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-700 hover:bg-white hover:shadow-sm'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Tag className={`w-4 h-4 shrink-0 ${pickerProductId === p.id ? '' : 'text-blue-500'}`} />
                              <span className="font-medium truncate">{p.name}</span>
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${pickerProductId === p.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>{p.templateCount || 0}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>

                {/* 右区 */}
                <div className="flex-1 min-w-0 flex flex-col">
                  {/* 右：搜索+工具行 */}
                  <div className="px-5 py-3 border-b border-gray-100 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          value={pickerSearch}
                          onChange={e => setPickerSearch(e.target.value)}
                          placeholder="搜索模板 / 商品 / 标签..."
                          className="w-full pl-9 pr-3 h-9 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition"
                        />
                      </div>
                      {currentFolderArea > 0 && (
                        <label className="inline-flex items-center gap-2 px-3 h-9 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition">
                          <input
                            type="checkbox"
                            checked={pickerOnlyMatchArea}
                            onChange={e => setPickerOnlyMatchArea(e.target.checked)}
                            className="w-4 h-4 rounded text-blue-500 border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 whitespace-nowrap">仅匹配区域数({currentFolderArea})</span>
                        </label>
                      )}
                      <div className="text-sm text-gray-500 whitespace-nowrap">
                        匹配 <span className="font-semibold text-gray-800">{filtered.length}</span> / {templates.length}
                      </div>
                    </div>
                    {/* 右：标签筛选栏 */}
                    {selectedProd ? (
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 h-7 shrink-0">
                          <Tag className="w-4 h-4 text-gray-400" />
                          {selectedProd.name}
                        </span>
                        <span className="text-gray-300 h-5">·</span>
                        <button
                          onClick={() => setPickerTagId(null)}
                          className={`h-7 px-3 inline-flex items-center text-sm rounded-full transition ${
                            pickerTagId === null
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          全部 ({selectedProd.templateCount || 0})
                        </button>
                        {selectedProd.tags?.length > 0 && (
                          <button
                            onClick={() => setPickerTagId('none')}
                            className={`h-7 px-3 inline-flex items-center text-sm rounded-full transition ${
                              pickerTagId === 'none'
                                ? 'bg-amber-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            无标签 ({selectedProd.uncategorizedCount || 0})
                          </button>
                        )}
                        {(selectedProd.tags || []).map(tg => (
                          <div
                            key={tg.id}
                            className={`h-7 inline-flex items-center px-3 rounded-full transition ${
                              pickerTagId === tg.id
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            <button
                              onClick={() => setPickerTagId(tg.id)}
                              className="inline-flex items-center gap-1.5 text-sm"
                            >
                              {tg.name}
                              <span className={`text-xs ${pickerTagId === tg.id ? 'opacity-70' : 'text-gray-400'}`}>{tg.templateCount || 0}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* 右：网格卡片 */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-gray-50/60">
                    {filtered.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center py-16">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                          <Search className="w-7 h-7 text-gray-400" />
                        </div>
                        <div className="text-base font-medium text-gray-700">没有匹配的模板</div>
                        <div className="text-sm text-gray-400 mt-1.5 max-w-sm">试着换个商品分类、关闭「仅匹配区域」或清空搜索条件</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filtered.map(tpl => {
                          const isSelected = confirmedTempId === tpl.id;
                          const areaCount = (tpl.printAreas || []).length;
                          const matched = !currentFolderArea || areaCount === currentFolderArea;
                          const prod = getProductOf(tpl);
                          const tg = getTagOf(tpl);
                          const detailCount = (tpl.colors || []).reduce((s, c) => s + (c.detailImages ? c.detailImages.length : 0), 0);
                          const thumb = tpl.colors?.[0]?.imagePath;
                          return (
                            <div
                              key={tpl.id}
                              onClick={() => setTempSelectedId(tpl.id)}
                              className={`group relative bg-white rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:shadow-md ${
                                isSelected
                                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-md'
                                  : 'border-transparent hover:border-gray-200'
                              }`}
                            >
                              {/* 选中角标 */}
                              {isSelected && (
                                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm z-10">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              )}
                              {/* 区域匹配状态 */}
                              <div className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-medium z-10 flex items-center gap-1 ${
                                matched ? 'bg-green-100/95 text-green-700' : 'bg-amber-100/95 text-amber-700'
                              }`}>
                                {matched ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                                {areaCount}区域{matched ? '匹配' : '不匹配'}
                              </div>
                              {/* 缩略图 */}
                              <div className="aspect-[4/3] bg-gray-50 border-b border-gray-100 overflow-hidden flex items-center justify-center">
                                {thumb ? (
                                  <img src={getImageUrl(thumb)} alt="" className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300" />
                                ) : (
                                  <ImageIcon className="w-10 h-10 text-gray-300" />
                                )}
                              </div>
                              {/* 信息 */}
                              <div className="p-3">
                                <div className="text-sm font-semibold text-gray-900 truncate" title={tpl.name || ''}>{tpl.name || '未命名模板'}</div>
                                <div className="mt-1.5 flex items-center gap-1 flex-wrap text-[10px]">
                                  {prod ? (
                                    <>
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{prod.name}</span>
                                      {tg && <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{tg.name}</span>}
                                    </>
                                  ) : <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">未分类</span>}
                                  {detailCount > 0 && <span className="text-gray-400">+{detailCount}细节</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 底栏 */}
              <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                <div className="text-sm text-gray-600 flex items-center gap-3">
                  {confirmedTempId ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      已选择 <span className="font-medium text-gray-900">{templates.find(t => t.id === confirmedTempId)?.name || '模板'}</span>
                      {(() => {
                        const t = templates.find(t => t.id === confirmedTempId);
                        if (!t) return null;
                        const areaCount = (t.printAreas || []).length;
                        if (!currentFolderArea) return null;
                        const matched = areaCount === currentFolderArea;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${matched ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {matched ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {matched ? '区域匹配 ✓' : `区域不匹配 (${areaCount}/${currentFolderArea})`}
                          </span>
                        );
                      })()}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-gray-400">
                      <Info className="w-4 h-4" />
                      请在上方选择一个模板
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={close} className="px-4 h-9 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    取消
                  </button>
                  <button
                    onClick={confirm}
                    disabled={!confirmedTempId}
                    className="px-5 h-9 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition shadow-sm flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    确认选择
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">图案库</h2>
          <p className="text-gray-500 mt-1">管理图案文件夹，支持批量上传和套图生成</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>新建文件夹</span>
        </button>
      </div>

      {/* 二级 Tab 切换 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex space-x-6 px-4">
            <button
              onClick={() => setActiveSubTab('images')}
              className={`flex items-center space-x-2 px-3 py-3 border-b-2 font-medium transition-colors ${
                activeSubTab === 'images'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>文件夹</span>
            </button>
            <button
              onClick={() => setActiveSubTab('rename')}
              className={`flex items-center space-x-2 px-3 py-3 border-b-2 font-medium transition-colors ${
                activeSubTab === 'rename'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>文件名整理</span>
            </button>
            <button
              onClick={() => setActiveSubTab('duplicate')}
              className={`flex items-center space-x-2 px-3 py-3 border-b-2 font-medium transition-colors ${
                activeSubTab === 'duplicate'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Copy className="w-4 h-4" />
              <span>重复检测</span>
            </button>
          </div>
        </div>

        {activeSubTab === 'images' && (
          <div className="p-4 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索文件夹或图片文件名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
            />
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setFolderViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                folderViewMode === 'grid'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="网格视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFolderViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                folderViewMode === 'list'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="列表视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 重复图片详情面板 */}
        {dupDetailFolderId && (() => {
          const targetFolder = folders.find(f => f.id === dupDetailFolderId)
          const details = getFolderDupDetails(dupDetailFolderId)
          return (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Copy className="w-5 h-5 text-red-500" />
                  <h3 className="font-semibold text-gray-900">
                    重复图片详情{targetFolder ? ` - ${targetFolder.name}` : ''}
                  </h3>
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">{details.length} 张</span>
                </div>
                <button
                  onClick={() => setDupDetailFolderId(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg"
                  title="关闭"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {details.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">该文件夹暂无重复图片</p>
              ) : (
                <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                  {details.map(item => (
                    <div key={item.imageName} className="flex space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      {/* 当前文件夹的图 */}
                      <div className="flex-shrink-0 relative group">
                        <img
                          src={getImageUrl(item.path)}
                          alt={item.imageName}
                          className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-white"
                        />
                        <button
                          onClick={() => handleDeleteDupImage(dupDetailFolderId, item.imageName)}
                          disabled={dupDeleting}
                          title="删除此图"
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-gray-900 truncate" title={item.imageName}>{item.imageName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium text-white ${item.type === 'exact' ? 'bg-red-500' : 'bg-orange-500'}`}>
                            {item.type === 'exact' ? '完全重复' : '视觉近似'}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {item.matches.map((m, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white rounded px-2.5 py-1.5 border border-gray-100">
                              <div className="flex items-center space-x-2 min-w-0 text-sm">
                                <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                <span className="text-gray-700 truncate">
                                  <span className="font-medium">{m.folderName || '未知文件夹'}</span>
                                  <span className="text-gray-400"> 的 </span>
                                  <span className="text-gray-600">{m.imageName}</span>
                                </span>
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                <button
                                  onClick={() => handleJumpToDupFolder(m.folderId, m.folderName)}
                                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
                                  title="跳转到该文件夹"
                                >
                                  查看
                                </button>
                                <button
                                  onClick={() => handleDeleteDupImage(m.folderId, m.imageName)}
                                  disabled={dupDeleting}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                                  title="删除对方文件夹的此图"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {folderViewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredFolders.map(folder => (
          <div
            key={folder.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
            onClick={() => handleSelectFolder(folder)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingFolderId === folder.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => { if (editingIdRef.current === folder.id) handleRenameSubmit(folder.id) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(folder.id) }
                          else if (e.key === 'Escape') { e.preventDefault(); handleRenameCancel() }
                        }}
                        className="w-full px-2 py-1 text-sm font-semibold text-gray-900 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    ) : (
                      <h3
                        className="font-semibold text-gray-900 truncate cursor-text"
                        title="双击重命名"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(folder) }}
                      >
                        {folder.name}
                      </h3>
                    )}
                    <p className="text-sm text-gray-500 truncate">{getTemplateName(folder.templateId)}</p>
                  </div>
                </div>
                <div className="flex items-center flex-shrink-0 ml-2">
                  {editingFolderId !== folder.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(folder) }}
                      className="p-2 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="重命名"
                    >
                      <Pencil className="w-4 h-4 text-blue-500" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteFolder(folder.id)
                    }}
                    className="p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center space-x-4">
                  <span>区域: {folder.areaCount}</span>
                  <span>图片: {folder.images?.length || 0}</span>
                  <span>套图: {folder.mockups?.length || 0}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>

              {(() => {
                const dup = getFolderDupInfo(folder.id)
                if (dup.count === 0) return null
                const isExact = dup.hasExact
                return (
                  <div className="mt-3 flex items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDupDetailFolderId(dupDetailFolderId === folder.id ? null : folder.id)
                      }}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium text-white shadow-sm transition-transform hover:scale-105 ${isExact ? 'bg-red-500' : 'bg-orange-500'}`}
                      title={`含${isExact ? '完全' : '视觉近似'}重复，点击查看详情`}
                    >
                      <Copy className="w-3 h-3" />
                      <span>重复 {dup.count}</span>
                    </button>
                  </div>
                )
              })()}

              {folder.mockups && folder.mockups.length > 0 && folder.mockups[0]?.preview && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex -space-x-2">
                    {folder.mockups.slice(0, 3).map((mockup, index) => (
                      <img
                        key={index}
                        src={getImageUrl(mockup.preview)}
                        alt={mockup.groupName}
                        className="w-12 h-12 rounded-lg border-2 border-white object-contain"
                      />
                    ))}
                    {folder.mockups.length > 3 && (
                      <div className="w-12 h-12 rounded-lg border-2 border-white bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
                        +{folder.mockups.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {filteredFolders.map(folder => {
          const dup = getFolderDupInfo(folder.id)
          const isExact = dup.count > 0 && dup.hasExact
          return (
            <div
              key={folder.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group cursor-pointer"
              onClick={() => handleSelectFolder(folder)}
            >
              <div className="p-3 flex items-center space-x-3 md:space-x-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-blue-100">
                  {folder.mockups && folder.mockups.length > 0 && folder.mockups[0]?.preview ? (
                    <img
                      src={getImageUrl(folder.mockups[0].preview)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FolderOpen className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {editingFolderId === folder.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { if (editingIdRef.current === folder.id) handleRenameSubmit(folder.id) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(folder.id) }
                        else if (e.key === 'Escape') { e.preventDefault(); handleRenameCancel() }
                      }}
                      className="w-full max-w-xs px-2 py-1 text-sm font-semibold text-gray-900 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  ) : (
                    <h3
                      className="font-semibold text-gray-900 truncate cursor-text"
                      title="双击重命名"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(folder) }}
                    >
                      {folder.name}
                    </h3>
                  )}
                  <p className="text-xs text-gray-500 truncate">{getTemplateName(folder.templateId)}</p>
                </div>
                <div className="flex items-center space-x-3 md:space-x-4 ml-auto flex-shrink-0">
                  <div className="w-20 flex-shrink-0">
                    {dup.count > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDupDetailFolderId(dupDetailFolderId === folder.id ? null : folder.id)
                        }}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium text-white shadow-sm transition-transform hover:scale-105 ${isExact ? 'bg-red-500' : 'bg-orange-500'}`}
                        title={`含${isExact ? '完全' : '视觉近似'}重复，点击查看详情`}
                      >
                        <Copy className="w-3 h-3" />
                        <span>重复 {dup.count}</span>
                      </button>
                    )}
                  </div>
                  <div className="hidden md:flex items-center space-x-4 flex-shrink-0">
                    <div className="w-16 flex justify-between text-sm text-gray-500">
                      <span>区域</span>
                      <span className="tabular-nums">{folder.areaCount}</span>
                    </div>
                    <div className="w-16 flex justify-between text-sm text-gray-500">
                      <span>图片</span>
                      <span className="tabular-nums">{folder.images?.length || 0}</span>
                    </div>
                    <div className="w-16 flex justify-between text-sm text-gray-500">
                      <span>套图</span>
                      <span className="tabular-nums">{folder.mockups?.length || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center flex-shrink-0">
                  {editingFolderId !== folder.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(folder) }}
                      className="p-2 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="重命名"
                    >
                      <Pencil className="w-4 h-4 text-blue-500" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteFolder(folder.id)
                    }}
                    className="p-2 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-gray-400 ml-1" />
                </div>
              </div>
              </div>
            </div>
          )
        })}
      </div>
    )}

      {filteredFolders.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">暂无文件夹</h3>
          <p className="text-gray-500 mt-2">点击上方按钮新建图案文件夹</p>
        </div>
      )}
          </div>
        )}

        {activeSubTab === 'rename' && (
          <div className="p-4">
            <FileRenameTool />
          </div>
        )}

        {activeSubTab === 'duplicate' && (
          <div className="p-4 space-y-4">
            {/* 概览卡片 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-purple-50 rounded-xl p-4 text-center border border-purple-100">
                <div className="text-3xl font-bold text-purple-700">{ignoredSummary.visibleGroups || duplicateIndex.length}</div>
                <div className="text-sm text-purple-600 mt-1">显示中分组</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-200">
                <div className="text-3xl font-bold text-gray-700">{ignoredSummary.totalRawGroups || duplicateIndex.length}</div>
                <div className="text-sm text-gray-600 mt-1">原始总分组</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
                <div className="text-3xl font-bold text-amber-700">{ignoredGroupIds.length}</div>
                <div className="text-sm text-amber-600 mt-1">已忽略分组</div>
              </div>
            </div>

            {/* 操作栏 */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleStartScan}
                disabled={scanRunning}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${scanRunning ? 'animate-spin' : ''}`} />
                <span>{scanRunning ? '扫描中...' : '立即扫描全库'}</span>
              </button>
              <button
                onClick={handleClearDupIndex}
                disabled={scanRunning || duplicateIndex.length === 0}
                className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>清空重复记录</span>
              </button>
              <button
                onClick={() => window.open('#/settings?tab=duplicate', '_blank')}
                className="ml-auto px-3 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1"
                title="前往设置调整检测参数"
              >
                <Settings2 className="w-4 h-4" />
                <span>检测参数</span>
              </button>
            </div>

            {/* 进度条 */}
            {scanRunning && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>{scanTotal > 0 && scanProgress >= scanTotal ? '正在分组合并...' : `正在扫描... ${scanProgress}/${scanTotal || '?'}`}</span>
                  <span>{scanTotal ? Math.round(scanProgress * 100 / scanTotal) : 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${scanTotal ? Math.round(scanProgress * 100 / scanTotal) : 0}%` }} />
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {scanError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>扫描失败: {scanError}</span>
              </div>
            )}

            {/* 扫描结果汇总 */}
            {scanResult && !scanRunning && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div>扫描完成：发现 <b>{scanResult.totalGroups || 0}</b> 组重复，涉及 <b>{scanResult.scannedFolders || 0}</b> 个文件夹、<b>{scanResult.scannedImages || 0}</b> 张图片{(scanResult.skipped && scanResult.skipped.length) ? `，跳过 ${scanResult.skipped.length} 张损坏图片` : ''}。</div>
                  <div className="text-xs text-gray-500 mt-1">（当前显示 {ignoredSummary.visibleGroups || 0} 组，已忽略 {ignoredGroupIds.length} 组）</div>
                </div>
              </div>
            )}

            {/* 子 tab：分组列表 / 已忽略 */}
            <div className="flex items-center space-x-1 border-b border-gray-200">
              <button
                onClick={() => setDupIgnoredSubTab('active')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${dupIgnoredSubTab === 'active' ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                重复分组 <span className="ml-1 text-xs text-gray-400">({ignoredSummary.visibleGroups || duplicateIndex.length})</span>
              </button>
              <button
                onClick={() => setDupIgnoredSubTab('ignored')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${dupIgnoredSubTab === 'ignored' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                已忽略 <span className="ml-1 text-xs text-gray-400">({ignoredGroupIds.length})</span>
              </button>
            </div>

            {/* 重复分组列表 */}
            {dupIgnoredSubTab === 'active' && duplicateIndex.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {duplicateIndex.map((group, gIdx) => {
                    const isExact = group.type === 'exact'
                    return (
                      <div key={group.groupId || gIdx} className={`bg-white rounded-lg border ${isExact ? 'border-red-200' : 'border-orange-200'} p-4`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${isExact ? 'bg-red-500' : 'bg-orange-500'}`}>
                              {isExact ? '完全重复' : '视觉近似'}
                            </span>
                            <span className="text-sm text-gray-600">{(group.images || []).length} 张图片</span>
                          </div>
                          <button
                            onClick={() => handleIgnoreGroup(group.groupId)}
                            className="px-3 py-1 text-xs text-amber-700 border border-amber-300 rounded hover:bg-amber-50 flex items-center space-x-1"
                            title="忽略此分组，不再提示"
                          >
                            <span>忽略</span>
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(group.images || []).map((im, iIdx) => (
                            <div key={iIdx} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 border border-gray-100">
                              <div className="flex items-center space-x-2 min-w-0">
                                <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                                  <img src={getImageUrl(im.path)} alt={im.imageName} className="w-full h-full object-contain" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{im.imageName}</div>
                                  <div className="text-xs text-gray-500 truncate">📁 {im.folderName || '未知文件夹'}</div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                <button
                                  onClick={() => handleJumpToDupFolder(im.folderId, im.folderName)}
                                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
                                >
                                  跳转
                                </button>
                                <button
                                  onClick={() => handleDeleteDupImage(im.folderId, im.imageName)}
                                  disabled={dupDeleting}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                                  title="删除此图"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 已忽略分组列表 */}
            {dupIgnoredSubTab === 'ignored' && ignoredGroups.length > 0 && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start space-x-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>以下分组已被忽略，不会在主列表中显示。点击「恢复」可重新显示。</span>
                </div>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {ignoredGroups.map((group, gIdx) => {
                    const isExact = group.type === 'exact'
                    return (
                      <div key={group.groupId || gIdx} className={`bg-white rounded-lg border ${isExact ? 'border-red-200' : 'border-orange-200'} p-4 opacity-70`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${isExact ? 'bg-red-500' : 'bg-orange-500'}`}>
                              {isExact ? '完全重复' : '视觉近似'}
                            </span>
                            <span className="text-sm text-gray-600">{(group.images || []).length} 张图片</span>
                          </div>
                          <button
                            onClick={() => handleUnignoreGroup(group.groupId)}
                            className="px-3 py-1 text-xs text-green-700 border border-green-300 rounded hover:bg-green-50 flex items-center space-x-1"
                          >
                            <span>恢复</span>
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(group.images || []).map((im, iIdx) => (
                            <div key={iIdx} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 border border-gray-100">
                              <div className="flex items-center space-x-2 min-w-0">
                                <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                                  <img src={getImageUrl(im.path)} alt={im.imageName} className="w-full h-full object-contain" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{im.imageName}</div>
                                  <div className="text-xs text-gray-500 truncate">📁 {im.folderName || '未知文件夹'}</div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                <button
                                  onClick={() => handleJumpToDupFolder(im.folderId, im.folderName)}
                                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
                                >
                                  跳转
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 空状态 */}
            {dupIgnoredSubTab === 'active' && duplicateIndex.length === 0 && !scanRunning && (
              <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                <Copy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">暂无重复记录</p>
                {ignoredSummary.totalRawGroups > 0 && (
                  <p className="text-gray-400 text-xs mt-1">（有 {ignoredGroupIds.length} 组已被忽略，可切换到「已忽略」查看）</p>
                )}
                <p className="text-gray-400 text-xs mt-1">点击「立即扫描全库」开始检测</p>
              </div>
            )}

            {dupIgnoredSubTab === 'ignored' && ignoredGroups.length === 0 && (
              <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">暂无已忽略的分组</p>
                <p className="text-gray-400 text-xs mt-1">在「重复分组」中点击「忽略」即可加入此处</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">新建文件夹</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">文件夹名称</label>
                  <input
                    type="text"
                    value={newFolder.name}
                    onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="输入文件夹名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">贴图区域数量</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newFolder.areaCount}
                    onChange={(e) => setNewFolder({ ...newFolder, areaCount: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    图片命名规则：名称-区域编号.png<br/>
                    例如：0001-1.png（区域1）、0001-2.png（区域2）
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    创建文件夹
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情页单图重复详情弹出面板 */}
      {detailDupPopup && (() => {
        const { imageName, type, matches } = detailDupPopup
        const isExact = type === 'exact'
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setDetailDupPopup(null)}>
            <div className="absolute inset-0 bg-black/30" />
            <div
              className="relative bg-white rounded-t-2xl shadow-2xl w-full max-w-lg max-h-[60vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className={`px-5 py-3 text-white flex items-center justify-between ${isExact ? 'bg-red-500' : 'bg-orange-500'}`}>
                <div className="flex items-center space-x-2">
                  <Copy className="w-4 h-4" />
                  <span className="font-medium text-sm truncate">{imageName}</span>
                  <span className="text-xs opacity-90">· {isExact ? '完全重复' : '视觉近似'}</span>
                </div>
                <button onClick={() => setDetailDupPopup(null)} className="p-1 hover:bg-white/20 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {matches.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center space-x-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{m.folderName || '未知文件夹'}</div>
                        <div className="text-xs text-gray-500 truncate">{m.imageName}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                      <button
                        onClick={() => handleJumpToDupFolder(m.folderId, m.folderName)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
                      >
                        跳转
                      </button>
                      <button
                        onClick={() => {
                          handleDeleteDupImage(m.folderId, m.imageName)
                          setDetailDupPopup(null)
                        }}
                        disabled={dupDeleting}
                        className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                        title="删除对方文件夹的这张图"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {matches.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">暂无匹配记录</p>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <button
                  onClick={() => {
                    handleDeleteDupImage(selectedFolder.id, imageName)
                    setDetailDupPopup(null)
                  }}
                  disabled={dupDeleting}
                  className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 inline mr-1" />
                  删除当前图
                </button>
                <button
                  onClick={() => setDetailDupPopup(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {idleScanning && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-purple-600 text-white rounded-lg shadow-lg text-sm flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>空闲扫描中...</span>
        </div>
      )}
      {dupToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-gray-800 text-white rounded-lg shadow-lg text-sm flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{dupToast}</span>
        </div>
      )}

    </div>
  )
}

export default PatternManager