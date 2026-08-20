import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * 可拖拽印花区域覆盖层
 * 
 * Props:
 *   imageUrl      - 底板图片 URL
 *   areas         - [{ id, name, x, y, width, height, rotation? }] 结果图坐标系
 *   adjustments   - { [areaId]: { dx, dy } } 结果图像素偏移
 *   onChange      - (areaId, dx, dy) => void  拖拽时实时回调
 *   readOnly      - 是否只读（预览模式）
 */
export default function AdjustableOverlay({
  imageUrl,
  areas = [],
  adjustments = {},
  onChange,
  readOnly = false,
}) {
  const canvasRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [imgSize, setImgSize] = useState({
    width: 400, height: 533,
    naturalWidth: 0, naturalHeight: 0,
    displayScale: 1,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragAreaId, setDragAreaId] = useState(null)
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [dragStartDxDy, setDragStartDxDy] = useState({ dx: 0, dy: 0 })

  // 加载图片获取原始尺寸
  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.onload = () => {
      const maxW = 600
      const maxH = 700
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      setImgSize({
        width: img.width * scale,
        height: img.height * scale,
        naturalWidth: img.width,
        naturalHeight: img.height,
        displayScale: scale,
      })
    }
    img.src = imageUrl
  }, [imageUrl])

  // wheel 事件（passive: false 以便 preventDefault）
  useEffect(() => {
    const el = canvasRef.current
    if (!el || readOnly) return
    const handleWheel = (e) => {
      e.preventDefault()
      setZoom(prev => Math.max(0.25, Math.min(2, prev + (e.deltaY > 0 ? -0.1 : 0.1))))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [readOnly])

  // 鼠标事件
  const getAreaAt = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const ds = imgSize.displayScale || 1
    // 把屏幕像素转换回结果图像素坐标系
    const x = (clientX - rect.left) / zoom / ds
    const y = (clientY - rect.top) / zoom / ds
    // 反向查找（上层优先）
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i]
      const adj = adjustments[a.id] || { dx: 0, dy: 0 }
      const ax = a.x + (adj.dx || 0)
      const ay = a.y + (adj.dy || 0)
      if (x >= ax && x <= ax + a.width && y >= ay && y <= ay + a.height) {
        return a
      }
    }
    return null
  }, [areas, adjustments, zoom, imgSize.displayScale])

  const handleMouseDown = useCallback((e) => {
    if (readOnly) return
    const area = getAreaAt(e.clientX, e.clientY)
    if (area) {
      e.preventDefault()
      setIsDragging(true)
      setDragAreaId(area.id)
      setDragStartPos({ x: e.clientX, y: e.clientY })
      const adj = adjustments[area.id] || { dx: 0, dy: 0 }
      setDragStartDxDy({ dx: adj.dx || 0, dy: adj.dy || 0 })
    }
  }, [readOnly, getAreaAt, adjustments])

  useEffect(() => {
    if (!isDragging) return
    const ds = imgSize.displayScale || 1

    const handleMouseMove = (e) => {
      const dx = e.clientX - dragStartPos.x
      const dy = e.clientY - dragStartPos.y
      // 屏幕像素 → 结果图像素
      const imgDx = Math.round(dx / zoom / ds)
      const imgDy = Math.round(dy / zoom / ds)
      onChange(dragAreaId, dragStartDxDy.dx + imgDx, dragStartDxDy.dy + imgDy)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setDragAreaId(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStartPos, dragStartDxDy, dragAreaId, zoom, onChange, imgSize.displayScale])

  const containerStyle = {
    width: imgSize.width * zoom,
    height: imgSize.height * zoom,
    position: 'relative',
    overflow: 'hidden',
    cursor: readOnly ? 'default' : 'crosshair',
  }

  const ds = imgSize.displayScale || 1

  return (
    <div className="flex flex-col items-center">
      <div
        ref={canvasRef}
        style={containerStyle}
        className="bg-gray-100 rounded-lg shadow-inner select-none"
        onMouseDown={handleMouseDown}
      >
        {/* 底板图片 */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt="底板"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        )}

        {/* 印花区域覆盖层 */}
        {areas.map(area => {
          const adj = adjustments[area.id] || { dx: 0, dy: 0 }
          const dx = adj.dx || 0
          const dy = adj.dy || 0
          const x = (area.x + dx) * ds * zoom
          const y = (area.y + dy) * ds * zoom
          const w = area.width * ds * zoom
          const h = area.height * ds * zoom
          const hasAdjustment = dx !== 0 || dy !== 0

          return (
            <div
              key={area.id}
              className="absolute"
              style={{
                left: x,
                top: y,
                width: w,
                height: h,
                border: `2px dashed ${hasAdjustment ? '#f59e0b' : '#3b82f6'}`,
                backgroundColor: hasAdjustment ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.05)',
                transform: area.rotation ? `rotate(${area.rotation}deg)` : undefined,
                transformOrigin: 'center center',
                pointerEvents: readOnly ? 'none' : 'auto',
                cursor: 'move',
              }}
            >
              {/* 标签 */}
              <div className={`absolute top-0 left-0 right-0 text-white text-[10px] px-1 py-0.5 truncate ${
                hasAdjustment ? 'bg-amber-500' : 'bg-blue-500'
              }`}>
                {area.name || area.label}
                {hasAdjustment && ` (dx:${dx}, dy:${dy})`}
              </div>
            </div>
          )
        })}
      </div>

      {/* 缩放控件 */}
      <div className="flex items-center space-x-2 mt-2 text-xs text-gray-500">
        <button
          onClick={() => setZoom(z => Math.max(0.25, z - 0.1))}
          className="px-2 py-0.5 bg-gray-100 rounded hover:bg-gray-200"
          disabled={readOnly}
        >-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(2, z + 0.1))}
          className="px-2 py-0.5 bg-gray-100 rounded hover:bg-gray-200"
          disabled={readOnly}
        >+</button>
        <button
          onClick={() => setZoom(1)}
          className="px-2 py-0.5 text-gray-400 hover:text-gray-600"
          disabled={readOnly}
        >重置</button>
      </div>

      {!readOnly && areas.length > 0 && (
        <p className="text-xs text-gray-400 mt-1">拖拽蓝色虚线框调整印花位置，Ctrl+滚轮缩放</p>
      )}
    </div>
  )
}
