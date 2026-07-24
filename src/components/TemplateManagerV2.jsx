import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Grid3X3, List, Image as ImageIcon, Copy, Download, Upload, CheckSquare, Square } from 'lucide-react';
import { apiRequest, apiUpload, getImageUrl, getBackendURL } from '../api/axios';

function TemplateManagerV2() {
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [showSelectAll, setShowSelectAll] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const toggleSelect = (id) => {
    setSelectedTemplates(prev => 
      prev.includes(id) 
        ? prev.filter(t => t !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTemplates.length === filteredTemplates.length) {
      setSelectedTemplates([]);
    } else {
      setSelectedTemplates(filteredTemplates.map(t => t.id));
    }
  };

  const handleExport = () => {
    if (selectedTemplates.length === 0) {
      alert('请先选择要导出的模板');
      return;
    }
    const url = `${getBackendURL()}/api/templates-v2/export?ids=${selectedTemplates.join(',')}`;
    window.open(url, '_blank');
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${getBackendURL()}/api/templates-v2/import`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (response.ok) {
        let msg = `导入完成！成功导入 ${result.imported} 个模板`;
        if (result.skipped > 0) {
          msg += `，跳过 ${result.skipped} 个同名模板`;
        }
        if (result.errors && result.errors.length > 0) {
          msg += `，${result.errors.length} 个导入失败`;
        }
        alert(msg);
        loadTemplates();
      } else {
        alert('导入失败：' + result.error);
      }
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请重试');
    }
    
    e.target.value = '';
  };

  const loadTemplates = async () => {
    try {
      const data = await apiRequest('/templates-v2');
      setTemplates(data);
    } catch (error) {
      console.error('加载模板失败:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await apiRequest(`/templates-v2/${id}`, { method: 'DELETE' });
      loadTemplates();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  const handleDuplicate = async (template) => {
    try {
      const original = await apiRequest(`/templates-v2/${template.id}`);

      const { id, createdAt, version, ...templateData } = original;
      const duplicateData = {
        ...templateData,
        name: `${original.name || '未命名'} (副本)`,
        colors: original.colors.map(color => ({
          ...color,
          detailImages: color.detailImages.map(detail => ({
            ...detail,
            printAreas: detail.printAreas || []
          }))
        }))
      };

      const formData = new FormData();
      formData.append('data', JSON.stringify(duplicateData));

      await apiUpload('/templates-v2', formData);
      loadTemplates();
      alert('模板副本创建成功');
    } catch (error) {
      console.error('复制模板失败:', error);
      alert('复制失败，请重试');
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryLabel = (cat) => {
    const labels = {
      tshirt: 'T恤', hoodie: '卫衣', phonecase: '手机壳',
      mug: '马克杯', blanket: '毛毯', other: '其他'
    };
    return labels[cat] || cat || '未分类';
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">模板管理</h2>
          <p className="text-gray-500 mt-1">新版设计器 - 更灵活的 SKU 和区域管理</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>导入模板</span>
          </button>
          <button
            onClick={handleExport}
            disabled={selectedTemplates.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>导出模板 ({selectedTemplates.length})</span>
          </button>
          <button
            onClick={() => window.location.hash = '#designer'}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>新建模板</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索模板..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow' : ''}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".dnet,.zip"
        className="hidden"
        onChange={handleImport}
      />

      {filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 text-center py-12">
          <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无模板</p>
          <button
            onClick={() => window.location.hash = '#designer'}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            创建第一个模板
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${selectedTemplates.includes(template.id) ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
              onClick={() => window.location.hash = `#designer?id=${template.id}`}
            >
              <div className="aspect-video bg-gray-100 relative">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(template.id); }}
                  className="absolute top-2 left-2 p-1.5 bg-white/90 rounded-lg hover:bg-white z-10"
                >
                  {selectedTemplates.includes(template.id) ? (
                    <CheckSquare className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                {template.colors?.[0]?.imagePath ? (
                  <img
                    src={getImageUrl(template.colors[0].imagePath)}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex space-x-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); window.location.hash = `#designer?id=${template.id}`; }}
                    className="p-1.5 bg-white/90 rounded-lg hover:bg-white"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}
                    className="p-1.5 bg-white/90 rounded-lg hover:bg-white"
                    title="复制为副本"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-500" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                    className="p-1.5 bg-white/90 rounded-lg hover:bg-white"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-medium text-gray-900 truncate">{template.name || '未命名'}</h3>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">{getCategoryLabel(template.category)}</span>
                  <span className="text-xs text-gray-500">
                    {template.colors?.length || 0} SKU
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                  <button onClick={toggleSelectAll} className="hover:bg-gray-100 rounded p-1">
                    {selectedTemplates.length === filteredTemplates.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">分类</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU 数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">印花区域</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTemplates.map(template => (
                <tr
                  key={template.id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedTemplates.includes(template.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => window.location.hash = `#designer?id=${template.id}`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(template.id); }}
                      className="hover:bg-gray-100 rounded p-1"
                    >
                      {selectedTemplates.includes(template.id) ? (
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        {template.colors?.[0]?.imagePath ? (
                          <img
                            src={getImageUrl(template.colors[0].imagePath)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-400 m-2" />
                        )}
                      </div>
                      <span className="font-medium text-gray-900">{template.name || '未命名'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getCategoryLabel(template.category)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{template.colors?.length || 0}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{template.printAreas?.length || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); window.location.hash = `#designer?id=${template.id}`; }}
                        className="p-1.5 hover:bg-gray-100 rounded"
                      >
                        <Edit2 className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}
                        className="p-1.5 hover:bg-blue-50 rounded"
                        title="复制为副本"
                      >
                        <Copy className="w-4 h-4 text-blue-500" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                        className="p-1.5 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TemplateManagerV2;