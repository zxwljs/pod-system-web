import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Loader2, Eye, Save, RotateCcw, Image } from 'lucide-react'
import { apiRequest, getImageUrl } from '../api/axios'
import AdjustableOverlay from './AdjustableOverlay'

/**
 * 套图单色微调弹窗（支持主图 + 细节图独立调整）
 *
 * Props:
 *   open          - 是否显示
 *   onClose       - 关闭回调
 *   folderId      - 文件夹 ID
 *   groupName     - 套图组名
 *   color         - 颜色对象 { name, url, detailImages, adjustments, detailAdjustments }
 *   onSaved       - 保存成功后回调 (updatedColor)
 *   templateId    - 模板 ID（用于获取 printAreas）
 */
export default function AdjustModal({
  open,
  onClose,
  folderId,
  groupName,
  color,
  onSaved,
  templateId,
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [template, setTemplate] = useState(null)
  const [templateColor, setTemplateColor] = useState(null)
  const [allDetailConfigs, setAllDetailConfigs] = useState([]) // 从模板所有颜色合并的 detailImages
  const [imageScale, setImageScale] = useState(1)
  const [detailImageScales, setDetailImageScales] = useState({})
  const [mainAdjustments, setMainAdjustments] = useState({})
  const [detailAdjustments, setDetailAdjustments] = useState({})
  const [activeImage, setActiveImage] = useState('main')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewing, setPreviewing] = useState(false)

  // ─── 打开时重置 ───
  useEffect(() => {
    if (open && color) {
      setActiveImage('main')
      setPreviewUrl(null)
      setError('')
    }
  }, [open, color])

  // ─── 加载模板 ───
  useEffect(() => {
    if (!open || !templateId) {
      console.log('[AdjustModal] skip fetch, open=', open, 'templateId=', templateId)
      return
    }
    console.log('[AdjustModal] fetching template', templateId)
    apiRequest(`/templates-v2/${templateId}`)
      .then(data => {
        console.log('[AdjustModal] template loaded, colors:', data.colors?.length, 'detailImages sample:', data.colors?.[0]?.detailImages?.length)
        setTemplate(data)
        // 找到匹配的颜色配置
        let matched = (data.colors || []).find(c => {
          const safe = (c.name || '').replace(/[\\/:*?"<>|]/g, '_')
          return safe === color?.name || c.name === color?.name
        })
        console.log('[AdjustModal] matched color:', matched?.name, 'color.name prop:', color?.name)
        if (!matched) {
          matched = (data.colors || []).find(c => c.detailImages?.length > 0) || null
          console.log('[AdjustModal] fallback matched:', matched?.name)
        }
        setTemplateColor(matched || null)

        // 从所有模板颜色中合并 detailImages（按 label 去重）
        const seen = new Set()
        const merged = []
        for (const c of (data.colors || [])) {
          for (const d of (c.detailImages || [])) {
            if (!d.label || seen.has(d.label)) continue
            seen.add(d.label)
            merged.push(d)
          }
        }
        console.log('[AdjustModal] merged detailImages:', merged.length, merged.map(d => ({ label: d.label, pa: d.printAreas?.length })))
        setAllDetailConfigs(merged)
      })
      .catch(err => {
        console.error('[AdjustModal] 加载模板失败:', err)
        setError('加载模板数据失败')
      })
  }, [open, templateId, color?.name])

  // ─── 主图 imageScale + 初始化主图 adjustments ───
  useEffect(() => {
    if (!template || !color?.url) return
    const img = new window.Image()
    img.onload = () => {
      const origW = template.originalWidth || img.width
      const scale = origW > 0 ? img.width / origW : 1
      setImageScale(scale)

      const areas = template.printAreas || []
      const initAdj = {}
      areas.forEach(a => {
        const adjKey = a.id || a.templateId
        const saved = color?.adjustments?.[adjKey]
        initAdj[adjKey] = saved ? { ...saved } : { dx: 0, dy: 0 }
      })
      setMainAdjustments(initAdj)
    }
    img.onerror = () => setImageScale(1)
    img.src = getImageUrl(color.url)
  }, [template, color?.url])

  // ─── 细节图 imageScale + 初始化 detailAdjustments ───
  useEffect(() => {
    if (!allDetailConfigs.length || !color?.detailImages?.length) return
    const scales = {}
    const initDetailAdj = {}
    let pending = 0

    allDetailConfigs.forEach((tdi) => {
      if (!tdi.printAreas?.length) return

      const mockupDI = (color.detailImages || []).find(d => d.label === tdi.label)
      if (!mockupDI?.url) {
        scales[tdi.label] = 1
      } else {
        pending++
        const img = new window.Image()
        img.onload = () => {
          const resultW = img.width
          if (tdi.imagePath) {
            const srcImg = new window.Image()
            srcImg.onload = () => {
              const srcW = srcImg.width || resultW
              scales[tdi.label] = srcW > 0 ? resultW / srcW : 1
              pending--
              if (pending === 0) setDetailImageScales({ ...scales })
            }
            srcImg.onerror = () => {
              scales[tdi.label] = 1
              pending--
              if (pending === 0) setDetailImageScales({ ...scales })
            }
            srcImg.src = getImageUrl(tdi.imagePath)
          } else {
            scales[tdi.label] = 1
            pending--
            if (pending === 0) setDetailImageScales({ ...scales })
          }
        }
        img.onerror = () => {
          scales[tdi.label] = 1
          pending--
          if (pending === 0) setDetailImageScales({ ...scales })
        }
        img.src = getImageUrl(mockupDI.url)
      }

      const existing = color?.detailAdjustments?.[tdi.label] || {}
      const imgAdj = {}
      tdi.printAreas.forEach(a => {
        const adjKey = a.id || a.templateId
        imgAdj[adjKey] = existing[adjKey] ? { ...existing[adjKey] } : { dx: 0, dy: 0 }
      })
      initDetailAdj[tdi.label] = imgAdj
    })

    setDetailAdjustments(initDetailAdj)
    if (pending === 0) setDetailImageScales({ ...scales })
  }, [allDetailConfigs, color?.detailImages])

  // ─── 当前选中图片的 areas ───
  const overlayAreas = useMemo(() => {
    if (activeImage === 'main') {
      const printAreas = template?.printAreas || []
      return printAreas.map(a => ({
        id: a.id || a.templateId,
        name: a.label || a.name || '印花',
        x: Math.round(a.x * imageScale),
        y: Math.round(a.y * imageScale),
        width: Math.round(a.width * imageScale),
        height: Math.round(a.height * imageScale),
        rotation: a.rotation || 0,
      }))
    }
    // 细节图
    const tdi = allDetailConfigs.find(d => d.label === activeImage)
    if (!tdi?.printAreas) return []
    const scale = detailImageScales[activeImage] || 1
    return tdi.printAreas.map(a => ({
      id: a.id || a.templateId,
      name: a.label || a.name || '印花',
      x: Math.round(a.x * scale),
      y: Math.round(a.y * scale),
      width: Math.round(a.width * scale),
      height: Math.round(a.height * scale),
      rotation: a.rotation || 0,
    }))
  }, [activeImage, template, allDetailConfigs, imageScale, detailImageScales])

  // ─── 当前选中图片的 adjustments ───
  const activeAdjustments = useMemo(() => {
    return activeImage === 'main' ? mainAdjustments : (detailAdjustments[activeImage] || {})
  }, [activeImage, mainAdjustments, detailAdjustments])

  // ─── 当前选中图片的 URL ───
  const activeImageUrl = useMemo(() => {
    if (activeImage === 'main') return getImageUrl(color?.url)
    const di = color?.detailImages?.find(d => d.label === activeImage)
    return di ? getImageUrl(di.url) : ''
  }, [activeImage, color])

  // ─── 可选的细节图列表（有 printAreas 的） ───
  const editableDetails = useMemo(() => {
    console.log('[AdjustModal] editableDetails: allDetailConfigs.length=', allDetailConfigs.length, allDetailConfigs.map(d => ({l:d.label,pa:d.printAreas?.length})))
    if (!allDetailConfigs.length) return []
    return allDetailConfigs
      .filter(tdi => tdi.printAreas?.length > 0)
      .map(tdi => ({ label: tdi.label, areaCount: tdi.printAreas.length }))
  }, [allDetailConfigs])

  // ─── 拖拽回调 ───
  const handleAdjust = useCallback((areaId, dx, dy) => {
    if (activeImage === 'main') {
      setMainAdjustments(prev => ({ ...prev, [areaId]: { dx, dy } }))
    } else {
      setDetailAdjustments(prev => ({
        ...prev,
        [activeImage]: { ...(prev[activeImage] || {}), [areaId]: { dx, dy } }
      }))
    }
    setPreviewUrl(null)
  }, [activeImage])

  // ─── 重置当前图片的 adjustments ───
  const handleReset = () => {
    if (activeImage === 'main') {
      const areas = template?.printAreas || []
      const initAdj = {}
      areas.forEach(a => { initAdj[a.id || a.templateId] = { dx: 0, dy: 0 } })
      setMainAdjustments(initAdj)
    } else {
      const tdi = allDetailConfigs.find(d => d.label === activeImage)
      if (tdi?.printAreas) {
        const initAdj = {}
        tdi.printAreas.forEach(a => { initAdj[a.id || a.templateId] = { dx: 0, dy: 0 } })
        setDetailAdjustments(prev => ({ ...prev, [activeImage]: initAdj }))
      }
    }
    setPreviewUrl(null)
  }

  // ─── 预览 ───
  const handlePreview = async () => {
    try {
      setPreviewing(true)
      setError('')
      const reqBody = {
        colorName: color?.name,
        adjustments: mainAdjustments,
        detailAdjustments,
      }
      const data = await apiRequest(
        `/folders/${folderId}/mockups/${encodeURIComponent(groupName)}/adjust-preview`,
        { method: 'POST', data: reqBody }
      )
      setPreviewUrl(getImageUrl(data.previewUrl))
    } catch (err) {
      setError(err.message || '预览失败')
    } finally {
      setPreviewing(false)
    }
  }

  // ─── 保存 ───
  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      const reqBody = {
        colorName: color?.name,
        adjustments: mainAdjustments,
        detailAdjustments,
      }
      await apiRequest(
        `/folders/${folderId}/mockups/${encodeURIComponent(groupName)}/adjust`,
        { method: 'POST', data: reqBody }
      )
      onSaved?.({
        ...color,
        adjustments: { ...mainAdjustments },
        detailAdjustments: JSON.parse(JSON.stringify(detailAdjustments)),
      })
      onClose()
    } catch (err) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ─── 是否有变更 ───
  const hasMainChanges = Object.values(mainAdjustments).some(a => (a.dx || 0) !== 0 || (a.dy || 0) !== 0)
  const hasDetailChanges = Object.values(detailAdjustments).some(
    adjMap => adjMap && typeof adjMap === 'object' && Object.values(adjMap).some(a => (a.dx || 0) !== 0 || (a.dy || 0) !== 0)
  )
  const hasChanges = hasMainChanges || hasDetailChanges

  if (!color) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" style={{ display: 'flex' }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">微调印花位置</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {groupName} / {color?.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* 图片选择标签 */}
          <div className="flex items-center space-x-1 mt-3 overflow-x-auto">
            <TabBtn
              active={activeImage === 'main'}
              onClick={() => setActiveImage('main')}
              label="主图"
            />
            {editableDetails.map(di => (
              <TabBtn
                key={di.label}
                active={activeImage === di.label}
                onClick={() => setActiveImage(di.label)}
                label={di.label}
                hasAdj={(() => {
                  const adjMap = detailAdjustments[di.label]
                  if (!adjMap || typeof adjMap !== 'object') return false
                  return Object.values(adjMap).some(a => (a.dx || 0) !== 0 || (a.dy || 0) !== 0)
                })()}
              />
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 主体 */}
        <div className="flex-1 overflow-auto p-6">
          {!template ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              加载模板数据中...
            </div>
          ) : (
            <div className="space-y-4">
              {/* 当前选中提示 */}
              {activeImage !== 'main' && (
                <div className="flex items-center space-x-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700">
                  <Image className="w-3.5 h-3.5" />
                  <span>
                    正在调整 <strong>「{activeImage}」</strong> 的印花位置
                    {detailImageScales[activeImage] && detailImageScales[activeImage] !== 1 && (
                      <span className="text-violet-500 ml-1">（缩放比: {(detailImageScales[activeImage] * 100).toFixed(0)}%）</span>
                    )}
                  </span>
                </div>
              )}

              {/* 预览图 */}
              {previewUrl && (
                <div className="border border-emerald-300 rounded-xl p-4 bg-emerald-50/50">
                  <h3 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center space-x-1">
                    <Eye className="w-4 h-4" />
                    <span>调整预览</span>
                    <span className="font-normal text-emerald-500">（含主图 + 细节图）</span>
                  </h3>
                  <img
                    src={previewUrl}
                    alt="调整预览"
                    className="max-h-[350px] mx-auto rounded-lg shadow"
                  />
                </div>
              )}

              {/* 拖拽编辑器 */}
              {activeImageUrl && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    {previewUrl ? '原图（继续调整）' : '拖拽蓝色虚线框调整位置'}
                  </h3>
                  <AdjustableOverlay
                    imageUrl={activeImageUrl}
                    areas={overlayAreas}
                    adjustments={activeAdjustments}
                    onChange={handleAdjust}
                  />
                </div>
              )}

              {/* 各区域偏移值 */}
              {overlayAreas.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {overlayAreas.map(area => {
                    const adj = activeAdjustments[area.id] || { dx: 0, dy: 0 }
                    const dx = adj.dx || 0
                    const dy = adj.dy || 0
                    return (
                      <div
                        key={area.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                          dx !== 0 || dy !== 0
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <span className="font-medium text-gray-700 truncate mr-2">
                          {area.name}
                        </span>
                        <div className="flex items-center space-x-3 text-gray-500">
                          <span>X: <strong className="text-gray-900">{dx}</strong></span>
                          <span>Y: <strong className="text-gray-900">{dy}</strong></span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 没有可调整区域 */}
              {overlayAreas.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">
                  {activeImage === 'main'
                    ? '该模板暂无印花区域'
                    : '该细节图未绑定印花区域，无需调整'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleReset}
            disabled={!hasChanges || saving || previewing}
            className="flex items-center space-x-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重置当前</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={handlePreview}
              disabled={previewing || saving}
              className="flex items-center space-x-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {previewing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              <span>预览</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving || previewing}
              className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>保存</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 标签按钮 ───
function TabBtn({ active, onClick, label, hasAdj = false }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : hasAdj
            ? 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {hasAdj && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
      <span>{label}</span>
    </button>
  )
}
