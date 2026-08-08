/**
 * 图案库重复检测 API 封装
 */
import { apiRequest } from './axios';

// ─── 重复检测配置 ───
export const getDuplicateSettings = () => apiRequest('/duplicate-settings');

export const saveDuplicateSettings = (settings) =>
  apiRequest('/duplicate-settings', { method: 'PUT', data: settings });

// ─── 重复分组索引 ───
export const getDuplicateIndex = () => apiRequest('/duplicate-index');

export const clearDuplicateIndex = () =>
  apiRequest('/duplicate-index', { method: 'DELETE' });

// ─── 全库扫描 ───
// 启动全库扫描（异步，返回 202）
export const startScanAllDuplicates = (options = {}) =>
  apiRequest('/scan-all-duplicates', { method: 'POST', data: options });

// 查询扫描进度（轮询）
export const getScanStatus = () => apiRequest('/scan-status');

// ─── 忽略重复分组 ───
export const ignoreDuplicateGroup = (groupId) =>
  apiRequest('/duplicate-ignore', { method: 'POST', data: { groupId } });

export const unignoreDuplicateGroup = (groupId) =>
  apiRequest(`/duplicate-ignore/${encodeURIComponent(groupId)}`, { method: 'DELETE' });

export const getIgnoredGroups = () =>
  apiRequest('/duplicate-ignored');
