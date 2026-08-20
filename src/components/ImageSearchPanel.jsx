/**
 * 以图搜图 通用面板（弹窗）
 * 支持两个维度：
 *   1) 图案库以图搜图        （scope=patterns）
 *   2) 套图结果以图搜图      （scope=mockup-results）
 *      - 用图案搜：searchBy=pattern（拿一张图案图，反查引用了它的套图结果）
 *      - 用整张套完的图搜：searchBy=composite（拿一张成品图，按视觉相似匹配成品图）
 *
 * Props:
 *   defaultScope:   'patterns' | 'mockup-results'
 *   defaultSearchBy:'pattern' | 'composite'（仅 mockup-results 生效）
 *   patternOptions: [{ id, name, url }] 可选，允许从当前文件夹已有图案中一键选择查询图
 *   onClose():      关闭面板
 *   onOpenPattern(result): 点击图案库结果时回调（父组件选中对应文件夹）
 *   onOpenMockup(result):  点击套图结果时回调（父组件打开对应文件夹套图）
 */
import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Upload, ImageIcon, Loader2, ArrowRight, FolderOpen } from 'lucide-react';
import { imageSearch } from '../api/duplicate';
import { getImageUrl } from '../api/axios';

const SCOPE_LABELS = {
  patterns: '图案库',
  'mockup-results': '套图结果',
  all: '全部',
};

export default function ImageSearchPanel({
  defaultScope = 'patterns',
  defaultSearchBy = 'pattern',
  patternOptions = [],
  onClose,
  onOpenPattern,
  onOpenMockup,
}) {
  const [scope, setScope] = useState(defaultScope);
  const [searchBy, setSearchBy] = useState(defaultSearchBy);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pickImageId, setPickImageId] = useState('');
  const [topN, setTopN] = useState(12);
  const [maxDistance, setMaxDistance] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [viewResult, setViewResult] = useState(null); // 结果大图预览
  const fileInputRef = useRef(null);

  const isComposite = scope === 'mockup-results' && searchBy === 'composite';
  // 选择查询图的方式：上传文件，或从当前文件夹图案里选（仅当该维度支持图案作查询图）
  const canPickPattern = scope === 'patterns' || (scope === 'mockup-results' && searchBy === 'pattern');

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    setPickImageId('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handlePick = (e) => {
    const id = e.target.value;
    setPickImageId(id);
    setFile(null);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    const p = patternOptions.find((x) => x.id === id);
    if (p && p.url) setPreviewUrl(getImageUrl(p.url));
  };

  const runSearch = useCallback(async () => {
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const params = { scope, searchBy, topN: Number(topN), maxDistance: Number(maxDistance) };
      if (file) params.file = file;
      else if (pickImageId) params.imageId = pickImageId;
      else if (previewUrl == null && !file) {
        // 允许仅用上传；若两者皆无则提示
      }
      if (!file && !pickImageId) {
        setError('请先上传一张查询图，或从图案库选择一张');
        setLoading(false);
        return;
      }
      const data = await imageSearch(params);
      setResults(data.results || []);
    } catch (err) {
      setError((err && err.message) || '搜索失败');
    } finally {
      setLoading(false);
    }
  }, [scope, searchBy, topN, maxDistance, file, pickImageId, previewUrl]);

  const handleResultClick = (r) => {
    const all = results || [];
    if (r.type === 'pattern') {
      onOpenPattern && onOpenPattern(r, all);
    } else {
      onOpenMockup && onOpenMockup(r, all);
    }
    // 关闭面板交给父组件（父组件在 applySearchMatches / 跳转逻辑中关闭）
    onClose && onClose();
  };

  const thumbFor = (r) => {
    if (r.url) return getImageUrl(r.url);
    return null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-amber-600" />
            <h3 className="text-base font-semibold text-slate-800">以图搜图</h3>
          </div>
          <button
            onClick={() => onClose && onClose()}
            className="rounded-md p-1 text-slate-400 transition hover:bg-amber-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 主体 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 维度选择 */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">搜索维度</label>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {['patterns', 'mockup-results'].map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    scope === s ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {SCOPE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 套图结果：搜索方式 */}
          {scope === 'mockup-results' && (
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">搜索方式</label>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  onClick={() => setSearchBy('pattern')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    searchBy === 'pattern' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  用图案搜
                </button>
                <button
                  onClick={() => setSearchBy('composite')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    searchBy === 'composite' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  用整张套完的图搜
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {searchBy === 'pattern'
                  ? '上传一张图案图，找出引用了它的套图结果（按图案反查）'
                  : '上传一张套完的成品图，按视觉相似度匹配其它成品图'}
              </p>
            </div>
          )}

          {/* 查询图 */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-500">查询图</label>
            <div className="flex items-center gap-3">
              <div
                className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="查询图预览" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-300" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-amber-400 hover:text-amber-700"
                >
                  <Upload className="h-4 w-4" />
                  {file ? `已选：${file.name}` : '上传图片'}
                </button>
                {canPickPattern && patternOptions.length > 0 && (
                  <select
                    value={pickImageId}
                    onChange={handlePick}
                    className="max-w-[220px] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                  >
                    <option value="">— 或从当前图案库选择 —</option>
                    {patternOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* 高级参数 */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">返回数量（topN）</label>
              <input
                type="number"
                min={1}
                max={100}
                value={topN}
                onChange={(e) => setTopN(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">相似度阈值（汉明距离，越小越严）</label>
              <input
                type="number"
                min={0}
                max={64}
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={runSearch}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? '搜索中…' : '开始搜索'}
          </button>

          {/* 结果 */}
          {results && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">
                  共找到 {results.length} 条结果
                </span>
              </div>
              {results.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
                  没有找到相似图片，试试调大「相似度阈值」或换一张查询图
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {results.map((r, i) => {
                    const thumb = thumbFor(r);
                    return (
                      <button
                        key={`${r.type}-${r.folderId}-${r.groupName || ''}-${r.colorName || ''}-${r.name || ''}-${i}`}
                        onClick={() => handleResultClick(r)}
                        className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition hover:border-amber-400 hover:shadow-md"
                      >
                        <div className="relative flex h-28 items-center justify-center overflow-hidden bg-slate-50">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-slate-300" />
                          )}
                          {r.similarity != null && (
                            <span className="absolute right-1 top-1 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                              {Math.round(r.similarity * 100)}%
                            </span>
                          )}
                        </div>
                        <div className="px-2 py-1.5">
                          <div className="truncate text-xs font-medium text-slate-700">
                            {r.folderName || '—'}
                          </div>
                          <div className="truncate text-[11px] text-slate-400">
                            {r.groupName ? `${r.groupName} / ` : ''}
                            {r.colorName || r.name || (r.type === 'mockup-pattern' ? '用图案命中' : '')}
                          </div>
                          <div className="mt-0.5 flex items-center gap-0.5 text-[11px] text-amber-600 opacity-0 transition group-hover:opacity-100">
                            打开 <ArrowRight className="h-3 w-3" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
