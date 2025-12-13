/**
 * 地图服务
 * 用于处理PGM地图文件的加载和转换
 */

class MapService {
  constructor() {
    this.baseUrl = '/maps'
    this.convertedMaps = new Map() // 缓存已转换的地图
    this.mapMetadata = new Map() // 缓存地图元数据（宽、高等）
  }

  getMapMetadata(pgmUrl) {
    if (!pgmUrl) {
      return null
    }
    return this.mapMetadata.get(pgmUrl) || null
  }

  /**
   * 加载地图配置
   * @param {string} configPath - 地图配置文件路径
   * @returns {Promise<Object>} 地图配置对象
   */
  async loadMapConfig(configPath = '/maps/map.yaml') {
    try {
      console.log('尝试加载地图配置:', configPath)
      const response = await fetch(configPath)
      if (!response.ok) {
        console.warn(`地图配置文件不存在: ${configPath}, 使用默认配置`)
        return this.getDefaultConfig()
      }
      
      const yamlText = await response.text()
      const config = this.parseYamlConfig(yamlText)
      
      // 验证配置完整性
      if (!this.validateMapConfig(config)) {
        console.warn('地图配置验证失败，使用默认配置')
        return this.getDefaultConfig()
      }
      
      console.log('地图配置加载成功:', config)
      return config
    } catch (error) {
      console.error('加载地图配置失败:', error)
      return this.getDefaultConfig()
    }
  }

  /**
   * 验证地图配置
   * @param {Object} config - 地图配置
   * @returns {boolean} 配置是否有效
   */
  validateMapConfig(config) {
    if (!config) return false
    
    // 检查必要字段
    if (!config.image) {
      console.warn('地图配置缺少image字段')
      return false
    }
    
    if (!config.resolution || isNaN(config.resolution)) {
      console.warn('地图配置缺少有效的resolution字段')
      return false
    }
    
    if (!config.origin) {
      console.warn('地图配置缺少origin字段')
      return false
    }
    
    return true
  }

  /**
   * 解析YAML配置
   * @param {string} yamlText - YAML文本
   * @returns {Object} 配置对象
   */
  parseYamlConfig(yamlText) {
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
   * 获取默认配置
   * @returns {Object} 默认配置
   */
  getDefaultConfig() {
    return {
      image: '/maps/DLROBOT.pgm',
      resolution: 0.05,
      origin: [-5.0, -15.2, 0],
      negate: 0,
      occupied_thresh: 0.65,
      free_thresh: 0.196
    }
  }

  /**
   * 转换PGM为PNG格式（浏览器可显示）
   * @param {string} pgmUrl - PGM文件URL
   * @returns {Promise<string>} Data URL格式的PNG图像
   */
  async convertPgmToPng(pgmUrl) {
    // 检查缓存
    if (this.convertedMaps.has(pgmUrl)) {
      return this.convertedMaps.get(pgmUrl)
    }

    try {
      console.log('开始转换PGM文件:', pgmUrl)
      
      // 首先检查文件是否存在
      const headResponse = await fetch(pgmUrl, { method: 'HEAD' })
      if (!headResponse.ok) {
        console.warn(`PGM文件不存在: ${pgmUrl}, 使用占位符地图`)
        return this.createPlaceholderMap()
      }

      const response = await fetch(pgmUrl)
      if (!response.ok) {
        throw new Error(`加载PGM文件失败: ${response.status} ${response.statusText}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const pgmData = new Uint8Array(arrayBuffer)
      
      console.log('PGM文件大小:', pgmData.length, 'bytes')
      
      // 检查文件头
      console.log('PGM文件头:', Array.from(pgmData.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '))
      
      // 解析PGM文件头
      const header = this.parsePgmHeader(pgmData)
      if (!header) {
        console.error('PGM文件头解析失败，文件头数据:', Array.from(pgmData.slice(0, 100)).map(b => String.fromCharCode(b)).join(''))
        throw new Error('无效的PGM文件格式')
      }
      
      console.log('PGM文件头解析成功:', header)
      
      // 验证图像尺寸合理性
      if (header.width <= 0 || header.height <= 0 || header.width > 10000 || header.height > 10000) {
        console.warn('PGM图像尺寸不合理，使用占位符地图:', { width: header.width, height: header.height })
        return this.createPlaceholderMap()
      }
      
      // 创建Canvas进行转换
      const canvas = document.createElement('canvas')
      canvas.width = header.width
      canvas.height = header.height
      const ctx = canvas.getContext('2d')
      
      // 创建图像数据
      const imageData = ctx.createImageData(header.width, header.height)

      // 缓存元数据供后续坐标转换使用
      this.mapMetadata.set(pgmUrl, {
        widthPixels: header.width,
        heightPixels: header.height
      })

      // 转换PGM数据为RGBA
      const dataOffset = header.dataOffset
      console.log('数据偏移量:', dataOffset, '期望数据大小:', header.width * header.height)

      for (let y = 0; y < header.height; y++) {
        for (let x = 0; x < header.width; x++) {
          const pgmIndex = dataOffset + y * header.width + x
          const rgbaIndex = (y * header.width + x) * 4
          
          if (pgmIndex < pgmData.length) {
            const grayValue = pgmData[pgmIndex]
            
            // 根据阈值设置颜色
            if (grayValue < 50) {
              // 障碍物 - 黑色
              imageData.data[rgbaIndex] = 0
              imageData.data[rgbaIndex + 1] = 0
              imageData.data[rgbaIndex + 2] = 0
              imageData.data[rgbaIndex + 3] = 255
            } else if (grayValue > 200) {
              // 自由空间 - 白色
              imageData.data[rgbaIndex] = 255
              imageData.data[rgbaIndex + 1] = 255
              imageData.data[rgbaIndex + 2] = 255
              imageData.data[rgbaIndex + 3] = 255
            } else {
              // 未知区域 - 灰色
              imageData.data[rgbaIndex] = 128
              imageData.data[rgbaIndex + 1] = 128
              imageData.data[rgbaIndex + 2] = 128
              imageData.data[rgbaIndex + 3] = 255
            }
          } else {
            // 数据越界，使用默认颜色
            imageData.data[rgbaIndex] = 128
            imageData.data[rgbaIndex + 1] = 128
            imageData.data[rgbaIndex + 2] = 128
            imageData.data[rgbaIndex + 3] = 255
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0)
      const pngDataUrl = canvas.toDataURL('image/png')
      
      // 缓存结果
      this.convertedMaps.set(pgmUrl, pngDataUrl)
      
      console.log('PGM转换成功，图像尺寸:', header.width, 'x', header.height)
      
      return pngDataUrl
      
    } catch (error) {
      console.error('转换PGM文件失败:', error)
      console.error('错误详情:', error.message)
      // 返回占位符图像
      return this.createPlaceholderMap()
    }
  }

  /**
   * 解析PGM文件头
   * @param {Uint8Array} data - PGM文件数据
   * @returns {Object|null} 文件头信息
   */
  parsePgmHeader(data) {
    try {
      console.log('开始解析PGM文件头，文件大小:', data.length, 'bytes')
      
      // 检查文件头标识
      const magicNumber = String.fromCharCode(data[0], data[1])
      console.log('PGM格式标识:', magicNumber)
      
      if (magicNumber !== 'P5') {
        console.warn('不支持的PGM格式，期望P5，实际:', magicNumber)
        return null
      }
      
      // 解析文件头
      let offset = 2
      
      // 跳过可能的空白字符和注释
      while (offset < data.length) {
        const char = data[offset]
        
        // 跳过空白字符
        if (char === 32 || char === 9 || char === 10 || char === 13) {
          offset++
          continue
        }
        
        // 跳过注释行
        if (char === 35) { // '#'
          while (offset < data.length && data[offset] !== 10 && data[offset] !== 13) {
            offset++
          }
          continue
        }
        
        // 开始解析数字
        break
      }
      
      // 读取宽度
      let widthStr = ''
      while (offset < data.length && data[offset] >= 48 && data[offset] <= 57) {
        widthStr += String.fromCharCode(data[offset])
        offset++
      }
      
      // 跳过空白字符
      while (offset < data.length && (data[offset] === 32 || data[offset] === 9 || data[offset] === 10 || data[offset] === 13)) {
        offset++
      }
      
      // 读取高度
      let heightStr = ''
      while (offset < data.length && data[offset] >= 48 && data[offset] <= 57) {
        heightStr += String.fromCharCode(data[offset])
        offset++
      }
      
      // 跳过空白字符
      while (offset < data.length && (data[offset] === 32 || data[offset] === 9 || data[offset] === 10 || data[offset] === 13)) {
        offset++
      }
      
      // 读取最大值
      let maxValueStr = ''
      while (offset < data.length && data[offset] >= 48 && data[offset] <= 57) {
        maxValueStr += String.fromCharCode(data[offset])
        offset++
      }
      
      // 跳过空白字符，找到数据开始位置
      while (offset < data.length && (data[offset] === 32 || data[offset] === 9 || data[offset] === 10 || data[offset] === 13)) {
        offset++
      }
      
      const width = parseInt(widthStr)
      const height = parseInt(heightStr)
      const maxValue = parseInt(maxValueStr)
      
      console.log('解析结果:', { width, height, maxValue, offset })
      
      if (isNaN(width) || isNaN(height) || isNaN(maxValue)) {
        console.warn('PGM文件头解析失败:', { width, height, maxValue })
        
        // 调试：显示文件头内容
        const headerDebug = Array.from(data.slice(0, Math.min(200, data.length)))
          .map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`)
          .join('')
        console.log('文件头调试信息:', headerDebug)
        
        return null
      }
      
      // 验证数据大小
      const expectedDataSize = width * height
      const actualDataSize = data.length - offset
      
      console.log('数据大小验证 - 期望:', expectedDataSize, '实际:', actualDataSize)
      
      if (actualDataSize < expectedDataSize) {
        console.warn('PGM数据大小不匹配，期望:', expectedDataSize, '实际:', actualDataSize)
        return null
      }
      
      const headerInfo = { 
        width, 
        height, 
        maxValue, 
        dataOffset: offset,
        magicNumber 
      }
      
      console.log('PGM文件头解析成功:', headerInfo)
      
      return headerInfo
      
    } catch (error) {
      console.error('PGM文件头解析异常:', error)
      
      // 调试：显示文件头内容
      const headerDebug = Array.from(data.slice(0, Math.min(200, data.length)))
        .map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`)
        .join('')
      console.log('异常时文件头内容:', headerDebug)
      
      return null
    }
  }

  /**
   * 创建占位符地图
   * @returns {string} Data URL格式的占位符图像
   */
  createPlaceholderMap() {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 400
    const ctx = canvas.getContext('2d')
    
    // 绘制深色背景
    ctx.fillStyle = '#1a202c'
    ctx.fillRect(0, 0, 400, 400)
    
    // 绘制网格
    ctx.strokeStyle = '#2d3748'
    ctx.lineWidth = 1
    
    for (let i = 0; i <= 400; i += 20) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 400)
      ctx.stroke()
      
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(400, i)
      ctx.stroke()
    }
    
    // 添加文本
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('DLROBOT 导航地图', 200, 180)
    ctx.font = '14px Arial'
    ctx.fillText('正在加载实际地图...', 200, 200)
    
    return canvas.toDataURL()
  }

  /**
   * 获取地图边界
   * @param {Object} config - 地图配置
   * @returns {Array} 地图边界 [[minLat, minLng], [maxLat, maxLng]]
   */
  getMapBounds(config) {
    if (!config.origin || !config.resolution) {
      return [[-10, -10], [10, 10]]
    }
    
    const origin = config.origin
    const resolution = config.resolution
    
    // 使用实际地图尺寸 (DLROBOT.pgm: 480x640)
    const mapWidth = 480  // PGM文件的宽度
    const mapHeight = 640 // PGM文件的高度
    
    const originX = Array.isArray(origin) ? origin[0] : (origin.x || 0)
    const originY = Array.isArray(origin) ? origin[1] : (origin.y || 0)
    
    const minX = originX
    const minY = originY
    const maxX = minX + mapWidth * resolution
    const maxY = minY + mapHeight * resolution
    
    // 使用与rosToLeaflet相同的缩放因子
    const scale = 0.001  // 缩放因子，将米转换为合理的地理坐标
    
    // Leaflet使用[lat, lng]格式，对应ROS的[Y, X]
    return [[minY * scale, minX * scale], [maxY * scale, maxX * scale]]
  }

  /**
   * 获取初始视图配置
   * @param {Object} config - 地图配置
   * @returns {Object} 视图配置
   */
  getInitialView(config) {
    const bounds = this.getMapBounds(config)
    const center = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2
    ]
    
    return {
      center,
      zoom: 15
    }
  }
}

// 创建全局实例
const mapService = new MapService()

export default mapService