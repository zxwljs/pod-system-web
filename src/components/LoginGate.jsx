// ─── 强制登录页 ───
// plan 6.2 明确要求：未登录看不到任何业务组件（TABS、hash 路由全部在守卫之后）
// 必须在 App 最外层用 <LoginGate> 包裹原 App 内容；登录成功前 children 不挂载。

import React, { useState, useEffect, useCallback } from 'react';
import LoginPage from './LoginPage.jsx';
// 导入 auth.js：副作用是注入 axios 的 Authorization header + 暴露 onForceLogout handler
import { getAuthToken, setAuthToken, clearAuthToken, authMe } from '../api/auth.js';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60s 心跳（Worker 端节流，成功不写日志）
const HEARTBEAT_FAIL_THRESHOLD = 2;   // 连续 N 次失败 → 踢下线

export default function LoginGate({ children, siteSettings }) {
  // 三态：null=初始化中、true=已认证、false=未认证
  const [authed, setAuthed] = useState(null);
  const [heartbeatFails, setHeartbeatFails] = useState(0);
  const [showFullMask, setShowFullMask] = useState(false); // 全屏遮罩（连续失败后）

  const check = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      clearAuthToken();
      setAuthed(false);
      setHeartbeatFails(0);
      setShowFullMask(false);
      return false;
    }
    try {
      await authMe(token);
      setAuthed(true);
      setHeartbeatFails(0);
      setShowFullMask(false);
      return true;
    } catch (e) {
      // 401 / 403 = 账号层面失效（吊销、禁用、过期）→ 立刻踢
      if (e.status === 401 || e.status === 403) {
        console.warn('[auth] 令牌失效', e.code, e.message);
        clearAuthToken();
        setAuthed(false);
        setHeartbeatFails(0);
        setShowFullMask(false);
        return false;
      }
      // 网络/超时 = 累积失败计数，到阈值才踢（避免 Cloudflare 偶发抖动就全员掉线）
      setHeartbeatFails((prev) => {
        const n = prev + 1;
        if (n >= HEARTBEAT_FAIL_THRESHOLD) {
          console.warn('[auth] 心跳连续失败，强制下线', n);
          clearAuthToken();
          setAuthed(false);
          setShowFullMask(true);
        }
        return n;
      });
      return false;
    }
  }, []);

  // 首屏校验（同步读 token → 异步 me 校验）
  useEffect(() => {
    const hasToken = !!getAuthToken();
    if (!hasToken) {
      setAuthed(false);
      return;
    }
    check();
  }, [check]);

  // 60s 心跳
  useEffect(() => {
    if (authed !== true) return;
    const timer = setInterval(check, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authed, check]);

  // 全局 forceLogout：axios.js 抛 authFailure 时调用（任何本地后端 401 都强制回登录页）
  useEffect(() => {
    const handler = () => {
      console.warn('[LoginGate] axios 侧触发 forceLogout');
      clearAuthToken();
      setHeartbeatFails(0);
      setAuthed(false);
      setShowFullMask(true);
    };
    window.__pod_forceLogout = handler;
    return () => { if (window.__pod_forceLogout === handler) window.__pod_forceLogout = undefined; };
  }, []);

  // LoginPage 登录成功后主动重新挂载心跳
  useEffect(() => {
    if (authed === true) check();
  }, [authed, check]);

  // 渲染守卫层
  if (authed === null) {
    // 初始化中（本地可能有 token 但还没验证）
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm">正在确认登录状态…</div>
        </div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <>
        <LoginPage
          siteSettings={siteSettings}
          onBack={() => { window.location.hash = '#/' }}
          onLoggedIn={() => { setShowFullMask(false); setAuthed(true); }}
        />
        {showFullMask && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowFullMask(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">登录已失效</h3>
              <p className="text-sm text-gray-500 mb-4">
                无法连接授权服务器，连续心跳失败。请检查网络后重新登录。
              </p>
              <button className="w-full py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors" onClick={() => setShowFullMask(false)}>
                重新登录
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // authed === true
  return <>{children}</>;
}
