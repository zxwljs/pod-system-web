// ─── 账户菜单（登录后顶栏）───
// 展示账号、套餐、到期情况，并提供退出登录。
// 数据源：云端 GET /api/auth/me（{ email, plan, expires_at }）

import React, { useState, useEffect, useRef } from 'react';
import { getAuthToken, clearAuthToken, authMe, authLogout } from '../api/auth.js';

const PLAN_LABELS = {
  standard: '标准版',
  pro: '专业版',
  pro_plus: '专业版 Plus',
  trial: '试用版',
};

function formatExpiry(expiresAt) {
  if (!expiresAt) return { text: '长期有效', tone: 'ok' };
  // D1 存秒级时间戳
  const ms = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  const diff = ms - Date.now();
  if (diff <= 0) return { text: '已到期', tone: 'bad' };
  const days = Math.floor(diff / 86400000);
  const date = new Date(ms).toISOString().slice(0, 10);
  if (days <= 7) return { text: `${date}（仅剩 ${days} 天）`, tone: 'warn' };
  return { text: `${date}（剩 ${days} 天）`, tone: 'ok' };
}

const TONE_CLASS = {
  ok: 'bg-green-50 text-green-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
};

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = getAuthToken();
      if (!token) return;
      try {
        const data = await authMe(token);
        if (alive) setInfo(data);
      } catch (e) {
        // 令牌失效由 LoginGate/axios 的 forceLogout 处理，这里不重复踢人
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    const token = getAuthToken();
    try {
      if (token) await authLogout(token);
    } catch (e) {
      // 云端吊销失败也要清本地，否则用户被困在已登录态
    }
    clearAuthToken();
    window.location.hash = '#/';
    window.location.reload();
  };

  const expiry = info ? formatExpiry(info.expires_at) : null;
  const planLabel = info ? (PLAN_LABELS[info.plan] || info.plan || '—') : '—';

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
          {(info?.email || '?').slice(0, 1).toUpperCase()}
        </div>
        <span className="text-sm text-gray-700 max-w-[160px] truncate">
          {info?.email || '账户'}
        </span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-sm font-medium text-gray-900 truncate">{info?.email || '—'}</div>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">套餐</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{planLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">到期</span>
                <span className={`px-2 py-0.5 rounded font-medium ${expiry ? TONE_CLASS[expiry.tone] : 'text-gray-400'}`}>
                  {expiry ? expiry.text : '—'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {loggingOut ? '退出中…' : '退出登录'}
          </button>
        </div>
      )}
    </div>
  );
}
