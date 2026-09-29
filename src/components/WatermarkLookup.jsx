/**
 * 出单反查（暗水印解码）
 *
 * 场景：商品出单后，从 TEMU 把商品主图/细节图保存（或右键复制）下来，
 *       上传/粘贴到本页 → 后端解出图里埋的暗水印 ID → 反查映射表，
 *       得到「所属文件夹 / 图案组 / SKU 颜色 / 主图还是第几张细节图」。
 *
 * 依赖后端：
 *   POST /api/watermark/decode  （multipart 字段名 image；解码不出也返回 HTTP 200 + { ok:false }）
 *   GET  /api/watermark/stats   （服务可用性 + 已埋图数量）
 * 新生成的套图会在生成完成后自动嵌入水印；水印功能上线前的历史图没有水印，反查会提示「不是本系统生成」。
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Fingerprint, Upload, Image as ImageIcon, Loader2, AlertTriangle,
  Eye, Copy, CheckCircle, ExternalLink, RotateCcw,
} from 'lucide-react';
import { apiWatermarkDecode, apiWatermarkStats, getImageUrl } from '../api/axios';

// type=0 主图，>0 细节图序号（与 services/watermark.js embedFolderMockups 的约定一致）
const typeLabel = (t) => (Number(t) === 0 ? '主图' : `细节图 ${t}`);

export default function WatermarkLookupTool() {
  const [stats, setStats] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // 服务状态：用于在解码前就告诉用户「工具没装 / 功能被关」，避免白传一张图
  useEffect(() => {
    let alive = true;
    apiWatermarkStats()
      .then((s) => { if (alive) setStats(s); })
      .catch(() => { /* 状态拿不到不阻塞，解码时自然会报错 */ });
    return () => { alive = false; };
  }, []);

  const setFileWithPreview = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setCopied(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) setFileWithPreview(f);
    e.target.value = ''; // 允许再次选择同一张图
  };

  // 支持直接 Ctrl+V 粘贴：TEMU 页面右键「复制图片」后无需另存
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData && e.clipboardData.files;
      if (items && items.length && items[0].type.startsWith('image/')) {
        e.preventDefault();
        setFileWithPreview(items[0]);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const runDecode = useCallback(async () => {
    if (!file) { setError('请先上传、拖入或粘贴一张商品图'); return; }
    setError(null);
    setResult(null);
    setCopied(false);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await apiWatermarkDecode(fd);
      if (r && r.ok) setResult(r);
      else setError((r && r.error) || '未能解码出有效水印');
    } catch (err) {
      setError((err && err.message) || '解码请求失败');
    } finally {
      setLoading(false);
    }
  }, [file]);

  const item = result && result.item;
  const thumbUrl = item && item.url ? getImageUrl(item.url) : null;

  const copyInfo = async () => {
    if (!item) return;
    const text = [
      `文件夹：${item.folderName || '—'}`,
      `图案组：${item.groupName || '—'}`,
      `SKU 颜色：${item.colorName || '—'}`,
      `图片类型：${typeLabel(item.type)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { /* 剪贴板不可用时静默 */ }
  };

  // 跳到套图结果页并自动定位：MockupResult 支持 #/results/{folderId}/{groupName} 深链（自动打开文件夹+选中组）
  const openInResults = () => {
    if (!item || !item.folderId || !item.groupName) return;
    window.location.hash = `#/results/${item.folderId}/${encodeURIComponent(item.groupName)}`;
  };

  // 失败原因分流：后端两种典型报错给出不同的下一步指引
  const errorHint = (() => {
    if (!error) return null;
    if (error.includes('映射表中无对应记录')) {
      return '这张图不是本系统生成的，或生成于暗水印功能上线之前（历史图没有水印）。仅支持反查功能上线后新生成的套图。';
    }
    if (error.includes('未能解码')) {
      return '可能原因：图片被裁剪过（裁剪无法还原）、压缩过度损毁水印，或这张图不是本系统生成的成品图。';
    }
    return null;
  })();

  return (
    <div className="space-y-5">
      {/* 服务状态横幅：工具未装 / 功能被关时提前告知，避免白传图 */}
      {stats && !stats.enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          暗水印功能已被关闭（环境变量 POD_WATERMARK=0），需开启后重新启动客户端。
        </div>
      )}
      {stats && stats.enabled && !stats.available && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{stats.toolError || '水印组件未找到'}。本功能需要完整客户端（含水印组件）支持，当前环境无法解码。</span>
        </div>
      )}

      {/* 上传区：点击 / 拖拽 / Ctrl+V 粘贴 */}
      <div
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f && f.type.startsWith('image/')) setFileWithPreview(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-slate-50 hover:border-amber-400 hover:bg-amber-50/50'
        }`}
      >
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        {previewUrl ? (
          <img src={previewUrl} alt="待解码图片预览" className="max-h-56 rounded-lg border border-slate-200 object-contain shadow-sm" />
        ) : (
          <>
            <Upload className="h-9 w-9 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">点击上传，或把图片拖到这里</p>
            <p className="mt-1 text-xs text-slate-400">支持 Ctrl+V 直接粘贴（在 TEMU 页面右键「复制图片」即可）· 单张 ≤ 20MB</p>
          </>
        )}
        {file && previewUrl && (
          <p className="mt-2 max-w-full truncate text-xs text-slate-500">{file.name}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={runDecode}
          disabled={loading || !file}
          className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
          {loading ? '解码中…' : '开始反查'}
        </button>
        {file && !loading && (
          <button
            onClick={() => { setFileWithPreview(null); setError(null); setResult(null); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-slate-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            换一张
          </button>
        )}
        <p className="text-xs text-slate-400">解码约需 10~40 秒（被平台缩放过的图会自动尝试多种尺寸还原）</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <div className="font-medium">{error}</div>
          {errorHint && <div className="mt-1 text-xs leading-relaxed text-red-500">{errorHint}</div>}
        </div>
      )}

      {/* 结果卡：定位信息 + 系统原图 */}
      {result && item && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle className="h-5 w-5" />
            已定位到系统中的商品图
            {result.restored && (
              <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-normal text-emerald-700">
                检测到平台缩放，已还原 {result.restored[0]}×{result.restored[1]} 后解码
              </span>
            )}
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => thumbUrl && window.open(thumbUrl, '_blank', 'noopener,noreferrer')}
              className="group relative flex h-44 w-44 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
              title="点击查看系统原图"
            >
              {thumbUrl ? (
                <>
                  <img src={thumbUrl} alt="系统中的原图" className="h-full w-full object-contain" />
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
                    <Eye className="h-6 w-6" />
                  </span>
                  <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {typeLabel(item.type)}
                  </span>
                </>
              ) : (
                <ImageIcon className="h-8 w-8 text-slate-300" />
              )}
            </button>
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2">
                <span className="text-slate-400">文件夹</span>
                <span className="truncate font-medium text-slate-800">{item.folderName || '—'}</span>
                <span className="text-slate-400">图案组</span>
                <span className="truncate font-medium text-slate-800">{item.groupName || '—'}</span>
                <span className="text-slate-400">SKU 颜色</span>
                <span className="truncate font-medium text-slate-800">{item.colorName || '—'}</span>
                <span className="text-slate-400">图片类型</span>
                <span className="font-medium text-slate-800">{typeLabel(item.type)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-400">
                {item.width > 0 && item.height > 0 && <span>原始尺寸 {item.width}×{item.height}</span>}
                <span>水印 ID #{result.id}</span>
                {result.attempts > 1 && <span>解码尝试 {result.attempts} 次</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {item.folderId && item.groupName && (
                  <button
                    onClick={openInResults}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    在套图结果中打开
                  </button>
                )}
                {thumbUrl && (
                  <button
                    onClick={() => window.open(thumbUrl, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    查看原图
                  </button>
                )}
                <button
                  onClick={copyInfo}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? '已复制' : '复制定位信息'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 覆盖说明：让用户知道哪些图能查、哪些查不了 */}
      <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-400">
        仅支持反查本系统生成、且在暗水印功能上线后导出的套图（生成时自动嵌入，无需手动操作）。
        历史图与外部图片没有水印，无法反查；图片被第三方工具<b className="text-slate-500">裁剪</b>过也无法解码（缩放和压缩可自动还原）。
        {stats && stats.available && <span> 当前已埋水印图片 {stats.total} 张。</span>}
      </div>
    </div>
  );
}
