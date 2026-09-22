// ─── 客户端下载卡片（公开下载页 + 登录后「介绍 / 下载客户端」共用）───
// 数据来源单一：后台「软件版本」模块发布的 gui 安装包（cms-worker /api/software-versions），
// 页面每次打开都会重新拉取，后台发新版即生效，前端无需重新部署。

import React, { useMemo, useState } from 'react';
import {
  Download, RefreshCw, Check, Copy, AlertCircle, Loader2, ExternalLink, HardDriveDownload,
} from 'lucide-react';
import { useSoftwareVersion } from '../hooks/useSoftwareVersion';
import { DEFAULT_SITE_SETTINGS } from '../api/siteSettings.js';

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function ClientDownloadCard({ siteSettings, showAgreement = true }) {
  const { gui, loading, error, fetchedAt, reload } = useSoftwareVersion();
  const contact = { ...DEFAULT_SITE_SETTINGS, ...(siteSettings || {}) };

  const [agreed, setAgreed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const officialUrl = gui?.downloadUrl || '';
  const fallbackUrl = contact.clientFallbackDownloadUrl || '';
  // 主按钮优先级：版本库直链 → 后台配置的备用直链
  const primaryUrl = officialUrl || fallbackUrl;
  const usingFallback = !officialUrl && !!fallbackUrl;
  const feishuUrl = contact.feishuDownloadUrl || '';

  const publishedAt = useMemo(() => formatDate(gui?.publishedAt), [gui?.publishedAt]);
  const canDownload = !!primaryUrl && (!showAgreement || agreed);

  const handleCopy = async () => {
    if (!primaryUrl) return;
    try {
      await navigator.clipboard.writeText(primaryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { /* 剪贴板不可用则忽略 */ }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* 头部：版本状态 */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <HardDriveDownload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {gui?.title || '叮当跨境 ERP 桌面客户端'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading && !gui && '正在获取最新版本…'}
              {!loading && gui?.version && (
                <>
                  最新版本 <span className="font-medium text-gray-700">v{gui.version}</span>
                  {publishedAt && <span className="text-gray-400"> · 发布于 {publishedAt}</span>}
                </>
              )}
              {!loading && !gui?.version && (error ? '版本库暂时无法连接' : '后台尚未发布安装包')}
            </p>
          </div>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          title={fetchedAt ? `上次同步：${new Date(fetchedAt).toLocaleTimeString()}` : '重新获取最新版本'}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          同步最新版本
        </button>
      </div>

      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-600">
          桌面客户端运行在你自己的电脑上，图片处理不上传云端。下载安装后回到本页面登录即可。
        </p>

        {/* 协议勾选（与后台发布规范一致：下载前需同意协议） */}
        {showAgreement && (
          <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 mt-0.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
            />
            <span>
              我已阅读并同意
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mx-1">《用户服务协议》</a>
              与
              <a href="/terms.html#privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mx-1">《隐私政策》</a>
            </span>
          </label>
        )}

        {/* 下载按钮组 */}
        <div className="flex flex-wrap gap-3">
          <a
            href={canDownload ? primaryUrl : undefined}
            onClick={(e) => { if (!canDownload) e.preventDefault(); }}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-colors ${
              canDownload
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title={!primaryUrl ? '后台尚未发布安装包' : (!agreed && showAgreement ? '请先勾选同意协议' : '下载 Windows 客户端')}
          >
            <Download className="w-4 h-4" />
            <span>
              {loading && !primaryUrl
                ? '正在获取下载地址…'
                : primaryUrl
                  ? `下载 Windows 客户端${gui?.version ? ` v${gui.version}` : ''}`
                  : '下载地址获取中'}
            </span>
          </a>

          {primaryUrl && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制下载链接'}
            </button>
          )}

          {feishuUrl && (
            <a
              href={feishuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              飞书文档下载（安装包 + 教程）
            </a>
          )}
        </div>

        {/* 提示区 */}
        {usingFallback && (
          <div className="flex gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>当前走的是备用下载线路（后台版本库暂不可用），安装包可能不是最新版。</span>
          </div>
        )}
        {!loading && error && !gui && (
          <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              未能从官方版本库获取最新地址（{error}）。
              {fallbackUrl || feishuUrl
                ? '可先用下方其它入口下载安装。'
                : '请点右上角「同步最新版本」重试，或联系客服获取安装包。'}
            </span>
          </div>
        )}
        {!loading && !error && gui && !officialUrl && !fallbackUrl && (
          <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              后台尚未发布安装包下载地址。
              {feishuUrl ? '请先用飞书文档入口下载，' : ''}或联系客服获取。
            </span>
          </div>
        )}

        {/* 更新说明 */}
        {gui?.notes && (
          <div className="rounded-lg bg-gray-50 border border-gray-100">
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
            >
              <span>更新说明{gui.version ? `（v${gui.version}）` : ''}</span>
              <span className="text-xs text-gray-400">{showNotes ? '收起' : '展开'}</span>
            </button>
            {showNotes && (
              <pre className="px-4 pb-4 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-sans">
                {gui.notes}
              </pre>
            )}
          </div>
        )}

        {/* 兜底客服 */}
        {!primaryUrl && !loading && (contact.wechatId || contact.contactEmail) && (
          <p className="text-xs text-gray-500">
            也可以直接联系客服获取安装包：
            {contact.wechatId && <span className="text-gray-700">微信 {contact.wechatId}</span>}
            {contact.wechatId && contact.contactEmail && ' / '}
            {contact.contactEmail && (
              <a href={`mailto:${contact.contactEmail}`} className="text-blue-600 hover:underline">{contact.contactEmail}</a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
