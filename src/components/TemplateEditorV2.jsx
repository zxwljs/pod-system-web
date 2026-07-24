import { useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest, apiUpload, getImageUrl } from '../api/axios';
import {
  X, Save, Plus, Trash2, Upload, AlertTriangle,
  Image as ImageIcon, Layers, Settings, Copy
} from 'lucide-react';

const DEFAULT_AREA_WIDTH = 200;
const DEFAULT_AREA_HEIGHT = 200;

// 把屏幕位移向量转换到元素本地（未旋转）坐标系
function toLocalDelta(dx, dy, rotationDeg) {
  const r = -rotationDeg * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    localDx: dx * cos - dy * sin,
    localDy: dx * sin + dy * cos,
  };
}

// 四角缩放：ddx/ddy 为本地坐标系下的位移（image 空间）
const MIN_AREA_SIZE = 50;
function applyResize(a, type, ddx, ddy) {
  switch (type) {
    case 'resize-se':
      return { ...a, width: Math.max(MIN_AREA_SIZE, a.width + ddx), height: Math.max(MIN_AREA_SIZE, a.height + ddy) };
    case 'resize-sw':
      return { ...a, x: a.x + ddx, width: Math.max(MIN_AREA_SIZE, a.width - ddx), height: Math.max(MIN_AREA_SIZE, a.height + ddy) };
    case 'resize-ne':
      return { ...a, y: a.y + ddy, width: Math.max(MIN_AREA_SIZE, a.width + ddx), height: Math.max(MIN_AREA_SIZE, a.height - ddy) };
    case 'resize-nw':
      return { ...a, x: a.x + ddx, y: a.y + ddy, width: Math.max(MIN_AREA_SIZE, a.width - ddx), height: Math.max(MIN_AREA_SIZE, a.height - ddy) };
    default:
      return a;
  }
}

// 判断点是否落在（可能旋转的）矩形内；x/y 为相对画布的坐标，sx/sy 为显示缩放
function pointInRotatedRect(px, py, ax, ay, aw, ah, rotationDeg, sx, sy) {
  const cx = (ax + aw / 2) * sx;
  const cy = (ay + ah / 2) * sy;
  const r = -rotationDeg * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= (aw * sx) / 2 && Math.abs(ly) <= (ah * sy) / 2;
}

const PrintArea = ({
  area,
  zoom,
  scale = { scaleX: 1, scaleY: 1 },
  isSelected,
  onMouseDown,
  theme = 'blue',
  showSourceInfo = false,
  sourceAreaName = ''
}) => {
  const { scaleX, scaleY } = scale;
  const displayX = area.x * scaleX;
  const displayY = area.y * scaleY;
  const displayWidth = area.width * scaleX;
  const displayHeight = area.height * scaleY;
  const rotation = area.rotation || 0;

  const colors = {
    blue: {
      border: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.1)',
      header: 'bg-blue-500',
      handle: '#3b82f6'
    },
    purple: {
      border: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.1)',
      header: 'bg-purple-500',
      handle: '#8b5cf6'
    }
  };

  const themeColors = colors[theme];
  const handleStyle = { borderColor: themeColors.handle };
  const cornerBase = "absolute w-3 h-3 bg-white rounded-sm shadow border-2";

  return (
    <div
      className={`absolute ${isSelected ? 'ring-2 ring-red-500 z-10' : 'z-0'}`}
      style={{
        left: displayX * zoom,
        top: displayY * zoom,
        width: displayWidth * zoom,
        height: displayHeight * zoom,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        border: `2px dashed ${themeColors.border}`,
        backgroundColor: themeColors.bg,
        cursor: 'move',
        transition: 'box-shadow 0.2s',
      }}
      onMouseDown={(e) => onMouseDown(e, area, 'move')}
    >
      {!showSourceInfo && (
        <div className={`absolute top-0 left-0 right-0 ${themeColors.header} text-white text-xs px-2 py-0.5 flex items-center justify-between`}>
          <span className="font-medium">{area.name || area.label}</span>
        </div>
      )}
      {showSourceInfo && sourceAreaName && (
        <div className={`absolute top-0 left-0 right-0 ${themeColors.header} text-white text-xs px-2 py-0.5 truncate`}>
          {sourceAreaName}
        </div>
      )}

      {isSelected && (
        <>
          {/* 四角缩放手柄 */}
          <div className={`${cornerBase} -top-1.5 -left-1.5 cursor-nwse-resize`} style={handleStyle} onMouseDown={(e) => onMouseDown(e, area, 'resize-nw')} />
          <div className={`${cornerBase} -top-1.5 -right-1.5 cursor-nesw-resize`} style={handleStyle} onMouseDown={(e) => onMouseDown(e, area, 'resize-ne')} />
          <div className={`${cornerBase} -bottom-1.5 -left-1.5 cursor-nesw-resize`} style={handleStyle} onMouseDown={(e) => onMouseDown(e, area, 'resize-sw')} />
          <div className={`${cornerBase} -bottom-1.5 -right-1.5 cursor-se-resize`} style={handleStyle} onMouseDown={(e) => onMouseDown(e, area, 'resize-se')} />

          {/* 顶部旋转手柄 */}
          <div
            className="absolute left-1/2 -translate-x-1/2 cursor-grab"
            style={{ top: '-44px', touchAction: 'none' }}
            onMouseDown={(e) => onMouseDown(e, area, 'rotate')}
          >
            <div className="w-0.5 h-7 mx-auto" style={{ backgroundColor: '#D85A30' }} />
            <div className="w-5 h-5 -mt-1 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: '#D85A30' }} />
            <svg width="22" height="12" className="block mx-auto -mt-2" style={{ overflow: 'visible' }}>
              <path d="M3,11 Q11,1 19,11" fill="none" stroke="#D85A30" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

function TemplateEditorV2() {
  const [template, setTemplate] = useState(null);
  const [name, setName] = useState('');
  
  const [skus, setSkus] = useState([]);
  const [activeSkuIndex, setActiveSkuIndex] = useState(0);
  const [activeDetailIndex, setActiveDetailIndex] = useState(null);

  const [designerMode, setDesignerMode] = useState('main');

  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [originalImageSize, setOriginalImageSize] = useState({ width: 0, height: 0 });
  const [detailCanvasSize, setDetailCanvasSize] = useState({ width: 800, height: 600 });
  const [detailOriginalSize, setDetailOriginalSize] = useState({ width: 0, height: 0 });
  const [detailScale, setDetailScale] = useState({ scaleX: 1, scaleY: 1 });
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(50);

  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedDetailArea, setSelectedDetailArea] = useState(null);

  // 主图设计框改为「每颜色(SKU)各自独立」：printAreas 派生自当前激活 SKU 的 mainPrintAreas。
  // 印花槽位标识 templateId 跨颜色保持一致，仅位置/尺寸/旋转可各颜色单独微调。
  const activeSku = skus[activeSkuIndex];
  const printAreas = activeSku?.mainPrintAreas || [];
  const setActiveMainPrintAreas = (updater) => {
    setSkus(prev => {
      if (!prev[activeSkuIndex]) return prev;
      const next = prev.map(sk => ({ ...sk }));
      const cur = next[activeSkuIndex].mainPrintAreas || [];
      const updated = typeof updater === 'function' ? updater(cur) : updater;
      next[activeSkuIndex] = { ...next[activeSkuIndex], mainPrintAreas: updated };
      return next;
    });
  };



  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [areaStart, setAreaStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const rafRef = useRef(null);
  const dragCenterRef = useRef(null);
  const zoomTargetRef = useRef(null);
  const isSaving = useRef(false);



  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash.split('?')[1] || '');
    const id = hashParams.get('id');
    
    if (id) {
      apiRequest(`/templates-v2/${id}`)
        .then(data => {
          setTemplate(data);
        })
        .catch(err => {
          console.error('加载模板失败:', err);
        });
    } else {
      setSkus([{
        id: 'sku_0',
        name: 'SKU1图',
        imagePath: '',
        preview: '',
        file: null,
        detailImages: []
      }]);
    }
  }, []);

  useEffect(() => {
    if (template) {
      setName(template.name);
      

      const loadedSkus = (template.colors || []).map((color, idx) => ({
        id: `sku_${idx}`,
        name: color.name,
        imagePath: color.imagePath,
        preview: getImageUrl(color.imagePath),
        file: null,
        detailImages: (color.detailImages || []).map((detail, dIdx) => ({
            id: `detail_${idx}_${dIdx}`,
            label: detail.label,
            type: detail.type || 'plain',
            imagePath: detail.imagePath,
            preview: getImageUrl(detail.imagePath),
            file: null,
            printAreas: (detail.printAreas || []).map((a, aIdx) => ({
              ...a,
              id: a.id || `detail_area_${idx}_${dIdx}_${aIdx}`,
              sourceAreaId: a.sourceAreaId || a.templateId || null,
              name: a.name || a.label || `区域${aIdx + 1}`
            }))
          }))
      }));
      setSkus(loadedSkus);

      if (loadedSkus.length > 0) {
        const firstSku = loadedSkus[0];
        const img = new Image();
        img.onload = () => {
          const originalWidth = template.originalWidth || img.width;
          const originalHeight = template.originalHeight || img.height;
          setOriginalImageSize({ width: originalWidth, height: originalHeight });

          const scale = Math.min(800 / originalWidth, 600 / originalHeight);
          const scaledWidth = originalWidth * scale;
          const scaledHeight = originalHeight * scale;
          setCanvasSize({ width: scaledWidth, height: scaledHeight });

          const scaleX = scaledWidth / originalWidth;
          const scaleY = scaledHeight / originalHeight;

          // 每个颜色(SKU)各自加载主图设计框：新格式取 color.printAreas；
          // 旧模板无 color.printAreas 时回退到模板级 template.printAreas（所有颜色同位置，保持向后兼容）。
          setSkus(prev => prev.map((sk, idx) => {
            const colorCfg = template.colors?.[idx];
            const srcAreas = (colorCfg?.printAreas && colorCfg.printAreas.length > 0)
              ? colorCfg.printAreas
              : (template.printAreas || []);
            const scaledAreas = srcAreas.map((a, i) => ({
              ...a,
              id: a.id || `area_${i}`,
              templateId: a.id || a.templateId || `area_${i}`,
              name: a.label || a.name || `印花${i + 1}`,
              x: a.x * scaleX,
              y: a.y * scaleY,
              width: a.width * scaleX,
              height: a.height * scaleY,
              rotation: a.rotation || 0,
            }));
            return { ...sk, mainPrintAreas: scaledAreas };
          }));
        };
        img.src = firstSku.preview;
      }
    } else {
      setSkus([{
        id: 'sku_0',
        name: 'SKU1图',
        imagePath: '',
        preview: '',
        file: null,
        detailImages: []
      }]);
    }
  }, [template]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || (!selectedArea && !selectedDetailArea)) return;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;

        // 指针位移换算到 area（图像）坐标系：渲染时坐标乘了 zoom（细节图还乘了 detailScale），
        // 这里除回去，保证拖拽/缩放 1:1 跟手，否则 zoom≠1 时框会按 zoom 倍速漂移（"飘逸"）。
        const modeScaleX = (designerMode === 'detail' ? (detailScale?.scaleX || 1) : 1) * zoom;
        const modeScaleY = (designerMode === 'detail' ? (detailScale?.scaleY || 1) : 1) * zoom;
        const dxArea = modeScaleX !== 0 ? dx / modeScaleX : dx;
        const dyArea = modeScaleY !== 0 ? dy / modeScaleY : dy;

        if (designerMode === 'detail' && selectedDetailArea !== null) {
          setSkus(prev => {
            const next = prev.map(sk => ({ ...sk }));
            const detail = { ...next[activeSkuIndex].detailImages[activeDetailIndex] };
            let areas = detail.printAreas.map(a => ({ ...a }));

            areas = areas.map(a => {
              if (a.id !== selectedDetailArea) return a;
              if (dragType === 'rotate') {
                const c = dragCenterRef.current;
                if (!c) return a;
                const cur = Math.atan2(e.clientY - c.y, e.clientX - c.x);
                let deg = c.startRotation + (cur - c.startAngle) * 180 / Math.PI;
                if (e.shiftKey) deg = Math.round(deg / 15) * 15;
                return { ...a, rotation: Math.round(deg) };
              }
              if (dragType && dragType.startsWith('resize')) {
                const { localDx, localDy } = toLocalDelta(dxArea, dyArea, areaStart.rotation || 0);
                return { ...a, ...applyResize(areaStart, dragType, localDx, localDy) };
              }
              if (dragType === 'move') {
                return { ...a, x: areaStart.x + dxArea, y: areaStart.y + dyArea };
              }
              return a;
            });

            detail.printAreas = areas;
            next[activeSkuIndex] = { ...next[activeSkuIndex], detailImages: next[activeSkuIndex].detailImages.map((d, i) => i === activeDetailIndex ? detail : d) };
            return next;
          });
        } else if (designerMode === 'main' && selectedArea) {
          setSkus(prev => {
            if (!prev[activeSkuIndex]) return prev;
            const next = prev.map(sk => ({ ...sk }));
            const cur = next[activeSkuIndex].mainPrintAreas || [];
            const updated = cur.map(a => {
              if (a.templateId !== selectedArea) return a;
              if (dragType === 'rotate') {
                const c = dragCenterRef.current;
                if (!c) return a;
                const curAngle = Math.atan2(e.clientY - c.y, e.clientX - c.x);
                let deg = c.startRotation + (curAngle - c.startAngle) * 180 / Math.PI;
                if (e.shiftKey) deg = Math.round(deg / 15) * 15;
                return { ...a, rotation: Math.round(deg) };
              }
              if (dragType && dragType.startsWith('resize')) {
                const { localDx, localDy } = toLocalDelta(dxArea, dyArea, areaStart.rotation || 0);
                return { ...a, ...applyResize(areaStart, dragType, localDx, localDy) };
              }
              if (dragType === 'move') {
                return { ...a, x: areaStart.x + dxArea, y: areaStart.y + dyArea };
              }
              return a;
            });
            next[activeSkuIndex] = { ...next[activeSkuIndex], mainPrintAreas: updated };
            return next;
          });
        }
      });
    };

    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setIsDragging(false);
      setDragType(null);
    };

    const handleMouseLeave = (e) => {
      if (e.clientX < 0 || e.clientX > window.innerWidth ||
          e.clientY < 0 || e.clientY > window.innerHeight) {
        handleMouseUp();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isDragging, selectedArea, selectedDetailArea, dragType, dragStart, areaStart, designerMode, activeSkuIndex, activeDetailIndex, zoom, detailScale]);

  const handleAreaMouseDown = useCallback((e, area, type, isDetail = false) => {
    e.stopPropagation();
    setSelectedArea(isDetail ? null : area.templateId || area.id);
    setSelectedDetailArea(isDetail ? area.id : null);
    setIsDragging(true);
    setDragType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
    setAreaStart({ x: area.x, y: area.y, width: area.width, height: area.height, rotation: area.rotation || 0 });

    if (type === 'rotate') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const sx = isDetail ? (detailScale?.scaleX || 1) : 1;
        const sy = isDetail ? (detailScale?.scaleY || 1) : 1;
        const cx = rect.left + (area.x + area.width / 2) * sx * zoom;
        const cy = rect.top + (area.y + area.height / 2) * sy * zoom;
        dragCenterRef.current = {
          x: cx,
          y: cy,
          startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
          startRotation: area.rotation || 0,
        };
      }
    }
  }, [detailScale, zoom]);

  const handleCanvasMouseDown = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (designerMode === 'detail') {
      const targetAreas = skus[activeSkuIndex]?.detailImages[activeDetailIndex]?.printAreas || [];
      const { scaleX, scaleY } = detailScale || { scaleX: 1, scaleY: 1 };
      const clickedArea = targetAreas.find(area =>
        pointInRotatedRect(x, y, area.x, area.y, area.width, area.height, area.rotation || 0, scaleX, scaleY)
      );
      if (!clickedArea) {
        setSelectedDetailArea(null);
        setSelectedArea(null);
      }
    } else {
      const clickedArea = printAreas.find(area =>
        pointInRotatedRect(x, y, area.x, area.y, area.width, area.height, area.rotation || 0, 1, 1)
      );
      if (!clickedArea) {
        setSelectedArea(null);
        setSelectedDetailArea(null);
      }
    }
  };

  const addSku = () => {
    // 新颜色继承当前激活颜色的主图槽位（templateId 一致，位置作为起始值，之后可单独微调），
    // 保证各颜色印花槽位数量一致（后端按槽位序号匹配图案）。
    const baseAreas = (skus[activeSkuIndex]?.mainPrintAreas || []).map(a => ({ ...a }));
    setSkus([...skus, {
      id: `sku_${skus.length}`,
      name: `SKU${skus.length + 1}图`,
      imagePath: '',
      preview: '',
      file: null,
      detailImages: [],
      mainPrintAreas: baseAreas
    }]);
  };

  const removeSku = (index) => {
    if (skus.length <= 1) {
      alert('至少需要保留一个颜色');
      return;
    }
    const removedSku = skus[index];
    removedSku?.detailImages?.forEach(detail => {
      if (detail?.preview && detail.preview.startsWith('blob:')) {
        URL.revokeObjectURL(detail.preview);
      }
    });
    if (removedSku?.preview && removedSku.preview.startsWith('blob:')) {
      URL.revokeObjectURL(removedSku.preview);
    }
    const newSkus = skus.filter((_, i) => i !== index);
    setSkus(newSkus);
    if (activeSkuIndex >= newSkus.length) {
      setActiveSkuIndex(newSkus.length - 1);
    }
  };

  const handleSkuImageChange = (index, e) => {
    const file = e.target.files[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      const newSkus = [...skus];
      newSkus[index] = {
        ...newSkus[index],
        file,
        preview: previewUrl
      };
      setSkus(newSkus);

      if (index === activeSkuIndex) {
        const img = new Image();
        img.onload = () => {
          const originalWidth = img.width;
          const originalHeight = img.height;

          setOriginalImageSize({ width: originalWidth, height: originalHeight });

          const scale = Math.min(800 / originalWidth, 600 / originalHeight);
          const scaledWidth = originalWidth * scale;
          const scaledHeight = originalHeight * scale;
          setCanvasSize({ width: scaledWidth, height: scaledHeight });

          if (printAreas.length === 0) {
            const centerX = scaledWidth / 2 - 100;
            const centerY = scaledHeight / 2 - 100;
            setActiveMainPrintAreas([{
              id: Date.now().toString(),
              templateId: Date.now().toString(),
              name: '印花1',
              label: '印花1',
              x: centerX,
              y: centerY,
              width: 200,
              height: 200,
              fillMode: 'contain',
              rotation: 0,
            }]);
          }
        };
        img.src = previewUrl;
      }
    }
    e.target.value = '';
  };

  const addDetailImage = (files) => {
    const newSkus = [...skus];
    const sku = { ...newSkus[activeSkuIndex] };
    const newDetails = [...sku.detailImages];

    Array.from(files).forEach((file) => {
      const previewUrl = URL.createObjectURL(file);
      newDetails.push({
        id: `detail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        label: `细节图${newDetails.length + 1}`,
        type: 'plain',
        imagePath: '',
        preview: previewUrl,
        file,
        printAreas: []
      });
    });

    sku.detailImages = newDetails;
    newSkus[activeSkuIndex] = sku;
    setSkus(newSkus);
  };

  const removeDetailImage = (detailIndex) => {
    const newSkus = [...skus];
    const removedDetail = newSkus[activeSkuIndex].detailImages[detailIndex];
    if (removedDetail?.preview && removedDetail.preview.startsWith('blob:')) {
      URL.revokeObjectURL(removedDetail.preview);
    }
    newSkus[activeSkuIndex].detailImages =
      newSkus[activeSkuIndex].detailImages.filter((_, i) => i !== detailIndex);
    setSkus(newSkus);
    if (activeDetailIndex === detailIndex) {
      setActiveDetailIndex(null);
      setDesignerMode('main');
    }
  };

  const copyDetailPrintAreasToAllSkus = () => {
    if (skus.length < 2) return;

    const firstSku = skus[0];
    const newSkus = [...skus];

    for (let skuIndex = 1; skuIndex < newSkus.length; skuIndex++) {
      const targetSku = { ...newSkus[skuIndex] };
      const targetDetails = [...targetSku.detailImages];

      for (let detailIndex = 0; detailIndex < firstSku.detailImages.length; detailIndex++) {
        const sourceDetail = firstSku.detailImages[detailIndex];
        if (!sourceDetail.printAreas || sourceDetail.printAreas.length === 0) {
          continue;
        }

        if (detailIndex < targetDetails.length) {
          const targetDetail = { ...targetDetails[detailIndex] };
          targetDetail.printAreas = sourceDetail.printAreas.map(area => ({
            ...area,
            id: `detail_area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }));
          targetDetails[detailIndex] = targetDetail;
        }
      }

      targetSku.detailImages = targetDetails;
      newSkus[skuIndex] = targetSku;
    }

    setSkus(newSkus);
  };

  const addDetailAreaFromMain = (detailIndex, mainAreaId) => {
    const newSkus = [...skus];
    const detail = { ...newSkus[activeSkuIndex].detailImages[detailIndex] };
    const mainArea = printAreas.find(a => a.templateId === mainAreaId);
    if (!mainArea) return;

    const img = new Image();
    img.onload = () => {
      const originalWidth = img.width;
      const originalHeight = img.height;

      const mainScaleX = (originalImageSize.width || canvasSize.width) / canvasSize.width;
      const mainScaleY = (originalImageSize.height || canvasSize.height) / canvasSize.height;

      const originalMainAreaWidth = mainArea.width * mainScaleX;
      const originalMainAreaHeight = mainArea.height * mainScaleY;

      detail.printAreas.push({
        id: `detail_area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceAreaId: mainAreaId,
        label: mainArea.name,
        name: `引用: ${mainArea.name}`,
        x: originalWidth / 2 - originalMainAreaWidth / 2,
        y: originalHeight / 2 - originalMainAreaHeight / 2,
        width: originalMainAreaWidth,
        height: originalMainAreaHeight,
        fillMode: mainArea.fillMode || 'contain',
        rotation: 0,
      });

      newSkus[activeSkuIndex].detailImages[detailIndex] = detail;
      setSkus(newSkus);
    };
    img.src = detail.preview;
  };

const addBlankDetailArea = () => {
  // 🔧 修复 H11:守卫 activeSkuIndex / activeDetailIndex,避免 TypeError 崩溃编辑器
  if (activeSkuIndex === null || activeSkuIndex === undefined) {
    console.warn('[addBlankDetailArea] activeSkuIndex 未设置,已跳过');
    return;
  }
  if (activeDetailIndex === null || activeDetailIndex === undefined) {
    console.warn('[addBlankDetailArea] activeDetailIndex 未设置,已跳过');
    return;
  }
  const targetSku = skus[activeSkuIndex];
  if (!targetSku) {
    console.warn('[addBlankDetailArea] 目标 SKU 不存在');
    return;
  }
  const targetDetail = targetSku.detailImages?.[activeDetailIndex];
  if (!targetDetail) {
    console.warn('[addBlankDetailArea] 目标 detailImage 不存在');
    return;
  }
  if (!targetDetail.printAreas) {
    targetDetail.printAreas = [];
  }
  const newSkus = [...skus];
  const detail = { ...newSkus[activeSkuIndex].detailImages[activeDetailIndex] };
  if (!detail.printAreas) {
    detail.printAreas = [];
  }

  const img = new Image();
  img.onload = () => {
    const originalWidth = img.width;
    const originalHeight = img.height;
    const defaultSize = 200;

    const maxDetailIndex = detail.printAreas.reduce((max, a) => {
      const match = a.name.match(/区域(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    const newDetailIndex = maxDetailIndex + 1;
    detail.printAreas.push({
      id: `detail_area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceAreaId: null,
      label: `区域${newDetailIndex}`,
      name: `区域${newDetailIndex}`,
      x: originalWidth / 2 - defaultSize / 2,
      y: originalHeight / 2 - defaultSize / 2,
      width: defaultSize,
      height: defaultSize,
      fillMode: 'cover',
      rotation: 0,
    });

    newSkus[activeSkuIndex].detailImages[activeDetailIndex] = detail;
    setSkus(newSkus);
  };
  img.src = detail.preview;
};

const handleDetailImageSelect = (detailIndex) => {
    const detail = skus[activeSkuIndex]?.detailImages[detailIndex];
    if (!detail?.preview) return;

    setActiveDetailIndex(detailIndex);
    setDesignerMode('detail');

    const img = new Image();
    img.onload = () => {
      const originalWidth = img.width;
      const originalHeight = img.height;

      setDetailOriginalSize({ width: originalWidth, height: originalHeight });

      const scale = Math.min(800 / originalWidth, 600 / originalHeight);
      const scaledWidth = originalWidth * scale;
      const scaledHeight = originalHeight * scale;
      setDetailCanvasSize({ width: scaledWidth, height: scaledHeight });

      const scaleX = scaledWidth / originalWidth;
      const scaleY = scaledHeight / originalHeight;
      setDetailScale({ scaleX, scaleY });
    };
    img.src = detail.preview;
  };

  const addAreaTemplate = () => {
    // 印花槽位是全局概念（图案按槽位序号匹配），新增槽位需同步到所有颜色，
    // 保证各颜色槽位数量一致；初始位置相同，之后各颜色可单独微调。
    const maxIndex = printAreas.reduce((max, a) => {
      const match = a.name.match(/印花(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    const newIndex = maxIndex + 1;
    const templateId = Date.now().toString();
    const newArea = {
      id: templateId,
      templateId,
      name: `印花${newIndex}`,
      label: `印花${newIndex}`,
      x: canvasSize.width / 2 - DEFAULT_AREA_WIDTH / 2,
      y: canvasSize.height / 2 - DEFAULT_AREA_HEIGHT / 2,
      width: DEFAULT_AREA_WIDTH,
      height: DEFAULT_AREA_HEIGHT,
      fillMode: 'contain',
      rotation: 0,
    };
    setSkus(prev => prev.map(sk => ({
      ...sk,
      mainPrintAreas: [...(sk.mainPrintAreas || []), { ...newArea }]
    })));
  };

  const removeAreaTemplate = (templateId) => {
    // 删除槽位需同步到所有颜色，保持槽位一致。
    setSkus(prev => prev.map(sk => ({
      ...sk,
      mainPrintAreas: (sk.mainPrintAreas || []).filter(a => a.templateId !== templateId)
    })));
    if (selectedArea === templateId) setSelectedArea(null);
  };

  const updateAreaTemplate = (templateId, updates) => {
    // 位置/尺寸/旋转等属性微调仅作用于当前激活颜色。
    setActiveMainPrintAreas(prev => prev.map(a => a.templateId === templateId ? { ...a, ...updates } : a));
  };

  // 把当前激活颜色的主图设计框（含位置/尺寸/旋转）复制到其它所有颜色。
  // 保留 templateId（槽位标识不变），其它颜色可在此基础上单独微调。
  const copyMainPrintAreasToAllSkus = () => {
    if (skus.length < 2) return;
    const srcAreas = skus[activeSkuIndex]?.mainPrintAreas || [];
    if (srcAreas.length === 0) {
      alert('当前颜色还没有主图设计框，无法复制');
      return;
    }
    setSkus(prev => prev.map((sk, idx) => {
      if (idx === activeSkuIndex) return sk;
      return { ...sk, mainPrintAreas: srcAreas.map(a => ({ ...a })) };
    }));
  };

  const updateDetailPrintArea = (detailIndex, areaId, updates) => {
    const newSkus = [...skus];
    const detail = { ...newSkus[activeSkuIndex].detailImages[detailIndex] };
    detail.printAreas = detail.printAreas.map(a => a.id === areaId ? { ...a, ...updates } : a);
    newSkus[activeSkuIndex] = { ...newSkus[activeSkuIndex], detailImages: newSkus[activeSkuIndex].detailImages.map((d, i) => i === detailIndex ? detail : d) };
    setSkus(newSkus);
  };

  const removeDetailPrintArea = (detailIndex, areaId) => {
    const detail = skus[activeSkuIndex]?.detailImages[detailIndex];
    if (!detail) return;
    setSkus(prevSkus => {
      const newSkus = [...prevSkus];
      const targetDetail = { ...newSkus[activeSkuIndex].detailImages[detailIndex] };
      targetDetail.printAreas = targetDetail.printAreas.filter(a => a.id !== areaId);
      newSkus[activeSkuIndex] = { 
        ...newSkus[activeSkuIndex], 
        detailImages: newSkus[activeSkuIndex].detailImages.map((d, i) => i === detailIndex ? targetDetail : d) 
      };
      return newSkus;
    });
    if (selectedDetailArea === areaId) setSelectedDetailArea(null);
  };

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      alert('请输入模板名称');
      return;
    }

    if (isSaving.current) return;
    isSaving.current = true;

    try {
      let originalWidth = originalImageSize.width || canvasSize.width;
      let originalHeight = originalImageSize.height || canvasSize.height;

      const scaleX = originalWidth / canvasSize.width;
      const scaleY = originalHeight / canvasSize.height;

      const colorsData = skus.map(sku => ({
        name: sku.name,
        imagePath: sku.imagePath || '',
        // 每颜色各自的主图设计框（还原为原图像素坐标）；id=templateId 作为跨颜色一致的槽位标识
        printAreas: (sku.mainPrintAreas || []).map(a => ({
          id: a.templateId,
          label: a.name,
          x: Math.round(a.x * scaleX),
          y: Math.round(a.y * scaleY),
          width: Math.round(a.width * scaleX),
          height: Math.round(a.height * scaleY),
          fillMode: a.fillMode || 'contain',
          rotation: Math.round(a.rotation || 0)
        })),
        detailImages: sku.detailImages.map(detail => ({
          label: detail.label,
          type: detail.type,
          imagePath: detail.imagePath || '',
          printAreas: detail.printAreas.map(a => ({
            label: a.name || a.label,
            sourceAreaId: a.sourceAreaId || a.templateId,
            x: Math.round(a.x),
            y: Math.round(a.y),
            width: Math.round(a.width),
            height: Math.round(a.height),
            fillMode: a.fillMode || 'contain',
            rotation: Math.round(a.rotation || 0)
          }))
        }))
      }));

      const formData = new FormData();
      // 顶层 printAreas 作为「槽位定义」保留（向后兼容旧读取 + 后端按 sourceAreaId 回查主图槽位）；
      // 取首个颜色的主图框作为槽位模板，各颜色的实际位置存在 colors[].printAreas。
      const templateAreas = (skus[0]?.mainPrintAreas || []);
      formData.append('data', JSON.stringify({
        name,
        printAreas: templateAreas.map(a => ({
          id: a.templateId,
          label: a.name,
          x: Math.round(a.x * scaleX),
          y: Math.round(a.y * scaleY),
          width: Math.round(a.width * scaleX),
          height: Math.round(a.height * scaleY),
          fillMode: a.fillMode || 'contain',
          rotation: Math.round(a.rotation || 0)
        })),
        colors: colorsData
      }));

      const colorFileIndices = [];
      const detailCounts = [];

      skus.forEach((sku, i) => {
        if (sku.file) colorFileIndices.push(i);
        detailCounts.push(sku.detailImages.filter(d => d.file).length);
      });

      formData.append('colorFileIndices', JSON.stringify(colorFileIndices));
      formData.append('detailCounts', JSON.stringify(detailCounts));

      skus.forEach(sku => {
        if (sku.file) formData.append('images', sku.file);
        sku.detailImages.forEach(detail => {
          if (detail.file) formData.append('images', detail.file);
        });
      });

      if (template) {
        await apiUpload(`/templates-v2/${template.id}`, formData, { method: 'PUT' });
      } else {
        await apiUpload('/templates-v2', formData);
      }
      localStorage.removeItem(`template_editor_${template?.id || 'new'}`);
      window.location.hash = '#templates-v2';
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      isSaving.current = false;
    }
  }, [name, template, skus, canvasSize, originalImageSize]);

  const activeDetail = activeSku?.detailImages[activeDetailIndex];
  const currentCanvasSize = designerMode === 'detail' ? detailCanvasSize : canvasSize;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedArea(null);
        setSelectedDetailArea(null);
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedArea || selectedDetailArea)) {
        e.preventDefault();
        if (designerMode === 'main' && selectedArea) {
          setSkus(prev => prev.map(sk => ({
            ...sk,
            mainPrintAreas: (sk.mainPrintAreas || []).filter(a => a.templateId !== selectedArea)
          })));
          setSelectedArea(null);
        } else if (designerMode === 'detail' && selectedDetailArea) {
          setSkus(prev => {
            const newSkus = prev.map(sk => ({ ...sk }));
            const detail = { ...newSkus[activeSkuIndex].detailImages[activeDetailIndex] };
            detail.printAreas = detail.printAreas.filter(a => a.id !== selectedDetailArea);
            newSkus[activeSkuIndex] = { ...newSkus[activeSkuIndex], detailImages: newSkus[activeSkuIndex].detailImages.map((d, i) => i === activeDetailIndex ? detail : d) };
            return newSkus;
          });
          setSelectedDetailArea(null);
        }
      }

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedArea, selectedDetailArea, designerMode, activeDetailIndex, activeSkuIndex, handleSave]);

  // 滚轮缩放后保持鼠标指向的图像点不动（以鼠标为中心缩放），避免"缩放不跟鼠标"。
  useEffect(() => {
    const target = zoomTargetRef.current;
    if (!target) return;
    zoomTargetRef.current = null;

    const scroller = canvasRef.current?.parentElement;
    if (!scroller) return;

    requestAnimationFrame(() => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      if (!canvasRect || !scrollerRect) return;

      const desiredCanvasLeft = target.clientX - target.imgX * target.newZoom;
      const desiredCanvasTop = target.clientY - target.imgY * target.newZoom;
      scroller.scrollLeft += canvasRect.left - desiredCanvasLeft;
      scroller.scrollTop += canvasRect.top - desiredCanvasTop;
    });
  }, [zoom]);

  

  useEffect(() => {
    return () => {
      skus.forEach(sku => {
        if (sku?.preview && sku.preview.startsWith('blob:')) {
          URL.revokeObjectURL(sku.preview);
        }
        sku?.detailImages?.forEach(detail => {
          if (detail?.preview && detail.preview.startsWith('blob:')) {
            URL.revokeObjectURL(detail.preview);
          }
        });
      });
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-gray-100 flex flex-col overflow-hidden">

      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => window.location.hash = '#templates-v2'}
            className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <X className="w-5 h-5" />
            <span>返回模板列表</span>
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <h1 className="text-xl font-semibold text-gray-900">{template ? '编辑模板' : '新建模板'}</h1>
        </div>

        <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setDesignerMode('main')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  designerMode === 'main'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Layers className="w-4 h-4 inline mr-1" />
                主图设计
              </button>
              <button
                onClick={() => activeDetail && setDesignerMode('detail')}
                disabled={!activeDetail}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  designerMode === 'detail'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                <ImageIcon className="w-4 h-4 inline mr-1" />
                细节图设计
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setZoom(z => Math.max(0.25, z - 0.1))}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="缩小"
                >
                  <span className="text-lg">−</span>
                </button>
                <span className="text-sm text-gray-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(3, z + 0.1))}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="放大"
                >
                  <span className="text-lg">+</span>
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="p-1 hover:bg-gray-200 rounded ml-1"
                  title="重置缩放"
                >
                  <span className="text-xs">1:1</span>
                </button>
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`p-1 hover:bg-gray-200 rounded ml-2 ${showGrid ? 'bg-blue-100 text-blue-600' : ''}`}
                  title="切换网格"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3h18v18H3z" strokeDasharray="4 4"/>
                    <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
                  </svg>
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving.current}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSaving.current ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{isSaving.current ? '保存中...' : '保存模板'}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
            <div className="w-64 bg-gray-50 border-r border-gray-200 p-3 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">模板名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="输入模板名称"
                />
              </div>

              

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">SKU颜色列表</label>
                <div className="space-y-2">
                  {skus.map((sku, index) => (
                    <div
                      key={sku.id}
                      className={`p-2 rounded-lg border cursor-pointer transition-all ${
                        activeSkuIndex === index
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => {
                        setActiveSkuIndex(index);
                        setDesignerMode('main');
                        setActiveDetailIndex(null);
                      }}
                    >
                      {sku.preview ? (
                        <img src={sku.preview} alt={sku.name} className="w-full h-16 object-contain rounded mb-2" />
                      ) : (
                        <div className="w-full h-16 bg-gray-200 rounded mb-2 flex items-center justify-center text-gray-400 text-sm">
                          {sku.name}
                        </div>
                      )}
                      <input
                        type="text"
                        value={sku.name}
                        onChange={(e) => {
                          const newSkus = [...skus];
                          newSkus[index].name = e.target.value;
                          setSkus(newSkus);
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded mb-2"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSkuImageChange(index, e)}
                        className="hidden"
                        id={`sku-file-${index}`}
                      />
                      <label
                        htmlFor={`sku-file-${index}`}
                        className="flex items-center justify-center w-full px-2 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 cursor-pointer"
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        选择图片
                      </label>
                      {skus.length > 1 && (
                        <button
                          onClick={() => removeSku(index)}
                          className="w-full mt-1 p-1 text-xs text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3 h-3 inline mr-1" />
                          删除
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addSku}
                    className="w-full flex items-center justify-center space-x-1 px-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 text-xs rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>添加SKU颜色</span>
                  </button>
                </div>
              </div>

            </div>

            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                <div
                  ref={canvasRef}
                  className="relative bg-gray-100 rounded-lg overflow-auto shadow-inner"
                  style={{ width: currentCanvasSize.width * zoom, height: currentCanvasSize.height * zoom }}
                  onMouseDown={handleCanvasMouseDown}
                  onWheel={(e) => {
                    e.preventDefault();
                    const canvasRect = canvasRef.current?.getBoundingClientRect();
                    if (!canvasRect) return;
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    setZoom(prevZoom => {
                      const newZoom = Math.max(0.25, Math.min(3, prevZoom + delta));
                      if (newZoom !== prevZoom) {
                        // 记录鼠标指向的图像点，useEffect 中把该点重新对齐到鼠标位置（以鼠标为中心缩放）。
                        zoomTargetRef.current = {
                          clientX: e.clientX,
                          clientY: e.clientY,
                          imgX: (e.clientX - canvasRect.left) / prevZoom,
                          imgY: (e.clientY - canvasRect.top) / prevZoom,
                          newZoom,
                        };
                      }
                      return newZoom;
                    });
                  }}
                >
                  {showGrid && (
                    <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.3, width: currentCanvasSize.width * zoom, height: currentCanvasSize.height * zoom }}>
                      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                        <defs>
                          <pattern id="gridV2" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
                          </pattern>
                          <pattern id="grid5xV2" width={gridSize * 5} height={gridSize * 5} patternUnits="userSpaceOnUse">
                            <path d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`} fill="none" stroke="#94a3b8" strokeWidth="1" />
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#gridV2)" />
                        <rect width="100%" height="100%" fill="url(#grid5xV2)" />
                      </svg>
                    </div>
                  )}

                  {(designerMode === 'main' ? activeSku?.preview : activeDetail?.preview) && (
                    <img
                      src={designerMode === 'main' ? activeSku.preview : activeDetail.preview}
                      alt="背景"
                      className="w-full h-full object-contain select-none"
                      draggable={false}
                    />
                  )}

                  {designerMode === 'main' && printAreas.map(area => (
                    <PrintArea
                      key={area.templateId}
                      area={area}
                      zoom={zoom}
                      isSelected={selectedArea === area.templateId}
                      onMouseDown={(e, a, type) => handleAreaMouseDown(e, a, type, false)}
                      theme="blue"
                    />
                  ))}

                  {designerMode === 'detail' && activeDetail && (activeDetail.printAreas || []).map(area => {
                    const mainArea = printAreas.find(a => a.templateId === area.sourceAreaId);
                    return (
                      <PrintArea
                        key={area.id}
                        area={area}
                        zoom={zoom}
                        scale={detailScale}
                        isSelected={selectedDetailArea === area.id}
                        onMouseDown={(e, a, type) => handleAreaMouseDown(e, a, type, true)}
                        theme="purple"
                        showSourceInfo={true}
                        sourceAreaName={mainArea?.name || ''}
                      />
                    );
                  })}
                </div>
              </div>

              {activeSku && (
                <div className="h-24 bg-white border-t border-gray-200 p-3 flex items-center">
                  <div className="flex-shrink-0 mr-3">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => addDetailImage(e.target.files)}
                      className="hidden"
                      id="detail-files"
                    />
                    <label
                      htmlFor="detail-files"
                      className="flex items-center justify-center space-x-2 w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                    >
                      <Upload className="w-5 h-5 text-gray-400" />
                    </label>
                  </div>
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex space-x-2">
                      {activeSku.detailImages && activeSku.detailImages.map((detail, index) => (
                        <div
                          key={detail.id}
                          className={`relative flex-shrink-0 w-20 cursor-pointer transition-all group ${
                            activeDetailIndex === index && designerMode === 'detail'
                              ? 'ring-2 ring-purple-500 rounded-lg'
                              : 'hover:ring-2 hover:ring-gray-300 rounded-lg'
                          }`}
                          onClick={() => handleDetailImageSelect(index)}
                        >
                          <img src={detail.preview} alt={detail.label} className="w-full h-16 object-contain rounded-lg bg-gray-50" />
                          <div className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); removeDetailImage(index); }}>
                            <X className="w-3 h-3" />
                          </div>
                          <div className="text-center text-xs text-gray-600 mt-1 truncate px-1">{detail.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {activeDetail && (
                    <button
                      onClick={() => handleDetailImageSelect(activeDetailIndex !== null ? activeDetailIndex : 0)}
                      className={`flex-shrink-0 ml-3 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        designerMode === 'detail'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {designerMode === 'detail' ? '返回主图' : '编辑细节图'}
                    </button>
                  )}
                  {skus.length >= 2 && (
                    <button
                      onClick={copyDetailPrintAreasToAllSkus}
                      className="flex-shrink-0 ml-3 px-3 py-1.5 text-sm rounded-lg transition-colors bg-green-100 text-green-700 hover:bg-green-200 flex items-center"
                      title="将所有细节图定位框复制到所有颜色"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      同步所有细节图定位框到其他颜色
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="w-72 bg-white border-l border-gray-200 flex flex-col">
              <div className="p-3 border-b border-gray-200">
                <h4 className="font-medium">
                  {designerMode === 'main' ? (
                    <span className="text-blue-600">主图印花区域</span>
                  ) : (
                    <span className="text-purple-600">细节图印花区域</span>
                  )}
                </h4>
              </div>

              {designerMode === 'main' && (
                <div className="flex-1 overflow-auto p-3">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={() => addAreaTemplate()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      添加区域
                    </button>
                    {skus.length >= 2 && (
                      <button
                        onClick={copyMainPrintAreasToAllSkus}
                        title="把当前颜色的主图设计框位置复制到其它所有颜色，之后各颜色仍可单独微调"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        复制到其它颜色
                      </button>
                    )}
                  </div>
                  {skus.length >= 2 && (
                    <p className="text-xs text-gray-500 -mt-2 mb-3">
                      当前颜色：<span className="font-medium text-blue-600">{activeSku?.name}</span>。每个颜色的主图设计框位置相互独立，可分别微调。
                    </p>
                  )}

                  <div className="space-y-2">
                    {printAreas.map(area => (
                      <div
                        key={area.templateId}
                        className={`p-3 border rounded-lg ${selectedArea === area.templateId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <input
                            type="text"
                            value={area.name}
                            onChange={(e) => updateAreaTemplate(area.templateId, { name: e.target.value })}
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded"
                          />
                          <button
                            onClick={() => removeAreaTemplate(area.templateId)}
                            className="p-1 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">X:</span>
                            <input
                              type="number"
                              value={Math.round(area.x)}
                              onChange={(e) => updateAreaTemplate(area.templateId, { x: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="number"
                              value={Math.round(area.y)}
                              onChange={(e) => updateAreaTemplate(area.templateId, { y: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <span className="text-gray-500">宽度:</span>
                            <input
                              type="number"
                              value={Math.round(area.width)}
                              onChange={(e) => updateAreaTemplate(area.templateId, { width: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <span className="text-gray-500">高度:</span>
                            <input
                              type="number"
                              value={Math.round(area.height)}
                              onChange={(e) => updateAreaTemplate(area.templateId, { height: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <span className="text-gray-500 text-sm">旋转角度:</span>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="number"
                              value={Math.round(area.rotation || 0)}
                              onChange={(e) => updateAreaTemplate(area.templateId, { rotation: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                            />
                            <span className="text-gray-400 text-sm">度</span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <span className="text-gray-500 text-sm">填充模式:</span>
                          <select
                            value={area.fillMode || 'contain'}
                            onChange={(e) => updateAreaTemplate(area.templateId, { fillMode: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                          >
                            <option value="cover">裁切 (Cover)</option>
                            <option value="contain">适应 (Contain)</option>
                            <option value="contain-top">适应-顶部对齐 (Contain Top)</option>
                            <option value="stretch">拉伸 (Stretch)</option>
                            <option value="center">居中 (Center)</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    {printAreas.length === 0 && (
                      <div className="text-sm text-gray-400 text-center py-4">
                        点击上方按钮添加印花区域
                      </div>
                    )}
                  </div>
                </div>
              )}

              {designerMode === 'detail' && activeDetail && (
                <div className="flex-1 overflow-auto p-3">
                  <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border-2 border-purple-300">
                    <div className="flex items-start">
                      <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 mr-2">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-purple-800 mb-1">关联主图区域</p>
                        <p className="text-xs text-purple-700">点击下方按钮添加印花区域，每个区域需要绑定到一个主图区域才能引用图案。</p>
                      </div>
                    </div>
                  </div>
                  <div className="mb-2">
                    <span className="text-sm font-medium text-gray-700">主图印花区域（点击添加引用）：</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={() => addBlankDetailArea()}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2 border border-gray-200 hover:border-gray-300"
                    >
                      <Plus className="w-4 h-4" />
                      <span>添加空白区域</span>
                    </button>
                    {printAreas.length > 0 ? (
                      printAreas.map(mainArea => {
                        const referencedCount = activeDetail.printAreas.filter(a => a.sourceAreaId === mainArea.templateId).length;
                        const mainAreaIndex = printAreas.findIndex(a => a.templateId === mainArea.templateId);
                        return (
                          <button
                            key={mainArea.templateId}
                            onClick={() => addDetailAreaFromMain(activeDetailIndex, mainArea.templateId)}
                            className={`px-3 py-1.5 text-sm rounded-lg flex items-center space-x-2 border transition-colors ${
                              referencedCount > 0
                                ? 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300'
                            }`}
                          >
                            <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                              referencedCount > 0 ? 'bg-purple-500 text-white' : 'bg-purple-200 text-purple-800'
                            }`}>
                              {mainAreaIndex + 1}
                            </span>
                            <span className="font-medium">{mainArea.name}</span>
                            {referencedCount > 0 && (
                              <span className="text-xs bg-purple-300 text-purple-900 px-1.5 rounded font-medium">
                                已引用 {referencedCount} 次
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-400 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <p>⚠️ 请先在「主图设计」模式中添加印花区域</p>
                        <p className="text-xs mt-1">切换到主图设计 → 点击添加区域按钮</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {(activeDetail.printAreas || []).map(area => {
                      const mainArea = printAreas.find(a => a.templateId === area.sourceAreaId);
                      return (
                        <div
                          key={area.id}
                          className={`p-3 border rounded-lg ${selectedDetailArea === area.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <input
                              type="text"
                              value={area.name || area.label}
                              onChange={(e) => updateDetailPrintArea(activeDetailIndex, area.id, { label: e.target.value })}
                              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded"
                            />
                            <button
                              onClick={() => removeDetailPrintArea(activeDetailIndex, area.id)}
                              className="p-1 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                          <div className="mb-3 p-2 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-purple-700 flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                关联主图区域
                              </span>
                              {mainArea && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                  已绑定
                              </span>
                            )}
                          </div>
                          <select
                            value={area.sourceAreaId || ''}
                            onChange={(e) => updateDetailPrintArea(activeDetailIndex, area.id, { sourceAreaId: e.target.value || null })}
                            className={`w-full px-2 py-1.5 border rounded-lg text-sm font-medium ${mainArea ? 'border-purple-400 bg-white' : 'border-red-300 bg-red-50'}`}
                          >
                            <option value="">未绑定（选择主图区域）</option>
                            {printAreas.map((mainArea, idx) => (
                              <option key={mainArea.templateId} value={mainArea.templateId}>
                                区域{idx + 1}: {mainArea.name}
                              </option>
                            ))}
                          </select>
                          {!mainArea && (
                            <p className="text-xs text-red-600 mt-1 flex items-center">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              未绑定主图区域，该位置将不会印图案
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">X:</span>
                            <input
                              type="number"
                              value={Math.round(area.x * (detailScale?.scaleX || 1))}
                              onChange={(e) => {
                                const displayX = parseInt(e.target.value) || 0;
                                const scaleX = detailScale?.scaleX || 1;
                                updateDetailPrintArea(activeDetailIndex, area.id, { x: scaleX !== 0 ? displayX / scaleX : 0 });
                              }}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <span className="text-gray-500">Y:</span>
                            <input
                              type="number"
                              value={Math.round(area.y * (detailScale?.scaleY || 1))}
                              onChange={(e) => {
                                const displayY = parseInt(e.target.value) || 0;
                                const scaleY = detailScale?.scaleY || 1;
                                updateDetailPrintArea(activeDetailIndex, area.id, { y: scaleY !== 0 ? displayY / scaleY : 0 });
                              }}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <span className="text-gray-500">宽度:</span>
                            <input
                              type="number"
                              value={Math.round(area.width * (detailScale?.scaleX || 1))}
                              onChange={(e) => {
                                const displayWidth = parseInt(e.target.value) || 0;
                                const scaleX = detailScale?.scaleX || 1;
                                updateDetailPrintArea(activeDetailIndex, area.id, { width: scaleX !== 0 ? displayWidth / scaleX : 0 });
                              }}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                          <div>
                            <span className="text-gray-500">高度:</span>
                            <input
                              type="number"
                              value={Math.round(area.height * (detailScale?.scaleY || 1))}
                              onChange={(e) => {
                                const displayHeight = parseInt(e.target.value) || 0;
                                const scaleY = detailScale?.scaleY || 1;
                                updateDetailPrintArea(activeDetailIndex, area.id, { height: scaleY !== 0 ? displayHeight / scaleY : 0 });
                              }}
                              className="w-full px-2 py-1 border border-gray-200 rounded"
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <span className="text-gray-500 text-sm">旋转角度:</span>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="number"
                              value={Math.round(area.rotation || 0)}
                              onChange={(e) => updateDetailPrintArea(activeDetailIndex, area.id, { rotation: parseInt(e.target.value) || 0 })}
                              className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                            />
                            <span className="text-gray-400 text-sm">度</span>
                          </div>
                        </div>
                        <div className="mt-2">
                          <span className="text-gray-500 text-sm">填充模式:</span>
                          <select
                            value={area.fillMode || 'contain'}
                            onChange={(e) => updateDetailPrintArea(activeDetailIndex, area.id, { fillMode: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                          >
                            <option value="cover">裁切 (Cover)</option>
                            <option value="contain">适应 (Contain)</option>
                            <option value="contain-top">适应-顶部对齐 (Contain Top)</option>
                            <option value="stretch">拉伸 (Stretch)</option>
                            <option value="center">居中 (Center)</option>
                          </select>
                        </div>
                      </div>
                      );
                    })}
                    {(activeDetail.printAreas || []).length === 0 && (
                      <div className="text-sm text-gray-400 text-center py-4">
                        点击上方按钮添加印花区域
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
        </main>
    </div>
  );
}

export default TemplateEditorV2;