/**
 * Web Video Server 集成服务
 * 用于处理 web_video_server 的视频流和快照功能
 */

class WebVideoService {
  constructor() {
    this.baseUrl = 'http://localhost:8080'
    this.availableTopics = []
    this.streamUrls = new Map()
  }

  /**
   * 设置 web_video_server 基础URL
   * @param {string} url - web_video_server 服务器地址
   */
  setBaseUrl(url) {
    this.baseUrl = url
  }

  /**
   * 获取可用的图像话题列表
   * @returns {Promise<Array>} 可用话题列表
   */
  async getAvailableTopics() {
    try {
      // 添加超时和错误处理
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5秒超时
      
      const response = await fetch(this.baseUrl, { 
        signal: controller.signal 
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const html = await response.text()
      
      // 解析HTML获取话题列表
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const links = doc.querySelectorAll('a')
      
      this.availableTopics = Array.from(links)
        .map(link => link.getAttribute('href'))
        .filter(href => href && href.includes('topic='))
        .map(href => {
          const match = href.match(/topic=([^&]+)/)
          return match ? decodeURIComponent(match[1]) : null
        })
        .filter(topic => topic)
      
      return this.availableTopics
    } catch (error) {
      console.warn('获取可用话题失败，web_video_server可能未启动:', error.message)
      console.log('提示: 请确保web_video_server正在运行在', this.baseUrl)
      return []
    }
  }

  /**
   * 生成视频流URL
   * @param {string} topic - ROS图像话题名
   * @param {Object} options - 流选项
   * @param {string} options.type - 流类型 (mjpeg, vp8, vp9, h264, png)
   * @param {number} options.width - 宽度
   * @param {number} options.height - 高度
   * @param {number} options.quality - 质量 (1-100)
   * @param {number} options.bitrate - 比特率 (bps)
   * @param {boolean} options.invert - 是否翻转图像
   * @returns {string} 视频流URL
   */
  generateStreamUrl(topic, options = {}) {
    const params = new URLSearchParams()
    params.set('topic', topic)
    
    // 设置选项参数
    if (options.type) params.set('type', options.type)
    if (options.width) params.set('width', options.width)
    if (options.height) params.set('height', options.height)
    if (options.quality) params.set('quality', options.quality)
    if (options.bitrate) params.set('bitrate', options.bitrate)
    if (options.invert) params.set('invert', '')
    
    const streamUrl = `${this.baseUrl}/stream?${params.toString()}`
    this.streamUrls.set(topic, streamUrl)
    
    return streamUrl
  }

  /**
   * 获取快照URL
   * @param {string} topic - ROS图像话题名
   * @param {Object} options - 快照选项
   * @param {number} options.width - 宽度
   * @param {number} options.height - 高度
   * @param {boolean} options.invert - 是否翻转图像
   * @returns {string} 快照URL
   */
  generateSnapshotUrl(topic, options = {}) {
    const params = new URLSearchParams()
    params.set('topic', topic)
    
    if (options.width) params.set('width', options.width)
    if (options.height) params.set('height', options.height)
    if (options.invert) params.set('invert', '')
    
    return `${this.baseUrl}/snapshot?${params.toString()}`
  }

  /**
   * 获取流媒体预览页面URL
   * @param {string} topic - ROS图像话题名
   * @param {Object} options - 预览选项
   * @returns {string} 预览页面URL
   */
  generateViewerUrl(topic, options = {}) {
    const params = new URLSearchParams()
    params.set('topic', topic)
    
    if (options.type) params.set('type', options.type)
    if (options.width) params.set('width', options.width)
    if (options.height) params.set('height', options.height)
    if (options.quality) params.set('quality', options.quality)
    if (options.bitrate) params.set('bitrate', options.bitrate)
    if (options.invert) params.set('invert', '')
    
    return `${this.baseUrl}/stream_viewer?${params.toString()}`
  }

  /**
   * 测试流媒体连接
   * @param {string} topic - 话题名
   * @returns {Promise<boolean>} 连接是否成功
   */
  async testStreamConnection(topic) {
    try {
      const streamUrl = this.generateStreamUrl(topic, { type: 'mjpeg' })
      const response = await fetch(streamUrl, { method: 'HEAD' })
      return response.ok
    } catch (error) {
      console.error(`测试流媒体连接失败 ${topic}:`, error)
      return false
    }
  }

  /**
   * 获取推荐的流类型
   * @returns {string} 推荐的流类型
   */
  getRecommendedStreamType() {
    // 根据浏览器支持情况推荐流类型
    const video = document.createElement('video')
    
    if (video.canPlayType('video/mp4; codecs="avc1.42E01E"')) {
      return 'h264' // H.264 MP4，兼容性最好
    } else if (video.canPlayType('video/webm; codecs="vp8, vorbis"')) {
      return 'vp8' // WebM VP8
    } else {
      return 'mjpeg' // MJPEG，最广泛的兼容性
    }
  }

  /**
   * 自动配置最佳流参数
   * @param {string} topic - 话题名
   * @returns {Object} 流配置参数
   */
  getAutoStreamConfig(topic) {
    const streamType = this.getRecommendedStreamType()
    
    const config = {
      type: streamType,
      width: 640,
      height: 480
    }
    
    // 根据流类型设置不同参数
    switch (streamType) {
      case 'mjpeg':
        config.quality = 80
        break
      case 'h264':
      case 'vp8':
      case 'vp9':
        config.bitrate = 500000 // 500kbps
        break
      case 'png':
        // PNG流保持默认参数
        break
    }
    
    return config
  }

  /**
   * 获取所有可用流的URL
   * @param {string} topic - 话题名
   * @returns {Object} 各种格式的流URL
   */
  getAllStreamUrls(topic) {
    const config = this.getAutoStreamConfig(topic)
    
    return {
      mjpeg: this.generateStreamUrl(topic, { ...config, type: 'mjpeg' }),
      h264: this.generateStreamUrl(topic, { ...config, type: 'h264' }),
      vp8: this.generateStreamUrl(topic, { ...config, type: 'vp8' }),
      vp9: this.generateStreamUrl(topic, { ...config, type: 'vp9' }),
      png: this.generateStreamUrl(topic, { ...config, type: 'png' }),
      snapshot: this.generateSnapshotUrl(topic, { width: 640, height: 480 }),
      viewer: this.generateViewerUrl(topic, config)
    }
  }
}

// 创建全局实例
const webVideoService = new WebVideoService()

export default webVideoService