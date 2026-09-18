/**
 * 根据 shopId 生成稳定的颜色类名（用于店铺标签）。
 * 颜色盘尽量分散，降低不同店铺碰撞概率。
 */
export const getShopColor = (shopId) => {
  if (!shopId) return 'bg-gray-100 text-gray-500'

  const colors = [
    'bg-red-100 text-red-700',
    'bg-orange-100 text-orange-700',
    'bg-amber-100 text-amber-800',
    'bg-yellow-100 text-yellow-800',
    'bg-lime-100 text-lime-700',
    'bg-green-100 text-green-700',
    'bg-emerald-100 text-emerald-700',
    'bg-teal-100 text-teal-700',
    'bg-cyan-100 text-cyan-700',
    'bg-sky-100 text-sky-700',
    'bg-blue-100 text-blue-700',
    'bg-indigo-100 text-indigo-700',
    'bg-violet-100 text-violet-700',
    'bg-purple-100 text-purple-700',
    'bg-fuchsia-100 text-fuchsia-700',
    'bg-pink-100 text-pink-700',
    'bg-rose-100 text-rose-700',
  ]

  // djb2-like hash，对 UUID / 短 id 都较均匀
  let hash = 5381
  for (let i = 0; i < String(shopId).length; i++) {
    hash = ((hash << 5) + hash + String(shopId).charCodeAt(i)) | 0
  }
  return colors[Math.abs(hash) % colors.length]
}
