import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Edit2, Trash2, Search, Grid3X3, List, Image as ImageIcon,
  Copy, Download, Upload, CheckSquare, Square, GripVertical, Tag, X,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { apiRequest, apiUpload, getImageUrl, getBackendURL } from '../api/axios';

function SortableTemplateCard({ template, isSelected, onToggleSelect, onEdit, onDuplicate, onDelete, dragDisabled, products, onAssignProduct }) {
  const [showProductMenu, setShowProductMenu] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: template.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto'
  };

  const productName = (() => {
    if (!template.productId) return '未分类';
    const p = products?.find(p => p.id === template.productId);
    if (!p) return '商品已删除';
    if (template.tagId) {
      const tag = p.tags?.find(t => t.id === template.tagId);
      if (tag) return `${p.name} / ${tag.name}`;
    }
    return p.name;
  })();

  const getProductColor = () => {
    if (!template.productId) return 'bg-gray-100 text-gray-600';
    const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700', 'bg-amber-100 text-amber-700'];
    const index = products?.findIndex(p => p.id === template.productId);
    return colors[index % colors.length] || 'bg-blue-100 text-blue-700';
  };

  const handleAssign = (productId, tagId) => {
    onAssignProduct(template.id, productId, tagId);
    setShowProductMenu(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer relative ${
        template.hasSizeIssue
          ? 'border-red-400 ring-1 ring-red-200'
          : isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
      } ${isDragging ? 'opacity-50 scale-105 shadow-xl' : ''}`}
      onClick={() => window.location.hash = `#designer?id=${template.id}`}
    >
      <div className="aspect-[3/4] bg-gray-50 relative">
        {!dragDisabled && (
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 p-1.5 bg-gray-900/70 rounded-lg hover:bg-gray-900/90 z-20 cursor-grab active:cursor-grabbing touch-none"
            title="拖动排序"
          >
            <GripVertical className="w-4 h-4 text-white pointer-events-none" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(template.id); }}
          className={`absolute top-2 ${dragDisabled ? 'left-2' : 'left-10'} p-1.5 bg-gray-900/70 rounded-lg hover:bg-gray-900/90 z-10`}
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-blue-300" />
          ) : (
            <Square className="w-4 h-4 text-white" />
          )}
        </button>
        {template.colors?.[0]?.imagePath ? (
          <img
            src={getImageUrl(template.colors[0].imagePath)}
            alt={template.name}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex space-x-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(template.id); }}
            className="p-1.5 bg-gray-900/70 rounded-lg hover:bg-gray-900/90"
          >
            <Edit2 className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(template); }}
            className="p-1.5 bg-gray-900/70 rounded-lg hover:bg-gray-900/90"
            title="复制为副本"
          >
            <Copy className="w-3.5 h-3.5 text-blue-300" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(template.id); }}
            className="p-1.5 bg-gray-900/70 rounded-lg hover:bg-gray-900/90"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-300" />
          </button>
        </div>
      </div>
      <div className="p-3 relative">
        <h3 className="font-medium text-gray-900 truncate">{template.name || '未命名'}</h3>
        <div className="flex items-center justify-between mt-1">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowProductMenu(!showProductMenu);
              }}
              className={`inline-flex items-center space-x-1 px-2 py-0.5 text-xs rounded ${getProductColor()} hover:opacity-80 transition ${showProductMenu ? 'ring-2 ring-blue-300' : ''}`}
              title="点击分配到商品"
            >
              <Tag className="w-3 h-3" />
              <span>{productName}</span>
            </button>
            {showProductMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setShowProductMenu(false); }} />
                <div className="absolute bottom-full left-0 mb-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <div className="px-2 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">分配到商品</div>
                  <button
                    onClick={() => handleAssign(null, null)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${!template.productId ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
                  >
                    未分类
                  </button>
                  {products?.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400 text-center">暂无商品，请先创建</div>
                  )}
                  {products?.map(p => (
                    <div key={p.id}>
                      <button
                        onClick={() => handleAssign(p.id, null)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 flex items-center justify-between ${template.productId === p.id && !template.tagId ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600'}`}
                      >
                        <span>{p.name}</span>
                        {template.productId === p.id && !template.tagId && <span className="text-blue-500">✓</span>}
                      </button>
                      {p.tags?.length > 0 && p.tags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => handleAssign(p.id, tag.id)}
                          className={`w-full text-left pl-6 pr-3 py-1 text-xs hover:bg-gray-100 flex items-center justify-between ${template.productId === p.id && template.tagId === tag.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-500'}`}
                        >
                          <span className="truncate">{tag.name}</span>
                          {template.productId === p.id && template.tagId === tag.id && <span className="text-blue-500">✓</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {template.colors?.length || 0} SKU
          </span>
        </div>
        {template.hasSizeIssue && (
          <p className="mt-1 text-xs text-red-500 leading-snug break-words">
            {template.sizeIssueMsg || '部分底板/细节图尺寸不正确'}
          </p>
        )}
      </div>
    </div>
  );
}

const getCategoryLabel = (cat) => {
  const labels = {
    tshirt: 'T恤', hoodie: '卫衣', phonecase: '手机壳',
    mug: '马克杯', blanket: '毛毯', other: '其他'
  };
  return labels[cat] || cat || '未分类';
};

function TemplateManagerV2() {
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('all');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [newProductName, setNewProductName] = useState('');
  const [selectedTagId, setSelectedTagId] = useState(null);
  const [expandedProductIds, setExpandedProductIds] = useState(new Set());
  const [managingTagsForProduct, setManagingTagsForProduct] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [editingTag, setEditingTag] = useState(null);
  const [addingTagInFilter, setAddingTagInFilter] = useState(false);
  const fileInputRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    loadTemplates();
    apiRequest('/products')
      .then(data => setProducts(data))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    setAddingTagInFilter(false);
    setNewTagName('');
  }, [selectedProductId]);

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

  const handleExport = async () => {
    if (selectedTemplates.length === 0) {
      alert('请先选择要导出的模板');
      return;
    }
    const url = `${getBackendURL()}/api/templates-v2/export?ids=${selectedTemplates.join(',')}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        let errMsg = '导出失败';
        try {
          const result = await response.json();
          errMsg = result.error || errMsg;
        } catch (e) { /* 非JSON响应 */ }
        alert(errMsg);
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const filename = match ? decodeURIComponent(match[1]) : 'templates.dnet';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
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
        if (result.warnings && result.warnings.length > 0) {
          msg += `\n\n⚠️ 警告：\n${result.warnings.join('\n')}`;
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

  const handleBatchDelete = async () => {
    if (selectedTemplates.length === 0) {
      alert('请先选择要删除的模板');
      return;
    }
    if (!confirm(`确定要删除选中的 ${selectedTemplates.length} 个模板吗？此操作不可恢复`)) return;
    try {
      const response = await apiRequest('/templates-v2/batch', {
        method: 'DELETE',
        data: { ids: selectedTemplates }
      });
      setSelectedTemplates([]);
      loadTemplates();
      const result = response || {};
      let msg = `已删除 ${result.deleted ?? selectedTemplates.length} 个模板`;
      if (result.skipped > 0) msg += `，${result.skipped} 个不存在`;
      alert(msg);
    } catch (error) {
      console.error('批量删除失败:', error);
      alert('批量删除失败');
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

  const handleReorder = async (orderedIds) => {
    try {
      await apiRequest('/templates-v2/reorder', {
        method: 'PUT',
        data: { orderedIds }
      });
    } catch (error) {
      console.error('保存排序失败:', error);
      alert('保存排序失败，请刷新页面重试');
      loadTemplates();
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = templates.findIndex(t => t.id === active.id);
    const newIndex = templates.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newTemplates = arrayMove(templates, oldIndex, newIndex);
    setTemplates(newTemplates);
    handleReorder(newTemplates.map(t => t.id));
  };

  const filteredTemplates = templates.filter(t => {
    if (selectedProductId === 'uncategorized') {
      if (t.productId) return false;
    } else if (selectedProductId !== 'all') {
      if (t.productId !== selectedProductId) return false;
    }
    if (selectedTagId === 'none') {
      if (t.tagId) return false;
    } else if (selectedTagId) {
      if (t.tagId !== selectedTagId) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const productName = products.find(p => p.id === t.productId)?.name?.toLowerCase() || '';
      return t.name?.toLowerCase().includes(term) ||
             t.category?.toLowerCase().includes(term) ||
             productName.includes(term);
    }
    return true;
  });

  const getProductName = (productId) => {
    if (!productId) return '未分类';
    const p = products.find(p => p.id === productId);
    return p ? p.name : '未分类';
  };

  const getTagName = (productId, tagId) => {
    if (!tagId) return '';
    const product = products.find(p => p.id === productId);
    const tag = product?.tags?.find(t => t.id === tagId);
    return tag ? tag.name : '';
  };

  const getProductBadgeColor = (productId) => {
    if (!productId) return 'bg-gray-400 text-white';
    const colors = ['bg-blue-500 text-white', 'bg-green-500 text-white', 'bg-purple-500 text-white', 'bg-orange-500 text-white', 'bg-pink-500 text-white', 'bg-indigo-500 text-white', 'bg-teal-500 text-white', 'bg-amber-500 text-white'];
    const index = products.findIndex(p => p.id === productId);
    return colors[index % colors.length] || 'bg-blue-500 text-white';
  };

  const loadProducts = async () => {
    try {
      const data = await apiRequest('/products');
      setProducts(data);
    } catch (error) {
      console.error('加载商品失败:', error);
    }
  };

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) return;
    try {
      await apiRequest('/products', {
        method: 'POST',
        data: { name: newProductName.trim() }
      });
      setNewProductName('');
      loadProducts();
    } catch (error) {
      alert(error.error || '创建失败');
    }
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !newProductName.trim()) return;
    try {
      await apiRequest(`/products/${editingProduct.id}`, {
        method: 'PUT',
        data: { name: newProductName.trim() }
      });
      setEditingProduct(null);
      setNewProductName('');
      setShowProductModal(false);
      loadProducts();
    } catch (error) {
      alert(error.error || '更新失败');
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!confirm(`确定删除商品「${product.name}」？下属模板将变为未分类。`)) return;
    try {
      await apiRequest(`/products/${product.id}`, { method: 'DELETE' });
      if (selectedProductId === product.id) {
        setSelectedProductId('all');
      }
      loadProducts();
      loadTemplates();
    } catch (error) {
      alert(error.error || '删除失败');
    }
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setNewProductName('');
    setShowProductModal(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setNewProductName(product.name);
    setShowProductModal(true);
  };

  const handleAssignProduct = async (templateId, productId, tagId) => {
    try {
      const updated = await apiRequest(`/templates-v2/${templateId}/product`, {
        method: 'PATCH',
        data: { productId, tagId }
      });
      setTemplates(prev => prev.map(t =>
        t.id === templateId ? { ...t, productId: updated.productId, tagId: updated.tagId } : t
      ));
      await loadProducts();
    } catch (error) {
      alert(error.error || '分配失败');
    }
  };

  const handleCreateTag = async (productId) => {
    if (!newTagName.trim()) return;
    try {
      await apiRequest(`/products/${productId}/tags`, {
        method: 'POST',
        data: { name: newTagName.trim() }
      });
      setNewTagName('');
      loadProducts();
    } catch (error) {
      alert(error.error || '创建失败');
    }
  };

  const handleUpdateTag = async (productId, tagId) => {
    if (!editingTag || !newTagName.trim()) return;
    try {
      await apiRequest(`/products/${productId}/tags/${tagId}`, {
        method: 'PUT',
        data: { name: newTagName.trim() }
      });
      setEditingTag(null);
      setNewTagName('');
      loadProducts();
    } catch (error) {
      alert(error.error || '更新失败');
    }
  };

  const handleDeleteTag = async (productId, tag) => {
    if (!confirm(`确定删除标签「${tag.name}」？关联模板将变为无标签。`)) return;
    try {
      await apiRequest(`/products/${productId}/tags/${tag.id}`, { method: 'DELETE' });
      if (selectedTagId === tag.id) setSelectedTagId(null);
      loadProducts();
      loadTemplates();
    } catch (error) {
      alert(error.error || '删除失败');
    }
  };

  const dragEnabled = viewMode === 'grid' && !searchTerm;

  return (
    <div className="flex gap-6">
      {/* 左侧商品分类侧栏：利用左侧空白区，白色底色 */}
      <aside className="w-56 flex-shrink-0 flex flex-col h-[calc(100vh-120px)] bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">商品分类</h3>
          <button onClick={openAddProduct} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="添加商品">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {/* 全部模板 */}
          <div
            onClick={() => setSelectedProductId('all')}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition ${selectedProductId === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            <span>全部模板</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${selectedProductId === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{templates.length}</span>
          </div>
          {/* 未分类 */}
          <div
            onClick={() => setSelectedProductId('uncategorized')}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition ${selectedProductId === 'uncategorized' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            <span>未分类</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${selectedProductId === 'uncategorized' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
              {templates.filter(t => !t.productId).length}
            </span>
          </div>
          
          {/* 分隔线 */}
          {products.length > 0 && (
            <div className="px-3 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">我的商品</div>
          )}
          
          {/* 商品列表 */}
          {products.map(product => {
            const isSelected = selectedProductId === product.id && !selectedTagId;
            return (
              <div key={product.id}>
                <div
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setSelectedTagId(null);
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <span className="truncate">{product.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {product.templateCount || 0}
                  </span>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="p-3 space-y-1.5">
          <button onClick={openAddProduct} className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition">
            <Plus className="w-3.5 h-3.5" />
            <span>添加商品</span>
          </button>
          <button onClick={() => setShowProductModal(true)} className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition">
            <Edit2 className="w-3.5 h-3.5" />
            <span>管理商品</span>
          </button>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <div className="flex-1 min-w-0 space-y-6">
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
          {filteredTemplates.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center space-x-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {selectedTemplates.length === filteredTemplates.length ? (
                <>
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                  <span className="text-blue-600">取消全选</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">全选</span>
                </>
              )}
            </button>
          )}
          {selectedTemplates.length > 0 && (
            <button
              onClick={handleBatchDelete}
              className="flex items-center space-x-1.5 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>批量删除 ({selectedTemplates.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 标签筛选栏：选中商品时显示 */}
      {selectedProductId !== 'all' && selectedProductId !== 'uncategorized' && (() => {
        const currentProduct = products.find(p => p.id === selectedProductId);
        if (!currentProduct) return null;
        const tags = currentProduct.tags || [];
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 h-7 shrink-0">
                <Tag className="w-4 h-4 text-gray-400" />
                {currentProduct.name}
              </span>
              <span className="text-gray-300 h-5">·</span>
              <button
                onClick={() => setSelectedTagId(null)}
                className={`h-7 px-3 inline-flex items-center text-sm rounded-full transition ${
                  selectedTagId === null
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                全部 ({currentProduct.templateCount || 0})
              </button>
              {tags.length > 0 && (
                <button
                  onClick={() => setSelectedTagId('none')}
                  className={`h-7 px-3 inline-flex items-center text-sm rounded-full transition ${
                    selectedTagId === 'none'
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  无标签
                </button>
              )}
              {tags.map(tag => (
                <div
                  key={tag.id}
                  className={`h-7 inline-flex items-center gap-1 pl-3 pr-1 rounded-full transition ${
                    selectedTagId === tag.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <button
                    onClick={() => setSelectedTagId(tag.id)}
                    className="inline-flex items-center gap-1 text-sm"
                  >
                    {tag.name}
                    <span className={`text-xs ${selectedTagId === tag.id ? 'opacity-70' : 'text-gray-400'}`}>
                      {tag.templateCount || 0}
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteTag(currentProduct.id, tag)}
                    className={`w-5 h-5 flex items-center justify-center rounded-full transition ${
                      selectedTagId === tag.id
                        ? 'text-white/70 hover:bg-white/20 hover:text-white'
                        : 'text-gray-400 hover:bg-red-500 hover:text-white'
                    }`}
                    title="删除标签"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {/* 添加标签输入 */}
              {addingTagInFilter ? (
                <div className="flex items-center gap-1 h-7">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateTag(currentProduct.id);
                        setAddingTagInFilter(false);
                      }
                      if (e.key === 'Escape') {
                        setAddingTagInFilter(false);
                        setNewTagName('');
                      }
                    }}
                    className="h-7 w-24 px-3 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="标签名"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      handleCreateTag(currentProduct.id);
                      setAddingTagInFilter(false);
                    }}
                    className="text-sm text-blue-500 hover:text-blue-600 px-1"
                  >
                    确定
                  </button>
                  <button
                    onClick={() => { setAddingTagInFilter(false); setNewTagName(''); }}
                    className="text-sm text-gray-400 hover:text-gray-600 px-1"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAddingTagInFilter(true);
                    setNewTagName('');
                  }}
                  className="h-7 px-3 text-sm text-blue-500 hover:text-blue-600 inline-flex items-center gap-1 rounded-full hover:bg-blue-50 transition"
                >
                  <Plus className="w-4 h-4" />
                  添加标签
                </button>
              )}
            </div>
          </div>
        );
      })()}

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTemplates.map(t => t.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTemplates.map(template => (
                <SortableTemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplates.includes(template.id)}
                  onToggleSelect={toggleSelect}
                  onEdit={(id) => { window.location.hash = `#designer?id=${id}`; }}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  dragDisabled={!dragEnabled}
                  products={products}
                  onAssignProduct={handleAssignProduct}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品</th>
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
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded ${getProductBadgeColor(template.productId)}`}>
                      {getProductName(template.productId)}
                      {template.tagId && (
                        <span className="ml-1 opacity-75">/ {getTagName(template.productId, template.tagId)}</span>
                      )}
                    </span>
                  </td>
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

      {/* 商品管理弹窗 */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowProductModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">
                {editingProduct ? '编辑商品' : '添加商品'}
              </h3>
            </div>
            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">商品名称</label>
              <input
                type="text"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    editingProduct ? handleUpdateProduct() : handleCreateProduct();
                  }
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如:短袖、卫衣、马克杯..."
                autoFocus
              />
              
              {/* 已有商品列表 */}
              {products.length > 0 && !editingProduct && (
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">已有商品</div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {products.map(product => (
                      <div key={product.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* 商品名 + 操作 */}
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                          <span className="text-gray-700 font-medium text-sm">{product.name}</span>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => openEditProduct(product)}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="编辑"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product)}
                              className="p-1 hover:bg-red-100 rounded"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </div>
                        {/* 标签管理 */}
                        <div className="px-3 py-2 space-y-1">
                          {product.tags?.length > 0 ? (
                            product.tags.map(tag => (
                              <div key={tag.id} className="flex items-center justify-between text-xs">
                                {editingTag && editingTag.productId === product.id && editingTag.tagId === tag.id ? (
                                  <>
                                    <input
                                      type="text"
                                      value={newTagName}
                                      onChange={(e) => setNewTagName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateTag(product.id, tag.id);
                                        if (e.key === 'Escape') { setEditingTag(null); setNewTagName(''); }
                                      }}
                                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleUpdateTag(product.id, tag.id)}
                                      className="ml-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                    >
                                      保存
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-gray-600">{tag.name}</span>
                                    <div className="flex items-center space-x-1">
                                      <button
                                        onClick={() => {
                                          setEditingTag({ productId: product.id, tagId: tag.id });
                                          setNewTagName(tag.name);
                                          setManagingTagsForProduct(null);
                                        }}
                                        className="p-1 hover:bg-gray-200 rounded"
                                        title="编辑标签"
                                      >
                                        <Edit2 className="w-3 h-3 text-gray-500" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteTag(product.id, tag)}
                                        className="p-1 hover:bg-red-100 rounded"
                                        title="删除标签"
                                      >
                                        <Trash2 className="w-3 h-3 text-red-500" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-gray-400">暂无标签</div>
                          )}
                          {/* 添加标签 */}
                          {managingTagsForProduct === product.id ? (
                            <div className="flex items-center space-x-1 mt-1">
                              <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCreateTag(product.id);
                                  if (e.key === 'Escape') { setManagingTagsForProduct(null); setNewTagName(''); }
                                }}
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="标签名称"
                                autoFocus
                              />
                              <button
                                onClick={() => handleCreateTag(product.id)}
                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                              >
                                添加
                              </button>
                              <button
                                onClick={() => { setManagingTagsForProduct(null); setNewTagName(''); }}
                                className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setManagingTagsForProduct(product.id);
                                setEditingTag(null);
                                setNewTagName('');
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              + 添加标签
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowProductModal(false);
                  setEditingProduct(null);
                  setNewProductName('');
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={editingProduct ? handleUpdateProduct : handleCreateProduct}
                disabled={!newProductName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingProduct ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateManagerV2;
