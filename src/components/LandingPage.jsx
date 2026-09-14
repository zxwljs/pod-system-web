// ─── 公共落地页（未登录可见）───
// 目的：① 让陌生访客先知道这是什么产品 ② 展示套餐与客服 ③ 提供登录入口
// 注意：本页不出现任何后端/授权服务地址，避免为攻击者提供侦察信息。

import React, { useState, useEffect } from 'react';
import { fetchPlans, formatDuration, readPlansCache, DEFAULT_PLANS } from '../api/plans.js';
import { DEFAULT_SITE_SETTINGS } from '../api/siteSettings.js';

const FEATURES = [
  { title: '图案库管理', desc: '批量上传、自动分组、拖拽排序，支持 ZIP 导入导出' },
  { title: '模板批量套图', desc: '一次套完整个文件夹，支持细节图、遮罩羽化、撞色自动修复' },
  { title: '重复与侵权检测', desc: 'MD5 + 感知哈希查重，AI 辅助识别版权风险图案' },
  { title: 'AI 标题生成', desc: '按图案内容自动生成多语言商品标题' },
  { title: '批量处理工具', desc: '改尺寸、压缩、格式转换、按组分批重命名' },
  { title: '多平台上架', desc: '对接店小秘、妙手 ERP，配合浏览器扩展半自动上架 TEMU' },
];

export default function LandingPage({ siteSettings, onLogin }) {
  const [plans, setPlans] = useState(() => readPlansCache() || DEFAULT_PLANS);
  const contact = { ...DEFAULT_SITE_SETTINGS, ...(siteSettings || {}) };

  useEffect(() => {
    document.title = '叮当跨境 ERP · POD 套图系统 — 图案管理 / 批量套图 / 侵权检测';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      '叮当跨境 ERP 是面向 POD 跨境电商卖家的桌面工具：图案库管理、模板批量套图、重复与侵权检测、AI 标题生成、批量处理与多平台上架。'
    );
    fetchPlans().then(setPlans);
  }, []);

  const planItems = (plans.items || []).filter((p) => p.enabled !== false);

  return (
    <div className="min-h-screen bg-white">
      {/* 顶栏 */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">POD</div>
            <span className="text-lg font-semibold text-gray-900">叮当跨境 ERP</span>
          </div>
          <button
            onClick={onLogin}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            登录
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
            跨境电商 POD 套图<br className="hidden sm:block" />一站式处理工具
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            从图案整理到批量套图、侵权检测、多平台上架，帮你把重复劳动交给工具，
            一天的工作量压缩到几分钟。
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onLogin}
              className="px-7 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              登录使用
            </button>
            <a
              href="https://www.ddddnet.cn"
              className="px-7 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-white transition-colors"
            >
              了解产品与下载
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            桌面客户端运行在本机，图片处理不上传云端，Processing 更快也更安全
          </p>
        </div>
      </section>

      {/* 功能 */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center">核心能力</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 套餐 */}
      {plans.enabled !== false && planItems.length > 0 && (
        <section className="bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-gray-900 text-center">套餐</h2>
            <p className="mt-2 text-center text-sm text-gray-500">
              各档位功能一致，仅使用时长不同
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {planItems.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl bg-white p-7 border ${
                    p.recommended ? 'border-blue-500 shadow-md' : 'border-gray-200'
                  } relative`}
                >
                  {p.recommended && (
                    <span className="absolute -top-3 left-7 px-3 py-1 rounded-full bg-blue-600 text-white text-xs">
                      推荐
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{p.name}</h3>
                    {p.tag && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700">{p.tag}</span>
                    )}
                  </div>
                  <div className="mt-5">
                    <span className="text-3xl font-bold text-gray-900">
                      {plans.currency || '¥'}{p.price}
                    </span>
                    <span className="ml-1 text-sm text-gray-500">/ {formatDuration(p.durationDays)}</span>
                  </div>
                  <button
                    onClick={onLogin}
                    className={`mt-6 w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      p.recommended
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    选择此套餐
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 客服 */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center">联系我们</h2>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-10">
          {contact.wechatGroupQrUrl && (
            <div className="text-center">
              <img
                src={contact.wechatGroupQrUrl}
                alt={contact.wechatGroupQrTitle || '客服二维码'}
                className="w-40 h-40 object-contain rounded-xl border border-gray-200 bg-white"
              />
              <div className="mt-3 text-sm font-medium text-gray-900">
                {contact.wechatGroupQrTitle || '扫码联系'}
              </div>
              {contact.wechatGroupQrSubtitle && (
                <div className="text-xs text-gray-500">{contact.wechatGroupQrSubtitle}</div>
              )}
            </div>
          )}
          <div className="space-y-3 text-sm">
            {contact.wechatId && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-16">微信号</span>
                <span className="font-medium text-gray-900">{contact.wechatId}</span>
              </div>
            )}
            {contact.contactEmail && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-16">邮箱</span>
                <a href={`mailto:${contact.contactEmail}`} className="font-medium text-blue-600 hover:underline">
                  {contact.contactEmail}
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-gray-400 space-y-1">
          {contact.icpNumber ? <div>{contact.icpNumber}</div> : <div>备案号待补充</div>}
          <div>叮当跨境 ERP · POD 套图系统</div>
        </div>
      </footer>
    </div>
  );
}
