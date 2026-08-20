const DEFAULT_BACKEND_URL = 'http://localhost:3001';

const getBackendURLFromParams = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('backend');
};

const getBackendURLFromStorage = () => {
  try {
    return localStorage.getItem('pod_backend_url');
  } catch (e) {
    return null;
  }
};

let backendURL = getBackendURLFromParams() || getBackendURLFromStorage() || DEFAULT_BACKEND_URL;

export const setBackendURL = (url) => {
  backendURL = url;
  try {
    localStorage.setItem('pod_backend_url', url);
  } catch (e) {}
};

export const getBackendURL = () => {
  const paramURL = getBackendURLFromParams();
  if (paramURL) {
    return paramURL;
  }
  return backendURL;
};

export const getBaseURL = () => {
  return `${backendURL}/api`;
};

export const apiRequest = async (path, options = {}) => {
  const { data, ...restOptions } = options;
  
  if (options.body && process.env.NODE_ENV !== 'production') {
    console.warn('[apiRequest] 使用了 body 属性而不是 data 属性！body 将被忽略，请使用 data 属性传递数据。');
  }
  
  const response = await fetch(`${getBaseURL()}${path}`, {
    ...restOptions,
    body: data ? JSON.stringify(data) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...restOptions.headers,
    },
  });
  
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    // 克隆一份响应，避免 json()/text() 二次读取同一 body stream 报错
    const errorResponse = response.clone();
    try {
      const errorData = await errorResponse.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      try {
        const text = await errorResponse.text();
        if (text && !text.startsWith('<!DOCTYPE')) {
          errorMessage = text;
        }
      } catch {
        // 如果 text() 也失败，保留默认 HTTP 状态信息
      }
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }
  
  return response.json();
};

export const apiUpload = async (path, formData, options = {}) => {
  const { method = 'POST', ...restOptions } = options;
  const response = await fetch(`${getBaseURL()}${path}`, {
    method,
    body: formData,
    ...restOptions,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    // 克隆一份响应，避免 json()/text() 二次读取同一 body stream 报错
    const errorResponse = response.clone();
    try {
      const errorData = await errorResponse.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      try {
        const text = await errorResponse.text();
        if (text && !text.startsWith('<!DOCTYPE')) {
          errorMessage = text;
        }
      } catch {
        // 如果 text() 也失败，保留默认 HTTP 状态信息
      }
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

export const getImageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${getBackendURL()}${path}`;
};

// ── 批量改尺寸工具 ──
// 上传多文件 + 参数，返回 { taskId, total }；进度走现有 tasks 内存对象（前端轮询 GET /api/tasks/:id）
export const apiResizeBatch = (formData) => apiUpload('/resize-batch', formData);
export const apiCompressBatch = (formData) => apiUpload('/compress-batch', formData);
// 下载已完成的 zip 包
export const getResizeZipUrl = (taskId) => `${getBaseURL()}/resize-batch/${taskId}/zip`;
export const getCompressZipUrl = (taskId) => `${getBaseURL()}/compress-batch/${taskId}/zip`;

// ── Excel 表格合并工具 ──
// 上传多文件（.xlsx/.csv）+ 参数，返回 { taskId, total }；进度走现有 tasks 内存对象（前端轮询 GET /api/tasks/:id）
export const apiExcelMerge = (formData) => apiUpload('/excel-merge', formData);
// 下载合并后的单个 .xlsx
export const getExcelMergeUrl = (taskId) => `${getBaseURL()}/excel-merge/${taskId}/file`;

// ── 商品数据管理（Temu）──
export const apiTemuImport = (formData) => apiUpload('/temu-products/import', formData);
export const apiTemuQuery = (params) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return apiRequest(`/temu-products?${qs.toString()}`);
};
export const apiTemuStats = (params) => {
  const qs = new URLSearchParams();
  if (params) Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  const qsStr = qs.toString();
  return apiRequest(`/temu-products/stats${qsStr ? '?' + qsStr : ''}`);
};
export const apiTemuImportLogs = (page = 1) => apiRequest(`/temu-products/import-logs?page=${page}`);
export const getTemuExportUrl = (params) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return `${getBaseURL()}/temu-products/export?${qs.toString()}`;
};
export const apiTemuClearAll = () => apiRequest('/temu-products/all?confirm=DELETE_ALL', { method: 'DELETE' });
export const apiTemuSpuQuery = (params) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return apiRequest(`/temu-products/spu?${qs.toString()}`);
};
export const apiTemuChanges = (params) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return apiRequest(`/temu-products/changes?${qs.toString()}`);
};
export const apiTemuSkuDetail = (skuId) => apiRequest(`/temu-products/${encodeURIComponent(skuId)}/detail`);
export const apiTemuBatchDelete = (data) => apiRequest('/temu-products/batch-delete', { method: 'POST', data });

// ── 批量格式转换工具 ──
// 上传多文件 + 目标格式参数，返回 { taskId, total }；进度走现有 tasks 内存对象（前端轮询 GET /api/tasks/:id）
export const apiConvertBatch = (formData) => apiUpload('/convert-batch', formData);
// 下载转换完成的 zip 包
export const getConvertZipUrl = (taskId) => `${getBaseURL()}/convert-batch/${taskId}/zip`;

// ── 图片分组重命名工具 ──
// 上传多文件 + renamePlan(JSON)，返回 { taskId, total }；进度走现有 tasks 内存对象（前端轮询 GET /api/tasks/:id）
export const apiGroupRenameBatch = (formData) => apiUpload('/group-rename-batch', formData);
// 下载重命名完成的 zip 包
export const getGroupRenameZipUrl = (taskId) => `${getBaseURL()}/group-rename-batch/${taskId}/zip`;

// 检测当前页面协议与后端协议是否冲突(HTTPS 页面无法请求 HTTP 后端)
export const getBackendProtocolInfo = () => {
  const backendURL = getBackendURL();
  const pageProtocol = window.location.protocol;
  const isBackendHttp = backendURL.startsWith('http:');
  const isPageHttps = pageProtocol === 'https:';
  return {
    backendURL,
    pageProtocol,
    isMixedContent: isPageHttps && isBackendHttp,
    isLocalhost: /^(https?:\/\/)?localhost(:\d+)?/.test(backendURL) || /^(https?:\/\/)?127\.0\.0\.1(:\d+)?/.test(backendURL)
  };
};

export const apiCopyrightCheckSingle = async (folderId, fileName) => {
  return apiRequest(`/folders/${folderId}/copyright-check-single`, {
    method: 'POST',
    data: { fileName }
  });
};

// AI 标题生成（看图写标题，镜像侵权检查的单图接口）
export const apiGenerateTitle = async (folderId, groupName, fileName, promptId) => {
  return apiRequest(`/folders/${folderId}/generate-title`, {
    method: 'POST',
    data: { groupName, fileName, promptId: promptId || undefined }
  });
};

// AI 标题批量生成：启动并发任务，返回 taskId（进度走 SSE）
// 视觉驱动：优先 items:[{key,imgUrl}]（imgUrl=视觉效果图路径），兼容旧 groupNames
export const apiGenerateTitlesBatch = async (folderId, { items, groupNames, promptId, concurrency }) => {
  const payload = { promptId: promptId || undefined, concurrency: concurrency || undefined };
  if (Array.isArray(items) && items.length) payload.items = items;
  else if (Array.isArray(groupNames) && groupNames.length) payload.groupNames = groupNames;
  return apiRequest(`/folders/${folderId}/generate-titles`, {
    method: 'POST',
    data: payload
  });
};

// 取消进行中的批量标题生成任务
export const apiCancelTitleGen = async (taskId) => {
  return apiRequest(`/title-gen/task/${taskId}/cancel`, { method: 'POST' });
};

// 手动编辑标题：PUT 回写 generatedTitles 同字段（groupName 需编码，可能含中文/空格）
export const apiUpdateTitle = async (folderId, groupName, title) => {
  return apiRequest(`/folders/${folderId}/titles/${encodeURIComponent(groupName)}`, {
    method: 'PUT',
    data: { title }
  });
};

export const apiStartCopyrightCheckTask = async (folderId) => {
  return apiRequest(`/folders/${folderId}/copyright-check`, {
    method: 'POST'
  });
};

export const apiGetCopyrightSettings = async () => {
  return apiRequest('/copyright/settings');
};

export const apiSaveCopyrightSettings = async (settings) => {
  return apiRequest('/copyright/settings', {
    method: 'POST',
    data: settings
  });
};

// ─── AI 模型配置（自定义接口 / 自定义模型）───
export const apiGetAIConfig = async () => {
  return apiRequest('/ai/config');
};

export const apiSaveAIConfig = async (config) => {
  return apiRequest('/ai/config', {
    method: 'POST',
    data: config
  });
};

export const apiTestAIConnection = async (feature = 'default', provider = null) => {
  return apiRequest('/ai/test', {
    method: 'POST',
    data: { feature, provider }
  });
};

export const apiTestAllAIConnections = async () => {
  return apiRequest('/ai/test-all', {
    method: 'POST'
  });
};

// ─── AI 标题生成提示词（多份，复用侵权 Key）───
export const apiGetTitlePrompts = async () => {
  return apiRequest('/title-gen/prompts');
};

export const apiSaveTitlePrompts = async (data) => {
  return apiRequest('/title-gen/prompts', {
    method: 'POST',
    data
  });
};

// ─── "保存到本地" 配置接口 ───
export const apiGetSaveConfig = async () => {
  return apiRequest('/save-config');
};

export const apiSaveSaveConfig = async (config) => {
  return apiRequest('/save-config', {
    method: 'POST',
    data: config
  });
};

export const apiValidateSaveConfig = async (defaultOutputPath) => {
  return apiRequest('/save-config/validate', {
    method: 'POST',
    data: { defaultOutputPath }
  });
};

// ─── 妙手ERP 配置 ───
export const apiGetMiaoshouConfig = async () => {
  return apiRequest('/miaoshou/config');
};

export const apiSaveMiaoshouConfig = async (config) => {
  return apiRequest('/miaoshou/config', {
    method: 'POST',
    data: config
  });
};

// ─── 妙手API 通用代理 ───
export const apiMiaoshouProxy = async (pathStr, body = null) => {
  return apiRequest('/miaoshou/proxy', {
    method: 'POST',
    data: { pathStr, body }
  });
};

// ─── 发布模板 CRUD ───
export const apiGetPublishTemplates = async () => {
  return apiRequest('/publish/templates');
};

export const apiCreatePublishTemplate = async (template) => {
  return apiRequest('/publish/templates', {
    method: 'POST',
    data: template
  });
};

export const apiUpdatePublishTemplate = async (id, template) => {
  return apiRequest(`/publish/templates/${id}`, {
    method: 'PUT',
    data: template
  });
};

export const apiDeletePublishTemplate = async (id) => {
  return apiRequest(`/publish/templates/${id}`, {
    method: 'DELETE'
  });
};

// ─── 店小秘上架模板 CRUD ───
export const apiGetDxmTemplates = async () => {
  return apiRequest('/dxm/templates');
};

export const apiCreateDxmTemplate = async (template) => {
  return apiRequest('/dxm/templates', {
    method: 'POST',
    data: template
  });
};

export const apiUpdateDxmTemplate = async (id, template) => {
  return apiRequest(`/dxm/templates/${id}`, {
    method: 'PUT',
    data: template
  });
};

export const apiDeleteDxmTemplate = async (id) => {
  return apiRequest(`/dxm/templates/${id}`, {
    method: 'DELETE'
  });
};

export const apiParseDxmTemplate = async (fileBase64) => {
  return apiRequest('/dxm/parse-template', {
    method: 'POST',
    data: { fileBase64 }
  });
};

// ─── TEMU 半托管上架：模板 / 映射 / 颜色别名 ───
export const apiGetTemuTemplates = async () => apiRequest('/temu/templates');
export const apiCreateTemuTemplate = async (t) => apiRequest('/temu/templates', { method: 'POST', data: t });
export const apiUpdateTemuTemplate = async (id, t) => apiRequest(`/temu/templates/${id}`, { method: 'PUT', data: t });
export const apiDeleteTemuTemplate = async (id) => apiRequest(`/temu/templates/${id}`, { method: 'DELETE' });
export const apiGetPatternMaps = async () => apiRequest('/temu/pattern-maps');
export const apiCreatePatternMap = async (m) => apiRequest('/temu/pattern-maps', { method: 'POST', data: m });
export const apiDeletePatternMap = async (id) => apiRequest(`/temu/pattern-maps/${id}`, { method: 'DELETE' });
export const apiGetColorAliases = async () => apiRequest('/temu/color-aliases');
export const apiCreateColorAlias = async (a) => apiRequest('/temu/color-aliases', { method: 'POST', data: a });
export const apiDeleteColorAlias = async (id) => apiRequest(`/temu/color-aliases/${id}`, { method: 'DELETE' });

// 启动店小秘上架表格导出任务，返回 taskId（后续通过 SSE 拉取进度与文件）
export const apiExportDxm = async (folderId, templateId, promptId) => {
  const response = await fetch(`${getBaseURL()}/folders/${folderId}/export-dxm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, promptId })
  });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try { const d = await response.json(); msg = d.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  const data = await response.json();
  if (!data.taskId) throw new Error('后端未返回 taskId');
  return data;
};

// 查询活跃的店小秘导出任务（关页重开后可恢复进度 UI，防重复导出）
export const apiGetDxmTasks = async (folderId) => {
  const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
  const response = await fetch(`${getBaseURL()}/dxm/tasks${qs}`, { method: 'GET' });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try { const d = await response.json(); msg = d.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  const data = await response.json();
  return data.tasks || [];
};

// 取消正在进行的店小秘导出任务（中断在途上传、释放通道）
export const apiCancelDxmTask = async (taskId) => {
  const response = await fetch(`${getBaseURL()}/dxm/tasks/${taskId}/cancel`, {
    method: 'POST'
  });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try { const d = await response.json(); msg = d.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return true;
};

// ─── 标题生成 ───
export const apiGenerateTitles = async (referenceTitle, groupNames) => {
  return apiRequest('/publish/generate-titles', {
    method: 'POST',
    data: { referenceTitle, groupNames }
  });
};

// ─── 标题存储 ───
export const apiGetTitles = async (folderId) => {
  return apiRequest(`/folders/${folderId}/titles`);
};

export const apiSaveTitle = async (folderId, groupName, title) => {
  return apiRequest(`/folders/${folderId}/titles`, {
    method: 'PUT',
    data: { groupName, title }
  });
};

export const apiSaveTitlesBatch = async (folderId, titles) => {
  return apiRequest(`/folders/${folderId}/titles/batch`, {
    method: 'PUT',
    data: { titles }
  });
};

// ─── 发布执行 ───
export const apiPublishFolder = async (folderId, templateId, products) => {
  return apiRequest(`/folders/${folderId}/publish`, {
    method: 'POST',
    data: { templateId, products }
  });
};

export const apiRetryPublish = async (folderId, templateId, groupNames) => {
  return apiRequest(`/folders/${folderId}/publish/retry`, {
    method: 'POST',
    data: { templateId, groupNames }
  });
};

export const apiGetPublishResults = async (folderId) => {
  return apiRequest(`/folders/${folderId}/publish/results`);
};

// ─── 店铺管理（多店铺图片管理）───
export const apiGetShops = async () => {
  return apiRequest('/shops');
};

export const apiCreateShop = async (shop) => {
  return apiRequest('/shops', {
    method: 'POST',
    data: shop
  });
};

export const apiUpdateShop = async (id, shop) => {
  return apiRequest(`/shops/${id}`, {
    method: 'PUT',
    data: shop
  });
};

export const apiDeleteShop = async (id) => {
  return apiRequest(`/shops/${id}`, {
    method: 'DELETE'
  });
};

export const apiAssignFolderShop = async (folderId, shopIds) => {
  return apiRequest(`/folders/${folderId}`, {
    method: 'PATCH',
    data: { shopIds }
  });
};