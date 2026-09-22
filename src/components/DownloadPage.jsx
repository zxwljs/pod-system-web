// ─── 公开下载页（#/download，无需登录）───
// 存在意义：客户拿到账号后必须先有客户端才能登录，此前下载入口藏在登录墙后面，
// 形成「没有客户端 → 无法登录 → 看不到下载页」的死循环。本页完全公开：
//   ① 从后台版本库同步最新客户端安装包地址（后台发布新版即自动生效）
//   ② 提供飞书文档下载入口（含安装包与图文教程）
//   ③ 提供客服兜底入口
// 注意：本页不出现任何后端/授权服务地址，避免为攻击者提供侦察信息。

import React, { useEffect } from 'react';
import {
  Download, ShieldCheck, MousePointerClick, LogIn, MessageCircle, Mail, HelpCircle,
} from 'lucide-react';
import ClientDownloadCard from './ClientDownloadCard.jsx';
import { DEFAULT_SITE_SETTINGS } from '../api/siteSettings.js';

const STEPS = [
  { icon: Download, title: '下载安装包', desc: '在下方点击下载 Windows 客户端（约 100MB）。' },
  { icon: MousePointerClick, title: '双击运行', desc: '解压后双击 .exe 运行，首次启动可能需等待数秒。' },
  { icon: LogIn, title: '回到网站登录', desc: '客户端启动后回到本页面，用我们分配的账号登录即可。' },
];

const FAQ = [
  {
    q: '我还没有客户端，能先登录吗？',
    a: '不能。账号登录需要客户端在本机运行并上报设备指纹。所以顺序是：先在本页下载安装客户端 → 再回到网站登录。本页无需登录即可访问，也可以直接把 https://ddddnet.cn/#/download 发给同事或客户。',
  },
  {
    q: '登录时提示「无法连接本机服务」怎么办？',
    a: '说明客户端没有启动或已被关闭。请双击客户端程序，等它启动完成（任务栏出现图标）后回到网页重新登录。',
  },
  {
    q: '提示「账号已在另一台设备绑定」怎么办？',
    a: '一个账号默认绑定一台设备。换机或重装系统后，请把新设备的设备 ID 发给客服申请解绑，解绑后即可在新设备登录。',
  },
  {
    q: '下载链接打不开或速度慢？',
    a: '可改用飞书文档入口下载（含最新安装包与教程）。若仍失败，请联系客服直接发送安装包。',
  },
  {
    q: '安装后图片会上传云端吗？',
    a: '不会。套图、搜图、侵权检测全部在你本机完成，云端只保存账号与授权信息。',
  },
  {
    q: '系统要求？',
    a: 'Windows 10 / 11 64 位，建议 8GB 以上内存、预留 2GB 以上磁盘空间。暂不支持 macOS 与手机端。',
  },
];

export default function DownloadPage({ siteSettings, onLogin }) {
  const contact = { ...DEFAULT_SITE_SETTINGS, ...(siteSettings || {}) };

  useEffect(() => {
    document.title = '下载客户端 — 叮当跨境 ERP';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', '叮当跨境 ERP 桌面客户端下载：Windows 安装包最新版、飞书文档安装包与图文教程入口、安装与登录指引。无需登录即可下载。');
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* 顶栏 */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">POD</div>
            <span className="text-lg font-semibold text-gray-900">叮当跨境 ERP</span>
          </a>
          <div className="flex items-center gap-2">
            <a href="#/" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              返回首页
            </a>
            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              登录
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
            <ShieldCheck className="w-3.5 h-3.5" />
            本页无需登录，可直接下载
          </span>
          <h1 className="mt-5 text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            先安装桌面客户端<br className="hidden sm:block" />再用账号登录
          </h1>
          <p className="mt-5 text-gray-600 leading-relaxed">
            客户端要装在你自己的电脑上，账号登录依赖客户端上报的本机设备信息，
            所以顺序是「先下载安装 → 再登录」。安装包地址随后台版本库自动更新，永远是最新版。
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center text-sm">
            <a href="#download-now" className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              立即下载
            </a>
            <a href="#faq" className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-white transition-colors">
              安装/登录遇到问题
            </a>
          </div>
        </div>
      </section>

      {/* 下载卡片 */}
      <section id="download-now" className="max-w-3xl mx-auto px-6 pt-12 pb-4 scroll-mt-6">
        <ClientDownloadCard siteSettings={contact} />
      </section>

      {/* 安装步骤 */}
      <section className="max-w-3xl mx-auto px-6 py-10">
        <h2 className="text-xl font-bold text-gray-900">三步开始使用</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 text-blue-600">
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold text-gray-400">STEP {i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold text-gray-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <strong>注意：</strong>客户端仅在本地运行，不会上传你的图片数据。所有套图与检测都在你电脑上完成。
        </div>
      </section>

      {/* 常见问题 */}
      <section id="faq" className="bg-gray-50 scroll-mt-6">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            常见问题
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl bg-white border border-gray-200 p-5">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                  <span className="font-medium text-gray-900 text-sm">{f.q}</span>
                  <span className="text-xs text-gray-400 group-open:hidden">展开</span>
                  <span className="text-xs text-gray-400 hidden group-open:inline">收起</span>
                </summary>
                <p className="mt-3 text-sm text-gray-600 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 联系我们 */}
      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-xl font-bold text-gray-900 text-center">需要人工协助？</h2>
        <p className="mt-2 text-center text-sm text-gray-500">发货、解绑设备、续费、安装包发送都可以找客服</p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-10">
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
              <div className="flex items-center gap-2 text-gray-600">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <span>微信号：<span className="font-medium text-gray-900">{contact.wechatId}</span></span>
              </div>
            )}
            {contact.contactEmail && (
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-4 h-4 text-blue-600" />
                <span>
                  邮箱：
                  <a href={`mailto:${contact.contactEmail}`} className="font-medium text-blue-600 hover:underline">
                    {contact.contactEmail}
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-gray-400 space-y-1">
          <div className="flex items-center justify-center gap-4">
            <a href="#/" className="hover:text-gray-600">首页</a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">用户服务协议</a>
            <a href="/terms.html#privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">隐私政策</a>
          </div>
          {contact.icpNumber ? <div>{contact.icpNumber}</div> : <div>备案号待补充</div>}
          <div>叮当跨境 ERP · POD 套图系统</div>
        </div>
      </footer>
    </div>
  );
}
