/**
 * 图案库重复检测 API 封装
 */
import { apiRequest, apiUpload } from './axios';

// ─── 重复检测配置 ───
export const getDuplicateSettings = () => apiRequest('/duplicate-settings');

export const saveDuplicateSettings = (settings) =>
  apiRequest('/duplicate-settings', { method: 'PUT', data: settings });

// ─── 重复分组索引 ───
export const getDuplicateIndex = (shopId) =>
  apiRequest('/duplicate-index' + (shopId && shopId !== 'all' ? `?shopId=${encodeURIComponent(shopId)}` : ''));

export const clearDuplicateIndex = () =>
  apiRequest('/duplicate-index', { method: 'DELETE' });

// ─── 全库扫描 ───
// 启动全库扫描（异步，返回 202）
export const startScanAllDuplicates = (options = {}) =>
  apiRequest('/scan-all-duplicates', { method: 'POST', data: options });

// 查询扫描进度（轮询）
export const getScanStatus = () => apiRequest('/scan-status');

// ─── 忽略重复分组 ───
// shopId 用于后端按当前店铺过滤返回的 groups（保持前端视图一致；不传则返回全店铺）
export const ignoreDuplicateGroup = (groupId, shopId) =>
  apiRequest('/duplicate-ignore' + (shopId && shopId !== 'all' ? `?shopId=${encodeURIComponent(shopId)}` : ''), { method: 'POST', data: { groupId } });

export const unignoreDuplicateGroup = (groupId, shopId) =>
  apiRequest(`/duplicate-ignore/${encodeURIComponent(groupId)}` + (shopId && shopId !== 'all' ? `?shopId=${encodeURIComponent(shopId)}` : ''), { method: 'DELETE' });

export const getIgnoredGroups = (shopId) =>
  apiRequest('/duplicate-ignored' + (shopId && shopId !== 'all' ? `?shopId=${encodeURIComponent(shopId)}` : ''));

// ─── 以图搜图 ───
// scope: patterns | mockup-results | all
// searchBy: pattern | composite（仅 mockup-results 用；pattern=用图案反查套图，composite=用整张成品图搜）
// 查询图：上传文件(file) 或 imageId（图案库图片）或 imagePath（/uploads/... 相对路径）
// 返回 { results: [...], queryHash }
// 注意：必须用 apiUpload（multipart/form-data），不能用 apiRequest（会把 data 做 JSON.stringify 导致上传失败）
export const imageSearch = ({ scope, searchBy, shopId, topN, maxDistance, file, imageId, imagePath }) => {
  const fd = new FormData();
  if (scope) fd.append('scope', scope);
  if (searchBy) fd.append('searchBy', searchBy);
  if (shopId) fd.append('shopId', shopId);
  if (topN) fd.append('topN', String(topN));
  if (maxDistance != null) fd.append('maxDistance', String(maxDistance));
  if (file) fd.append('image', file);
  if (imageId) fd.append('imageId', imageId);
  if (imagePath) fd.append('imagePath', imagePath);
  return apiUpload('/image-search', fd, { method: 'POST' });
};
