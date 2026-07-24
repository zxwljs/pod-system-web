import { useState, useEffect, useRef } from 'react';
import { apiResizeBatch, apiCompressBatch, apiRequest, getResizeZipUrl, getCompressZipUrl, apiExcelMerge, getExcelMergeUrl } from '../api/axios';
import { fetchToolbox, readToolboxCache, getCmsBaseURL } from '../api/cms';
import { UploadCloud, Download, Loader, X, Image as ImageIcon, SlidersHorizontal, CheckCircle, XCircle, FileArchive, Wrench, ArrowLeft, FileSpreadsheet, ExternalLink, AlertTriangle, Scissors, LayoutTemplate, Store, Palette, Sparkles, Package, ShoppingCart, Globe, BookOpen, FileText, Zap, Star, Link as LinkIcon, Grid, Camera, Video } from 'lucide-react';

// 云端工具项 icon 名 → lucide 组件白名单（与 cms-worker.js ALLOWED_ICONS 对齐；未知回退 ExternalLink）
const ICON_MAP = {
  ExternalLink, LayoutTemplate, Scissors, Store, Wrench, Image: ImageIcon,
  Palette, Sparkles, Package, ShoppingCart, Globe, BookOpen, FileText,
  Download, Zap, Star, Link: LinkIcon, Grid, Camera, Video,
};
const resolveIcon = (icon) => {
  if (typeof icon === 'string') return ICON_MAP[icon] || ExternalLink;
  return icon || ExternalLink;
};

// 文件列表最多渲染的条数：大批量（几千张）时避免渲染上千个 DOM 节点导致页面卡顿
const FILE_LIST_RENDER_LIMIT = 200;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// ── 目录/文件夹递归读取（配合「包含子目录图片」「导出保留目录结构」两个开关）──
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif'];
function isImageFile(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return IMAGE_EXTS.includes(ext);
}
// 从拖入的文件夹递归读取其中所有图片（保留相对路径）
function readEntry(entry, prefix, collector) {
  return new Promise((resolve) => {
    if (!entry) return resolve();
    if (entry.isFile) {
      entry.file((file) => {
        if (isImageFile(file)) collector.push({ file, name: prefix + entry.name, relPath: prefix + entry.name, size: file.size });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (!entries.length) return resolve();
          for (const e of entries) await readEntry(e, prefix + entry.name + '/', collector);
          readBatch();
        }, () => resolve());
      };
      readBatch();
    } else resolve();
  });
}
// 把拖拽的 DataTransfer 解析成图片项（自动识别文件夹并递归）
async function collectDropped(dt) {
  const collector = [];
  const items = dt.items ? Array.from(dt.items) : [];
  if (items.length) {
    for (const it of items) {
      const entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
      if (entry && entry.isDirectory) {
        await readEntry(entry, entry.name + '/', collector);
      } else if (entry && entry.isFile) {
        const f = it.getAsFile();
        if (f && isImageFile(f)) collector.push({ file: f, name: f.name, relPath: f.name, size: f.size });
      }
    }
  }
  if (!collector.length && dt.files && dt.files.length) {
    Array.from(dt.files).forEach(f => {
      if (isImageFile(f)) collector.push({ file: f, name: f.webkitRelativePath || f.name, relPath: f.webkitRelativePath || f.name, size: f.size });
    });
  }
  return collector;
}

// 「是否处理子目录」过滤：relPath 形如 根目录/子目录/x.png，段数 > 2 即位于子目录中。
// 平铺选择的单文件（relPath 无 /）恒通过。
function depthOk(relPath, includeSubdirs) {
  return includeSubdirs || relPath.split('/').length <= 2;
}

// 「选择文件夹」主路径：File System Access API（Chrome/Edge 86+）。
// 由我们自己遍历目录，includeSubdirs 直接决定是否递归子目录——
// 不依赖 webkitdirectory 的浏览器隐式行为（其强制递归返回全部文件，只能事后过滤）。
async function scanDirHandle(dirHandle, prefix, recursive, collector) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      try {
        const file = await entry.getFile();
        if (isImageFile(file)) collector.push({ file, name: prefix + file.name, relPath: prefix + file.name, size: file.size });
      } catch { /* 单个文件读取失败则跳过 */ }
    } else if (entry.kind === 'directory' && recursive) {
      await scanDirHandle(entry, prefix + entry.name + '/', true, collector);
    }
  }
}
// 弹目录选择器并按 includeSubdirs 收集图片；用户取消会抛 AbortError，由调用方忽略
async function pickFolderImages(includeSubdirs) {
  const dir = await window.showDirectoryPicker();
  const collector = [];
  await scanDirHandle(dir, dir.name + '/', includeSubdirs, collector);
  return collector;
}

// 提交时把图片写入 FormData：
//   keepStructure=true  → 逻辑名用相对路径，zip 内按目录归类；
//   keepStructure=false → 平铺（只留文件名），自动对重名追加 (1)(2)… 防覆盖。
// 注意：FormData 第三参数 filename 无法可靠携带路径——浏览器出于安全会把目录部分
//       剥成 basename。因此路径改用平行字段 relPaths(JSON) 传递，后端按上传顺序对齐。
function appendImagesToForm(formData, files, keepStructure) {
  const used = new Set();
  const relPaths = [];
  files.forEach(f => {
    let name = keepStructure ? f.relPath : f.relPath.split('/').pop();
    if (!keepStructure) {
      const dot = name.lastIndexOf('.');
      let candidate = name, n = 1;
      while (used.has(candidate)) {
        candidate = dot > 0 ? `${name.slice(0, dot)}(${n})${name.slice(dot)}` : `${name}(${n})`;
        n++;
      }
      name = candidate;
      used.add(name);
    }
    relPaths.push(name);
    formData.append('files', f.file);
  });
  formData.append('relPaths', JSON.stringify(relPaths));
}

// ───────────────────────────────────────────────────────────
// 工具注册表：新增功能只需在此追加一项（id / label / icon / desc / accent）。
//   ready: true 才可点击并转跳落地页；ready 为 false 的工具不在宫格中展示。
//   accent: 图标底色主题（见下方 ACCENTS）
// 子路由：#tools/<id> 渲染对应落地页；#tools 渲染宫格。
// ───────────────────────────────────────────────────────────
// 本地内置工具：依赖本地 EXE 能力，硬编码；落地页路由（#tools/<id>）只在这里查找。
const LOCAL_TOOLS = [
  { id: 'resize',   label: '批量改尺寸', icon: SlidersHorizontal, desc: '批量将图片统一为指定尺寸', ready: true,  accent: 'blue' },
  { id: 'compress', label: '批量压缩', icon: FileArchive,         desc: '批量压缩图片体积，支持质量滑块 / 目标大小智能压缩', ready: true,  accent: 'teal' },
  { id: 'excel-merge', label: 'Excel 表格合并', icon: FileSpreadsheet, desc: '多份表格纵向合并 / 多 Sheet 汇总，输出单个 .xlsx', ready: true,  accent: 'green' },
];

// 云端外链项的兜底列表：当 CMS（admin.ddddnet.cn）不可用时展示，保证页面永不空白。
// 结构与云端 items 一致（icon 存字符串名、type=link）。CMS 可用时会被云端数据整体替换。
const FALLBACK_ITEMS = [
  { id: 'scriptcat', label: '脚本猫脚本', icon: 'ExternalLink', desc: 'Temu 相关辅助脚本 · 点击跳转脚本猫个人主页', accent: 'blue', type: 'link', url: 'https://scriptcat.org/zh-CN/users/209240' },
  { id: 'removebg', label: '抠图（去背景）', icon: 'Scissors', desc: '一键去除图片背景 · 点击跳转 remove.bg', accent: 'purple', type: 'link', url: 'https://www.remove.bg/' },
  { id: 'template-market', label: '模板市场', icon: 'LayoutTemplate', desc: '海量套图模板在线浏览与套用 · 点击进入模板市场', accent: 'amber', type: 'link', url: 'https://market.ddddnet.cn', badge: 'Beta' },
];

// 图标底色主题（扁平风，与全局设计系统一致）
const ACCENTS = {
  blue:   { bg: '#E6F1FB', fg: '#185FA5' },
  teal:   { bg: '#E1F5EE', fg: '#0F6E56' },
  coral:  { bg: '#FAECE7', fg: '#993C1D' },
  purple: { bg: '#EEEDFE', fg: '#534AB7' },
  amber:  { bg: '#FAEEDA', fg: '#854F0B' },
  green:  { bg: '#EAF3DE', fg: '#3B6D11' },
  gray:   { bg: '#F1EFE8', fg: '#5F5E5A' },
};

const FIT_OPTIONS = [
  { value: 'contain', label: '等比留白', desc: '保持比例，短边填满，长边补白' },
  { value: 'cover', label: '居中裁剪', desc: '按比例填满并裁掉溢出部分' },
  { value: 'fill', label: '拉伸填满', desc: '无视比例拉伸至精确尺寸' },
];
const FORMAT_OPTIONS = [
  { value: 'jpeg', label: 'JPEG（体积小，通用）' },
  { value: 'png', label: 'PNG（无损）' },
  { value: 'original', label: '保留原格式' },
];
const COMPRESS_FORMAT_OPTIONS = [
  { value: 'keep', label: '原格式（PNG 无损 / 其它转 JPEG）' },
  { value: 'png', label: '转 PNG（无损，保留透明）' },
  { value: 'jpeg', label: '转 JPEG（体积最小，丢透明）' },
  { value: 'webp', label: '转 WebP（现代高压缩，支持透明）' },
];
const COMPRESS_STRATEGY = [
  { value: 'quality', label: '质量优先', desc: '拖动质量滑块，体积随质量变化' },
  { value: 'size', label: '目标大小', desc: '智能迭代压缩，直到每张 ≤ 目标 KB' },
];

// 常用比例预设（W:H）。custom 表示手填宽高，等价于精确尺寸。
const RATIO_OPTIONS = [
  { value: '1:1',   w: 1,  h: 1,  label: '1:1' },
  { value: '3:4',   w: 3,  h: 4,  label: '3:4' },
  { value: '4:5',   w: 4,  h: 5,  label: '4:5' },
  { value: '2:3',   w: 2,  h: 3,  label: '2:3' },
  { value: '9:16',  w: 9,  h: 16, label: '9:16' },
  { value: '4:3',   w: 4,  h: 3,  label: '4:3' },
  { value: '16:9',  w: 16, h: 9,  label: '16:9' },
  { value: 'custom', w: null, h: null, label: '自定义' },
];

// 按比例模式：根据比例 + 基准边长算出最终 width/height（像素取整）。
function computeRatioDims(ratioKey, anchor, base, fallbackW, fallbackH) {
  if (ratioKey === 'custom') return { width: fallbackW, height: fallbackH };
  const opt = RATIO_OPTIONS.find(o => o.value === ratioKey);
  if (!opt || opt.w == null) return { width: fallbackW, height: fallbackH };
  const baseN = Math.max(1, parseInt(base, 10) || 0);
  if (anchor === 'height') {
    return { height: baseN, width: Math.round(baseN * opt.w / opt.h) };
  }
  return { width: baseN, height: Math.round(baseN * opt.h / opt.w) };
}

// ── 工具一：批量改尺寸 ──────────────────────────────────────
function BatchResizeTool() {
  const [files, setFiles] = useState([]);           // [{ file, name, size }]
  const [width, setWidth] = useState(1500);
  const [height, setHeight] = useState(2000);
  const [fit, setFit] = useState('contain');
  const [background, setBackground] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const [format, setFormat] = useState('jpeg');
  const [quality, setQuality] = useState(90);

  // 尺寸模式：exact=精确尺寸（手填宽高）；ratio=按比例（选预设+基准边长）
  const [mode, setMode] = useState('ratio');        // 默认进「按比例」
  const [ratio, setRatio] = useState('3:4');
  const [ratioAnchor, setRatioAnchor] = useState('width');
  const [ratioBase, setRatioBase] = useState(1500);

  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');      // idle | processing | completed | failed
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [zipName, setZipName] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [includeSubdirs, setIncludeSubdirs] = useState(true);   // 选/拖文件夹时是否处理子目录里的图片
  const [keepStructure, setKeepStructure] = useState(true);     // 导出 zip 是否保留目录结构（否则平铺）
  const [showPicker, setShowPicker] = useState(false);           // 点击上传区时显示「选文件/选文件夹」选择器

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const pollingRef = useRef(null);

  // 轮询任务进度（复用现有 tasks 内存对象，前端每 600ms 查 GET /api/tasks/:id）
  useEffect(() => {
    if (!taskId || status !== 'processing') return;
    pollingRef.current = setInterval(async () => {
      try {
        const data = await apiRequest(`/tasks/${taskId}`);
        setProgress(data.progress || 0);
        setResults(data.results || []);
        setSkipped(data.skipped || []);
        if (data.zipName) setZipName(data.zipName);
        if (data.status === 'completed') {
          setStatus('completed');
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error || '处理失败');
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'cancelled') {
          setStatus('failed');
          setError('任务已取消');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (e) {
        // 任务可能被清理(404)，忽略瞬时错误，等待用户重置
      }
    }, 600);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [taskId, status]);

  const addFiles = (fileList) => {
    const arr = Array.from(fileList)
      .filter(f => isImageFile(f))
      .map(f => {
        const relPath = f.webkitRelativePath || f.name;
        return { file: f, name: relPath, relPath, size: f.size };
      })
      .filter(f => depthOk(f.relPath, includeSubdirs));
    setFiles(prev => [...prev, ...arr]);
  };

  const onInputChange = (e) => {
    if (e.target.files && e.target.files.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const collected = await collectDropped(e.dataTransfer);
    if (!collected.length) return;
    setFiles(prev => [...prev, ...collected.filter(c => depthOk(c.relPath, includeSubdirs))]);
  };

  // 关掉「包含子目录」时，同步剔除列表里已加入的子目录图片
  const handleIncludeSubdirsChange = (checked) => {
    setIncludeSubdirs(checked);
    if (!checked) setFiles(prev => prev.filter(f => depthOk(f.relPath, false)));
  };

  // 选择文件夹：主用 File System Access API（递归与否由勾选框直接控制），
  // 不支持的浏览器降级为 webkitdirectory input（addFiles 里按深度过滤）。
  const onPickFolder = async () => {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const collected = await pickFolderImages(includeSubdirs);
        if (collected.length) setFiles(prev => [...prev, ...collected]);
      } catch { /* 用户取消选择 */ }
    } else if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setFiles([]);
    setTaskId(null);
    setStatus('idle');
    setProgress(0);
    setResults([]);
    setSkipped([]);
    setZipName('');
    setError('');
  };

  // ── 比例模式相关交互 ──────────────────────────────────────
  const handleModeChange = (m) => {
    setMode(m);
    if (m === 'ratio') {
      // 从当前宽高初始化比例基准，避免切换后数值跳变
      const base = Math.max(1, parseInt(width, 10) || 1500);
      setRatioAnchor('width');
      setRatioBase(base);
      const d = computeRatioDims(ratio, 'width', base, width, height);
      setWidth(d.width);
      setHeight(d.height);
    }
  };

  const handleRatioChange = (key) => {
    setRatio(key);
    if (key !== 'custom') {
      const d = computeRatioDims(key, ratioAnchor, ratioBase, width, height);
      setWidth(d.width);
      setHeight(d.height);
    }
  };

  const handleAnchorChange = (anchor) => {
    setRatioAnchor(anchor);
    const d = computeRatioDims(ratio, anchor, ratioBase, width, height);
    setWidth(d.width);
    setHeight(d.height);
  };

  const handleBaseChange = (val) => {
    setRatioBase(val);
    if (ratio !== 'custom') {
      const d = computeRatioDims(ratio, ratioAnchor, val, width, height);
      setWidth(d.width);
      setHeight(d.height);
    }
  };

  const handleStart = async () => {
    if (!files.length || status === 'processing') return;
    const formData = new FormData();
    formData.append('width', String(width));
    formData.append('height', String(height));
    formData.append('fit', fit);
    formData.append('background', background);
    formData.append('transparent', String(transparent));
    formData.append('format', format);
    formData.append('quality', String(quality));
    appendImagesToForm(formData, files, keepStructure);
    try {
      const data = await apiResizeBatch(formData);
      setTaskId(data.taskId);
      setStatus('processing');
      setProgress(0);
      setResults([]);
      setError('');
    } catch (e) {
      setError(e.message || '提交失败');
      setStatus('failed');
    }
  };

  const showQuality = format === 'jpeg' && !transparent;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左：上传区 */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer select-none" title="选/拖文件夹时，是否把子目录里的图片一并处理">
            <input type="checkbox" checked={includeSubdirs} onChange={(e) => handleIncludeSubdirsChange(e.target.checked)} className="accent-blue-600" />
            <span>包含子目录图片</span>
          </label>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); setShowPicker(false); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => setShowPicker(true)}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors relative ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          {showPicker ? (
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-medium text-gray-700">请选择上传方式</p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPicker(false); fileInputRef.current && fileInputRef.current.click(); }}
                  className="px-5 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  选择文件
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPicker(false); onPickFolder(); }}
                  className="px-5 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  选择文件夹{includeSubdirs ? '（含子目录）' : '（仅第一层）'}
                </button>
              </div>
              <p className="text-xs text-gray-400">或直接拖拽文件 / 文件夹到此处</p>
            </div>
          ) : (
            <>
              <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">点击或拖拽图片到此处</p>
              <p className="text-sm text-gray-400 mt-1">支持多选 / 选文件夹，JPG / PNG / WEBP / GIF</p>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInputChange} />
          <input ref={folderInputRef} type="file" webkitdirectory="" mozdirectory="" multiple className="hidden" onChange={onInputChange} />
        </div>

        {files.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-gray-900">已选 {files.length} 张</span>
              <button onClick={() => setFiles([])} className="text-sm text-red-500 hover:underline">清空</button>
            </div>
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {files.slice(0, FILE_LIST_RENDER_LIMIT).map((f, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <ImageIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400">{formatBytes(f.size)}</span>
                  </div>
                  <button onClick={() => removeFile(i)} className="p-1 hover:bg-red-50 rounded" title="移除">
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </li>
              ))}
              {files.length > FILE_LIST_RENDER_LIMIT && (
                <li className="px-5 py-2.5 text-sm text-gray-400 text-center">
                  …还有 {files.length - FILE_LIST_RENDER_LIMIT} 张未逐一展示（均会正常处理）
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* 右：参数面板 */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">输出参数</h3>

          {/* 尺寸 + 比例模式 */}
          <div>
            <label className="text-sm text-gray-600 font-medium">目标尺寸（像素）</label>
            {/* 模式切换 */}
            <div className="flex items-center space-x-1 mt-1.5 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => handleModeChange('exact')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'exact' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >精确尺寸</button>
              <button
                type="button"
                onClick={() => handleModeChange('ratio')}
                className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'ratio' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >按比例</button>
            </div>

            {mode === 'exact' ? (
              <div className="flex items-center space-x-2 mt-2">
                <input type="number" min="1" value={width} onChange={(e) => setWidth(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <span className="text-gray-400">×</span>
                <input type="number" min="1" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            ) : (
              <>
                {/* 常用比例预设 */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {RATIO_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleRatioChange(opt.value)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        ratio === opt.value
                          ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>

                {ratio === 'custom' ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <input type="number" min="1" value={width} onChange={(e) => setWidth(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    <span className="text-gray-400">×</span>
                    <input type="number" min="1" value={height} onChange={(e) => setHeight(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2 mt-2">
                      <select
                        value={ratioAnchor}
                        onChange={(e) => handleAnchorChange(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="width">以宽度为准</option>
                        <option value="height">以高度为准</option>
                      </select>
                      <div className="flex-1 flex items-center border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                        <input
                          type="number" min="1"
                          value={ratioBase}
                          onChange={(e) => handleBaseChange(e.target.value)}
                          className="flex-1 outline-none text-sm bg-transparent"
                        />
                        <span className="text-xs text-gray-400 ml-1">px</span>
                      </div>
                    </div>
                    <div className="mt-2 bg-gray-50 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-500">
                      得出 <b className="text-blue-600">{width} × {height}</b>（比例 {ratio}，{ratioAnchor === 'width' ? '高度' : '宽度'}自动锁定）
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* 适配方式 */}
          <div>
            <label className="text-sm text-gray-600 font-medium">适配方式</label>
            <div className="mt-1.5 space-y-1.5">
              {FIT_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-start space-x-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  fit === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="radio" name="fit" value={opt.value} checked={fit === opt.value} onChange={(e) => setFit(e.target.value)} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 背景 */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-600 font-medium">背景填充</label>
              <label className="flex items-center space-x-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
                <span>透明（输出 PNG）</span>
              </label>
            </div>
            <div className="mt-1.5 flex items-center space-x-2">
              <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} disabled={transparent} className="w-10 h-9 rounded border border-gray-300 disabled:opacity-40" />
              <input type="text" value={background} onChange={(e) => setBackground(e.target.value)} disabled={transparent} className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 输出格式 */}
          <div>
            <label className="text-sm text-gray-600 font-medium">输出格式</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full mt-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* 质量 */}
          {showQuality && (
            <div>
              <div className="flex items-center justify-between text-sm text-gray-600 font-medium">
                <label>JPEG 质量</label>
                <span className="text-gray-900">{quality}</span>
              </div>
              <input type="range" min="1" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full mt-1.5 accent-blue-600" />
            </div>
          )}
        </div>

        {/* 导出选项 */}
        <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer select-none" title="下载的 zip 里按原目录层级归类；不勾则所有图片平铺">
          <input type="checkbox" checked={keepStructure} onChange={(e) => setKeepStructure(e.target.checked)} className="accent-blue-600" />
          <span>导出保留目录结构</span>
        </label>

        {/* 操作按钮 */}
        <button
          onClick={handleStart}
          disabled={!files.length || status === 'processing'}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'processing' ? <Loader className="w-5 h-5 animate-spin" /> : <SlidersHorizontal className="w-5 h-5" />}
          <span>{status === 'processing' ? '处理中…' : '开始处理'}</span>
        </button>
      </div>

      {/* 进度 / 结果 */}
      {status !== 'idle' && (
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
          {status === 'processing' && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center space-x-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <span>处理进度</span>
                </span>
                <span className="font-medium text-gray-900">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}

          {status === 'completed' && (
            <div className="flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">已完成 {results.length} 张，全部为 {width}×{height}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <a
                    href={getResizeZipUrl(taskId)}
                    download={zipName}
                    className="flex items-center space-x-1 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>下载 ZIP</span>
                  </a>
                  <button onClick={reset} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">再处理一批</button>
                </div>
              </div>
              {skipped.length > 0 && (
                <div className="flex items-start space-x-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">已跳过 {skipped.length} 张处理失败 / 空输出的图片：</span>
                    <span className="text-amber-800">{skipped.join('、')}</span>
                    <span className="text-amber-600 ml-1">（源文件可能损坏或格式不支持，请核对后重新上传）</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'failed' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-red-600">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{error || '处理失败'}</span>
              </div>
              <button onClick={reset} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">重试</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 工具二：批量压缩 ──────────────────────────────────────
function BatchCompressTool() {
  const [files, setFiles] = useState([]);           // [{ file, name, size }]
  const [strategy, setStrategy] = useState('quality');
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState('keep');
  const [maxEdge, setMaxEdge] = useState('');        // 空 = 不限制
  const [targetKB, setTargetKB] = useState(200);
  const [targetUnit, setTargetUnit] = useState('KB'); // KB | MB

  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');      // idle | processing | completed | failed
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [zipName, setZipName] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [includeSubdirs, setIncludeSubdirs] = useState(true);   // 选/拖文件夹时是否处理子目录里的图片
  const [keepStructure, setKeepStructure] = useState(true);     // 导出 zip 是否保留目录结构（否则平铺）
  const [showPicker, setShowPicker] = useState(false);           // 点击上传区时显示「选文件/选文件夹」选择器

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (!taskId || status !== 'processing') return;
    pollingRef.current = setInterval(async () => {
      try {
        const data = await apiRequest(`/tasks/${taskId}`);
        setProgress(data.progress || 0);
        setResults(data.results || []);
        if (data.zipName) setZipName(data.zipName);
        if (data.status === 'completed') {
          setStatus('completed');
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error || '处理失败');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (e) { /* 任务可能被清理(404)，忽略瞬时错误 */ }
    }, 600);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [taskId, status]);

  const addFiles = (fileList) => {
    const arr = Array.from(fileList)
      .filter(f => isImageFile(f))
      .map(f => {
        const relPath = f.webkitRelativePath || f.name;
        return { file: f, name: relPath, relPath, size: f.size };
      })
      .filter(f => depthOk(f.relPath, includeSubdirs));
    setFiles(prev => [...prev, ...arr]);
  };
  const onInputChange = (e) => {
    if (e.target.files && e.target.files.length) addFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const collected = await collectDropped(e.dataTransfer);
    if (!collected.length) return;
    setFiles(prev => [...prev, ...collected.filter(c => depthOk(c.relPath, includeSubdirs))]);
  };
  // 关掉「包含子目录」时，同步剔除列表里已加入的子目录图片
  const handleIncludeSubdirsChange = (checked) => {
    setIncludeSubdirs(checked);
    if (!checked) setFiles(prev => prev.filter(f => depthOk(f.relPath, false)));
  };
  // 选择文件夹：主用 File System Access API（递归与否由勾选框直接控制），
  // 不支持的浏览器降级为 webkitdirectory input（addFiles 里按深度过滤）。
  const onPickFolder = async () => {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const collected = await pickFolderImages(includeSubdirs);
        if (collected.length) setFiles(prev => [...prev, ...collected]);
      } catch { /* 用户取消选择 */ }
    } else if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setFiles([]);
    setTaskId(null);
    setStatus('idle');
    setProgress(0);
    setResults([]);
    setZipName('');
    setError('');
  };

  const handleStart = async () => {
    if (!files.length || status === 'processing') return;
    const formData = new FormData();
    formData.append('strategy', strategy);
    formData.append('quality', String(quality));
    formData.append('format', format);
    formData.append('maxEdge', maxEdge.trim());
    const targetNum = Number(targetKB) || 0;
    const targetKBVal = targetUnit === 'MB' ? targetNum * 1024 : targetNum;
    formData.append('targetKB', String(targetKBVal));
    appendImagesToForm(formData, files, keepStructure);
    try {
      const data = await apiCompressBatch(formData);
      setTaskId(data.taskId);
      setStatus('processing');
      setProgress(0);
      setResults([]);
      setError('');
    } catch (e) {
      setError(e.message || '提交失败');
      setStatus('failed');
    }
  };

  // 压缩前后体积汇总（results 与 files 顺序一致）
  const origTotal = files.reduce((s, f) => s + (f.size || 0), 0);
  const compTotal = results.reduce((s, r) => s + (r.size || 0), 0);
  const savedPct = origTotal > 0 && compTotal > 0
    ? Math.round((1 - compTotal / origTotal) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左：上传区 */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer select-none" title="选/拖文件夹时，是否把子目录里的图片一并处理">
            <input type="checkbox" checked={includeSubdirs} onChange={(e) => handleIncludeSubdirsChange(e.target.checked)} className="accent-blue-600" />
            <span>包含子目录图片</span>
          </label>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); setShowPicker(false); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => setShowPicker(true)}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors relative ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          {showPicker ? (
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-medium text-gray-700">请选择上传方式</p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPicker(false); fileInputRef.current && fileInputRef.current.click(); }}
                  className="px-5 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  选择文件
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPicker(false); onPickFolder(); }}
                  className="px-5 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  选择文件夹{includeSubdirs ? '（含子目录）' : '（仅第一层）'}
                </button>
              </div>
              <p className="text-xs text-gray-400">或直接拖拽文件 / 文件夹到此处</p>
            </div>
          ) : (
            <>
              <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">点击或拖拽图片到此处</p>
              <p className="text-sm text-gray-400 mt-1">支持多选 / 选文件夹，JPG / PNG / WEBP / GIF</p>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInputChange} />
          <input ref={folderInputRef} type="file" webkitdirectory="" mozdirectory="" multiple className="hidden" onChange={onInputChange} />
        </div>

        {files.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-gray-900">已选 {files.length} 张</span>
              <button onClick={() => setFiles([])} className="text-sm text-red-500 hover:underline">清空</button>
            </div>
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {files.slice(0, FILE_LIST_RENDER_LIMIT).map((f, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <ImageIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400">{formatBytes(f.size)}</span>
                  </div>
                  <button onClick={() => removeFile(i)} className="p-1 hover:bg-red-50 rounded" title="移除">
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </li>
              ))}
              {files.length > FILE_LIST_RENDER_LIMIT && (
                <li className="px-5 py-2.5 text-sm text-gray-400 text-center">
                  …还有 {files.length - FILE_LIST_RENDER_LIMIT} 张未逐一展示（均会正常处理）
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* 右：参数面板 */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">压缩参数</h3>

          {/* 压缩策略 */}
          <div>
            <label className="text-sm text-gray-600 font-medium">压缩策略</label>
            <div className="mt-1.5 space-y-1.5">
              {COMPRESS_STRATEGY.map(opt => (
                <label key={opt.value} className={`flex items-start space-x-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  strategy === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="radio" name="cstrat" value={opt.value} checked={strategy === opt.value} onChange={(e) => setStrategy(e.target.value)} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 质量滑块（质量优先时显示） */}
          {strategy === 'quality' && (
            <div>
              <div className="flex items-center justify-between text-sm text-gray-600 font-medium">
                <label>质量</label>
                <span className="text-gray-900">{quality}</span>
              </div>
              <input type="range" min="1" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full mt-1.5 accent-blue-600" />
            </div>
          )}

          {/* 目标大小（目标大小策略时显示） */}
          {strategy === 'size' && (
            <div>
              <label className="text-sm text-gray-600 font-medium">目标大小（每张 ≤）</label>
              <div className="flex items-center space-x-2 mt-1.5">
                <input type="number" min="0.01" step="0.01" value={targetKB} onChange={(e) => setTargetKB(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
              <p className="text-xs text-gray-400 mt-1">从当前质量起逐步下调，直到满足或触底（最低 10）。</p>
            </div>
          )}

          {/* 输出格式 */}
          <div>
            <label className="text-sm text-gray-600 font-medium">输出格式</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full mt-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
              {COMPRESS_FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* 最大边长（可选） */}
          <div>
            <label className="text-sm text-gray-600 font-medium">最大边长（可选，像素）</label>
            <input type="number" min="16" value={maxEdge} onChange={(e) => setMaxEdge(e.target.value)} placeholder="不限制" className="w-full mt-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">留空则不缩放；填写后超大的图会等比缩小再压缩。</p>
          </div>
        </div>

        {/* 导出选项 */}
        <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer select-none" title="下载的 zip 里按原目录层级归类；不勾则所有图片平铺">
          <input type="checkbox" checked={keepStructure} onChange={(e) => setKeepStructure(e.target.checked)} className="accent-blue-600" />
          <span>导出保留目录结构</span>
        </label>

        {/* 操作按钮 */}
        <button
          onClick={handleStart}
          disabled={!files.length || status === 'processing'}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'processing' ? <Loader className="w-5 h-5 animate-spin" /> : <FileArchive className="w-5 h-5" />}
          <span>{status === 'processing' ? '压缩中…' : '开始压缩'}</span>
        </button>
      </div>

      {/* 进度 / 结果 */}
      {status !== 'idle' && (
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
          {status === 'processing' && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center space-x-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <span>压缩进度</span>
                </span>
                <span className="font-medium text-gray-900">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}

          {status === 'completed' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">
                  已完成 {results.length} 张
                  {origTotal > 0 && compTotal > 0 && (
                    <span className="text-gray-500 font-normal ml-2">
                      {formatBytes(origTotal)} → {formatBytes(compTotal)}（省 {savedPct}%）
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={getCompressZipUrl(taskId)}
                  download={zipName}
                  className="flex items-center space-x-1 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>下载 ZIP</span>
                </a>
                <button onClick={reset} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">再处理一批</button>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-red-600">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{error || '处理失败'}</span>
              </div>
              <button onClick={reset} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">重试</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 工具三：Excel 表格合并 ──────────────────────────────────
const MERGE_MODE_OPTIONS = [
  { value: 'vertical', label: '纵向合并（追加行）', desc: '多份同结构表把数据行依次追加，仅保留第一份表头' },
  { value: 'sheets', label: '多 Sheet 汇总', desc: '每个文件成为结果工作簿中的一个 worksheet，保留各自格式' },
];

function ExcelMergeTool() {
  const [files, setFiles] = useState([]);           // [{ file, name, size }]
  const [mode, setMode] = useState('vertical');
  const [headerRow, setHeaderRow] = useState(1);
  const [keepHeader, setKeepHeader] = useState(true);

  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');      // idle | processing | completed | failed
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (!taskId || status !== 'processing') return;
    pollingRef.current = setInterval(async () => {
      try {
        const data = await apiRequest(`/tasks/${taskId}`);
        setProgress(data.progress || 0);
        setResults(data.results || []);
        if (data.fileName) setFileName(data.fileName);
        if (data.status === 'completed') {
          setStatus('completed');
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error || '处理失败');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (e) { /* 任务可能被清理(404)，忽略瞬时错误 */ }
    }, 600);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [taskId, status]);

  const addFiles = (fileList) => {
    const arr = Array.from(fileList)
      .filter(f => /\.(xlsx|csv)$/i.test(f.name))
      .map(f => ({ file: f, name: f.name, size: f.size }));
    setFiles(prev => [...prev, ...arr]);
  };
  const onInputChange = (e) => {
    if (e.target.files && e.target.files.length) addFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setFiles([]);
    setTaskId(null);
    setStatus('idle');
    setProgress(0);
    setResults([]);
    setFileName('');
    setError('');
  };

  const handleStart = async () => {
    if (!files.length || status === 'processing') return;
    const formData = new FormData();
    formData.append('mode', mode);
    formData.append('headerRow', String(headerRow));
    formData.append('keepHeader', String(keepHeader));
    files.forEach(f => formData.append('files', f.file));
    try {
      const data = await apiExcelMerge(formData);
      setTaskId(data.taskId);
      setStatus('processing');
      setProgress(0);
      setResults([]);
      setError('');
    } catch (e) {
      setError(e.message || '提交失败');
      setStatus('failed');
    }
  };

  // 合并后各文件行数汇总（仅展示）
  const totalSrcRows = results.reduce((s, r) => s + (r.rows || 0), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左：上传区 */}
      <div className="lg:col-span-2 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">点击或拖拽 Excel / CSV 到此处</p>
          <p className="text-sm text-gray-400 mt-1">支持多选，.xlsx / .csv（.xls 请另存为 .xlsx）</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" multiple className="hidden" onChange={onInputChange} />
        </div>

        {files.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-gray-900">已选 {files.length} 个</span>
              <button onClick={() => setFiles([])} className="text-sm text-red-500 hover:underline">清空</button>
            </div>
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400">{formatBytes(f.size)}</span>
                  </div>
                  <button onClick={() => removeFile(i)} className="p-1 hover:bg-red-50 rounded" title="移除">
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 右：参数面板 */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">合并参数</h3>

          {/* 合并模式 */}
          <div>
            <label className="text-sm text-gray-600 font-medium">合并模式</label>
            <div className="mt-1.5 space-y-1.5">
              {MERGE_MODE_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-start space-x-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  mode === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="radio" name="mmode" value={opt.value} checked={mode === opt.value} onChange={(e) => setMode(e.target.value)} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 纵向合并参数（仅纵向模式生效） */}
          {mode === 'vertical' && (
            <div className="space-y-3">
              {/* 表头处理策略 */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">仅保留一个表头</span>
                    <span className={`text-xs font-medium ${keepHeader ? 'text-blue-600' : 'text-gray-400'}`}>
                      {keepHeader ? '当前：仅保留一个表头' : '当前：保留所有表头'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    开启：仅保留第一个文件的表头，其余文件跳过表头行。
                    关闭：保留所有文件的表头行。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setKeepHeader(v => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${keepHeader ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${keepHeader ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* 表头所在行（仅“仅保留一个表头”时生效） */}
              {keepHeader && (
                <div>
                  <label className="text-sm text-gray-600 font-medium">表头所在行</label>
                  <input type="number" min="1" value={headerRow} onChange={(e) => setHeaderRow(e.target.value)} className="w-full mt-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">每个文件都会跳过该表头行，结果只保留第一个文件的表头。</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <button
          onClick={handleStart}
          disabled={!files.length || status === 'processing'}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'processing' ? <Loader className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
          <span>{status === 'processing' ? '合并中…' : '开始合并'}</span>
        </button>
      </div>

      {/* 进度 / 结果 */}
      {status !== 'idle' && (
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
          {status === 'processing' && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center space-x-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <span>合并进度</span>
                </span>
                <span className="font-medium text-gray-900">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}

          {status === 'completed' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">
                  已完成 {files.length} 个文件合并
                  {mode === 'vertical' && results.length > 0 && (
                    <span className="text-gray-500 font-normal ml-2">
                      源数据共 {totalSrcRows} 行（含表头）
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={getExcelMergeUrl(taskId)}
                  download={fileName}
                  className="flex items-center space-x-1 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>下载 .xlsx</span>
                </a>
                <button onClick={reset} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">再合并一批</button>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-red-600">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{error || '处理失败'}</span>
              </div>
              <button onClick={reset} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">重试</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 工具落地页外壳：返回头 + 标题 + 工具面板 ─────────────────
function ToolLanding({ tool, onBack, children }) {
  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={onBack}
          className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回工具箱</span>
        </button>
        <h2 className="text-2xl font-bold text-gray-900">{tool.label}</h2>
        <p className="text-sm text-gray-500 mt-1">{tool.desc}</p>
      </div>
      {children}
    </div>
  );
}

// ── 工具箱外壳：宫格入口 / 落地页 ────────────────────────────
function ToolsPage({ subTool }) {
  // 云端外链项（admin.ddddnet.cn 托管）：初值取本地缓存（SWR），挂载后拉最新；失败保持 null → 用兜底
  const [cloudItems, setCloudItems] = useState(() => readToolboxCache());
  // page 类型工具：点击后在 sandbox iframe 弹层内渲染其 HTML
  const [pageModal, setPageModal] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchToolbox()
      .then(items => { if (alive) setCloudItems(items); })
      .catch(() => { /* 失败静默，渲染层用兜底列表 */ });
    return () => { alive = false; };
  }, []);

  // 命中已上线内置工具 → 渲染落地页
  const target = LOCAL_TOOLS.find(t => t.id === subTool && t.ready);
  if (target) {
    return (
      <ToolLanding tool={target} onBack={() => { window.location.hash = '#tools'; }}>
        {target.id === 'resize' && <BatchResizeTool />}
        {target.id === 'compress' && <BatchCompressTool />}
        {target.id === 'excel-merge' && <ExcelMergeTool />}
      </ToolLanding>
    );
  }

  // 宫格列表 = 本地内置工具 + 云端外链项（云端不可用则用兜底）
  const externalItems = cloudItems == null ? FALLBACK_ITEMS : cloudItems;
  const gridItems = [
    ...LOCAL_TOOLS.map(t => ({ ...t, _local: true })),
    ...externalItems,
  ];

  const handleClick = (item) => {
    if (item._local) {
      window.location.hash = '#tools/' + item.id;
    } else if (item.type === 'page') {
      setPageModal(item);
    } else if (item.type === 'article') {
      // 文章跳转：sandbox iframe 加载 /api/page/:id（公开只读）
      setPageModal(item);
    } else if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const ctaText = (item) => {
    if (item._local) return '进入 →';
    if (item.type === 'page' || item.type === 'article') return '查看 →';
    return '打开 →';
  };

  // 否则（含 subTool 为空 / 未上线 / 非法）→ 渲染宫格
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
          <Wrench className="w-6 h-6 text-blue-600" />
          <span>工具箱</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">选择一个工具开始处理</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {gridItems.map(t => {
          const Icon = resolveIcon(t.icon);
          const a = ACCENTS[t.accent] || ACCENTS.blue;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleClick(t)}
              className="relative text-left rounded-xl border p-5 transition-all bg-white border-gray-200 hover:border-blue-400 hover:shadow-sm cursor-pointer"
            >
              {t.badge && (
                <span className="absolute top-3 right-3 px-1.5 py-0.5 rounded-md text-[10px] font-semibold leading-none tracking-wide bg-amber-100 text-amber-700 border border-amber-200">
                  {t.badge}
                </span>
              )}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                style={{ background: a.bg }}
              >
                <Icon className="w-5 h-5" style={{ color: a.fg }} />
              </div>
              <div className="font-medium text-gray-900">{t.label}</div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed h-10 overflow-hidden">{t.desc}</p>
              <div className="text-xs mt-3 font-medium text-blue-600">{ctaText(t)}</div>
            </button>
          );
        })}
      </div>

      {/* page / article 类型工具：sandbox iframe 弹层（不给 allow-same-origin，隔离 XSS） */}
      {pageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPageModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="font-medium text-gray-900">{pageModal.label}</div>
              <button
                type="button"
                onClick={() => setPageModal(null)}
                className="text-gray-400 hover:text-gray-700 transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {pageModal.type === 'article' ? (
              // 文章：从公开接口 /api/page/:id 加载（跨域导航，sandbox 隔离）
              <iframe
                title={pageModal.label}
                src={`${getCmsBaseURL()}/api/page/${encodeURIComponent(pageModal.pageId || '')}`}
                sandbox="allow-scripts allow-popups allow-forms"
                className="flex-1 w-full border-0"
              />
            ) : (
              // 自定义页面：内联 HTML
              <iframe
                title={pageModal.label}
                srcDoc={pageModal.html}
                sandbox="allow-scripts allow-popups allow-forms"
                className="flex-1 w-full border-0"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolsPage;
