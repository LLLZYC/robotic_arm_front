/**
 * 地图工具函数
 * 用于处理ROS地图的坐标转换和PGM文件处理
 */

/**
 * 解析YAML配置文件
 * @param {string} yamlText - YAML文本内容
 * @returns {Object} 配置对象
 */
export function parseYaml(yamlText) {
  const config = {}
  const lines = yamlText.split('\n')
  
  lines.forEach(line => {
    const match = line.match(/^(\w+):\s*(.+)$/)
    if (match) {
      const key = match[1]
      let value = match[2].trim()
      
      // 处理数字和数组
      if (!isNaN(value)) {
        value = parseFloat(value)
      } else if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => parseFloat(v.trim()))
      }
      
      config[key] = value
    }
  })
  
  return config
}

/**
 * 计算地图边界
 * @param {Object} config - 地图配置
 * @param {number} mapWidthPixels - 地图宽度（像素）
 * @param {number} mapHeightPixels - 地图高度（像素）
 * @returns {Array} 地图边界 [[minLat, minLng], [maxLat, maxLng]]
 */
export function calculateMapBounds(config, mapWidthPixels = 480, mapHeightPixels = 640) {
  if (!config || !config.origin || !config.resolution) {
    return [[-10, -10], [10, 10]] // 默认边界
  }
  
  // 确保origin是有效格式
  let originX, originY
  
  if (Array.isArray(config.origin)) {
    originX = config.origin[0] || 0
    originY = config.origin[1] || 0
  } else if (typeof config.origin === 'object' && config.origin !== null) {
    originX = config.origin.x || 0
    originY = config.origin.y || 0
  } else {
    console.warn('地图origin格式无效，使用默认边界', config.origin)
    return [[-10, -10], [10, 10]]
  }
  
  const resolution = config.resolution
  
  // 检查是否为有效数字
  if (isNaN(originX) || isNaN(originY) || isNaN(resolution)) {
    console.warn('地图配置包含无效数值，使用默认边界', { originX, originY, resolution })
    return [[-10, -10], [10, 10]]
  }
  
  // 计算地图实际尺寸（米）
  const mapWidthMeters = mapWidthPixels * resolution
  const mapHeightMeters = mapHeightPixels * resolution
  
  // ROS坐标系：原点在左下角，X向右，Y向上
  const minX = originX
  const minY = originY
  const maxX = minX + mapWidthMeters
  const maxY = minY + mapHeightMeters
  
  // 检查计算结果
  if (isNaN(minX) || isNaN(minY) || isNaN(maxX) || isNaN(maxY)) {
    console.warn('地图边界计算无效，使用默认边界', { minX, minY, maxX, maxY })
    return [[-10, -10], [10, 10]]
  }
  
  // 直接使用ROS坐标作为Leaflet坐标
  // Leaflet使用[lat, lng]格式，对应ROS的[Y, X]
  return [[minY, minX], [maxY, maxX]]
}

/**
 * ROS坐标转Leaflet坐标
 * @param {number} x - ROS X坐标
 * @param {number} y - ROS Y坐标
 * @param {Object} mapConfig - 地图配置
 * @returns {Array} Leaflet坐标 [lat, lng]
 */
export function rosToLeaflet(x, y) {
  try {
    // 检查输入参数的有效性
    if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
      console.warn('ROS坐标转换错误: 无效的坐标值', { x, y })
      return [0, 0] // 返回默认坐标
    }
    
    // 使用简单的缩放转换，保持与原来的一致性
    const scale = 0.001  // 缩放因子，与原来保持一致
    
    const lat = y * scale      // ROS Y -> Leaflet lat
    const lng = x * scale      // ROS X -> Leaflet lng
    
    console.log('ROS坐标转换:', {
      ros: { x, y },
      leaflet: { lat, lng }
    })
    
    // 检查结果是否为有效数字
    if (isNaN(lat) || isNaN(lng)) {
      console.warn('ROS坐标转换结果无效:', { lat, lng, x, y })
      return [0, 0]
    }
    
    // 放宽坐标范围检查，允许更大的范围
    if (Math.abs(lat) > 1000 || Math.abs(lng) > 1000) {
      console.warn('ROS坐标转换结果超出合理范围:', { lat, lng })
      return [0, 0]
    }
    
    return [lat, lng]
  } catch (error) {
    console.error('ROS坐标转换异常:', error)
    return [0, 0] // 返回安全默认值
  }
}

/**
 * Leaflet坐标转ROS坐标
 * @param {number} lat - Leaflet纬度
 * @param {number} lng - Leaflet经度
 * @param {Object} mapConfig - 地图配置
 * @returns {Object} ROS坐标 {x, y}
 */
export function leafletToRos(lat, lng) {
  try {
    // 检查输入参数的有效性
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
      console.warn('Leaflet坐标转换错误: 无效的坐标值', { lat, lng })
      return { x: 0, y: 0 } // 返回默认坐标
    }
    
    // 使用与rosToLeaflet相同的缩放因子进行逆转换
    const scale = 0.001  // 缩放因子，与rosToLeaflet保持一致
    
    const x = lng / scale  // Leaflet lng -> ROS X
    const y = lat / scale  // Leaflet lat -> ROS Y
    
    console.log('Leaflet坐标转换:', {
      leaflet: { lat, lng },
      ros: { x, y }
    })
    
    // 检查结果是否为有效数字
    if (isNaN(x) || isNaN(y)) {
      console.warn('Leaflet坐标转换结果无效:', { x, y, lat, lng })
      return { x: 0, y: 0 }
    }
    
    // 放宽坐标范围检查
    if (Math.abs(x) > 1000 || Math.abs(y) > 1000) {
      console.warn('Leaflet坐标转换结果超出合理范围:', { x, y })
      return { x: 0, y: 0 }
    }
    
    return { x, y }
  } catch (error) {
    console.error('Leaflet坐标转换异常:', error)
    return { x: 0, y: 0 } // 返回安全默认值
  }
}

/**
 * 创建占位符地图图像
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {Object} config - 地图配置
 * @returns {string} Data URL格式的图像
 */
export function createPlaceholderMap(width = 400, height = 400) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  
  // 绘制深色背景
  ctx.fillStyle = '#1a202c'
  ctx.fillRect(0, 0, width, height)
  
  // 绘制网格线
  ctx.strokeStyle = '#2d3748'
  ctx.lineWidth = 1
  
  // 水平线
  for (let y = 0; y <= height; y += 20) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  
  // 垂直线
  for (let x = 0; x <= width; x += 20) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  
  // 添加地图信息
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 16px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('ROS Navigation Map', width / 2, height / 2 - 30)
  
  ctx.font = '14px Arial'
  ctx.fillText('使用OpenStreetMap作为基础地图', width / 2, height / 2)
  
  ctx.fillText('分辨率: 0.05 m/px', width / 2, height / 2 + 20)
  ctx.fillText('原点: [-5.0, -15.2]', width / 2, height / 2 + 40)
  
  // 添加ROS机器人图标
  ctx.font = '24px Arial'
  ctx.fillText('🤖', width / 2, height / 2 + 80)
  
  return canvas.toDataURL()
}

/**
 * 检查PGM文件是否可用
 * @param {string} pgmUrl - PGM文件URL
 * @returns {Promise<boolean>} 是否可用
 */
export async function checkPgmAvailable(pgmUrl) {
  try {
    const response = await fetch(pgmUrl, { method: 'HEAD' })
    return response.ok
  } catch (error) {
    return false
  }
}

/**
 * 获取推荐的初始视图
 * @param {Object} mapConfig - 地图配置
 * @returns {Object} 初始视图配置 {center: [lat, lng], zoom: number}
 */
export function getInitialView() {
  // 使用默认视图配置
  return getDefaultView()
}

/**
 * 获取默认视图配置
 * @returns {Object} 默认视图配置
 */
function getDefaultView() {
  return {
    center: [0, 0],
    zoom: 2
  }
}