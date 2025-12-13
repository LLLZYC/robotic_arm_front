import { Client, Message } from 'paho-mqtt'
import { useRobotStore } from '../stores/robotStore'
import webVideoService from './webVideoService'

class MQTTService {
  constructor() {
    this.client = null
    this.robotStore = null
    this.messageHandlers = new Map()
    this.isConnected = false
  }
  
  // 初始化store（在Pinia可用后调用）
  initStore() {
    if (!this.robotStore) {
      this.robotStore = useRobotStore()
      // 注册默认的消息处理器
      this.registerDefaultHandlers()
    }
  }
  
  // 注册默认的消息处理器（使用配置中的话题）
  registerDefaultHandlers() {
    if (!this.robotStore) {
      console.warn('RobotStore未初始化，使用默认话题')
      // 使用硬编码的默认话题作为后备
      this.registerHandler('/map', this.handleMapData.bind(this))
      this.registerHandler('/amcl_pose', this.handlePoseData.bind(this))
      this.registerHandler('/robot_pose', this.handlePoseData.bind(this))
      this.registerHandler('/scan', this.handleLaserScan.bind(this))
      this.registerHandler('/move_base/status', this.handleNavigationStatus.bind(this))
      this.registerHandler('/camera/image', this.handleCameraImage.bind(this))
      this.registerHandler('/camera/video', this.handleVideoStream.bind(this))
      return
    }
    
    const topics = this.robotStore.config.mqttTopics
    
    // 地图数据处理器
    if (topics.mapData) {
      this.registerHandler(topics.mapData, this.handleMapData.bind(this))
    }
    
    // 机器人位姿处理器（地图中显示）
    if (topics.robotPoseMap) {
      this.registerHandler(topics.robotPoseMap, this.handlePoseData.bind(this))
    }
    
    // 机器人状态处理器（左下角状态显示）
    if (topics.robotStatus) {
      this.registerHandler(topics.robotStatus, this.handlePoseData.bind(this))
    }
    
    // 激光雷达数据处理器
    if (topics.laserScan) {
      this.registerHandler(topics.laserScan, this.handleLaserScan.bind(this))
    }
    
    // 导航状态处理器
    if (topics.navigationStatus) {
      this.registerHandler(topics.navigationStatus, this.handleNavigationStatus.bind(this))
    }
    
    // 相机图像处理器
    if (topics.cameraImage) {
      this.registerHandler(topics.cameraImage, this.handleCameraImage.bind(this))
    }
    
    // 视频流处理器
    if (topics.videoStream) {
      this.registerHandler(topics.videoStream, this.handleVideoStream.bind(this))
    }
    
    console.log('已注册消息处理器，使用话题配置:', topics)
  }
  
  // 重新注册处理器
  reregisterHandlers() {
    console.log('重新注册消息处理器...')
    
    // 清除旧的处理器
    this.messageHandlers.clear()
    
    // 重新注册处理器
    this.registerDefaultHandlers()
  }
  
  // 注册消息处理器
  registerHandler(topic, handler) {
    this.messageHandlers.set(topic, handler)
  }
  
  // 连接到MQTT代理
  async connect(brokerUrl = 'ws://localhost:9001') {
    return new Promise((resolve, reject) => {
      try {
        // 验证URL格式
        if (!brokerUrl || !brokerUrl.trim()) {
          throw new Error('MQTT代理地址不能为空')
        }
        
        // 解析broker URL
        const url = new URL(brokerUrl)
        const host = url.hostname
        const port = parseInt(url.port) || (url.protocol === 'wss:' ? 443 : 80)
        const path = url.pathname || '/mqtt'
        
        // 验证主机和端口
        if (!host) {
          throw new Error('MQTT代理主机地址无效')
        }
        
        if (port < 1 || port > 65535) {
          throw new Error(`MQTT代理端口无效: ${port}`)
        }
        
        // 生成客户端ID（确保唯一性）
        const clientId = 'dlrobot_front_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
        
        console.log(`尝试连接MQTT: ${brokerUrl}, 客户端ID: ${clientId}`)
        
        // 创建客户端
        this.client = new Client(host, port, path, clientId)
        
        // 设置回调函数
        this.client.onConnectionLost = (response) => {
          console.log('MQTT连接丢失:', response.errorMessage || '未知原因')
          this.isConnected = false
          if (this.robotStore) {
            this.robotStore.setMqttConnected(false)
          }
          
          // 自动重连（延迟5秒）
          setTimeout(() => {
            if (!this.isConnected) {
              console.log('尝试重新连接MQTT...')
              this.connect(brokerUrl).catch(err => {
                console.error('MQTT重连失败:', err.message)
              })
            }
          }, 5000)
        }
        
        this.client.onMessageArrived = (message) => {
          this.handleMessage(message.destinationName, message.payloadString)
        }
        
        // 连接选项
        const options = {
          timeout: 10, // 增加超时时间
          keepAliveInterval: 60,
          cleanSession: true,
          useSSL: url.protocol === 'wss:',
          onSuccess: () => {
            console.log('MQTT连接成功')
            this.isConnected = true
            if (this.robotStore) {
              this.robotStore.setMqttConnected(true)
            }
            
            // 自动订阅默认话题
            this.subscribeToDefaultTopics()
            resolve()
          },
          onFailure: (error) => {
            const errorMsg = error.errorMessage || '连接失败，未知错误'
            console.error('MQTT连接失败:', errorMsg)
            this.isConnected = false
            if (this.robotStore) {
              this.robotStore.setMqttConnected(false)
            }
            
            // 提供更详细的错误信息
            let detailedError = errorMsg
            if (errorMsg.includes('AMQJS0007E')) {
              detailedError = `Socket连接错误 - 请检查MQTT代理服务是否运行在 ${brokerUrl}`
            } else if (errorMsg.includes('AMQJS0008E')) {
              detailedError = '连接超时 - 请检查网络连接和代理地址'
            }
            
            reject(new Error(detailedError))
          }
        }
        
        // 开始连接
        this.client.connect(options)
        
      } catch (error) {
        console.error('MQTT连接配置错误:', error.message)
        reject(new Error(`MQTT配置错误: ${error.message}`))
      }
    })
  }
  
  // 订阅默认话题（使用配置中的话题）
  subscribeToDefaultTopics() {
    if (!this.client || !this.isConnected) {
      console.warn('MQTT客户端未连接，无法订阅话题')
      return
    }
    
    if (!this.robotStore) {
      console.warn('RobotStore未初始化，使用默认话题')
      // 使用硬编码的默认话题作为后备
      const defaultTopics = [
        '/map',
        '/amcl_pose', 
        '/scan',
        '/move_base/status',
        '/camera/image',
        '/camera/video'
      ]
      
      defaultTopics.forEach(topic => {
        try {
          this.client.subscribe(topic)
          console.log(`成功订阅话题: ${topic}`)
          if (this.robotStore) {
            this.robotStore.subscribeToTopic(topic)
          }
        } catch (error) {
          console.error(`订阅话题失败 ${topic}:`, error)
        }
      })
      return
    }
    
    const topics = this.robotStore.config.mqttTopics
    const topicList = Object.values(topics).filter(topic => topic && topic.trim())
    
    console.log('订阅话题列表:', topicList)
    
    topicList.forEach(topic => {
      try {
        this.client.subscribe(topic)
        console.log(`成功订阅话题: ${topic}`)
        this.robotStore.subscribeToTopic(topic)
      } catch (error) {
        console.error(`订阅话题失败 ${topic}:`, error)
      }
    })
  }
  
  // 处理接收到的消息
  handleMessage(topic, message) {
    try {
      // 验证消息格式
      if (!message || typeof message !== 'string') {
        console.warn(`收到无效格式的消息: ${topic}`)
        return
      }
      
      console.log(`MQTT收到消息: ${topic}, 长度: ${message.length}`)
      
      const handler = this.messageHandlers.get(topic)
      if (handler) {
        let parsedData
        
        // 特殊处理 /scan 主题的消息，处理 Infinity 值
        if (topic === '/scan') {
          try {
            // 首先尝试标准JSON解析
            parsedData = JSON.parse(message)
          } catch (jsonError) {
            // 如果标准解析失败，尝试清理 Infinity 值
            console.warn(`/scan 消息JSON解析失败，尝试清理 Infinity 值: ${jsonError.message}`)
            
            // 清理 Infinity 值，将其替换为 null 或大数值
            const cleanedMessage = message.replace(/Infinity/g, 'null')
            
            try {
              parsedData = JSON.parse(cleanedMessage)
              console.log('成功清理并解析 /scan 消息')
            } catch (cleanError) {
              console.error(`清理后仍无法解析 /scan 消息: ${cleanError.message}`)
              
              // 如果清理后仍然失败，尝试手动解析激光雷达数据格式
              // 假设格式为：时间戳,距离1,距离2,...
              if (message.includes(',')) {
                const parts = message.split(',')
                const ranges = parts.slice(1).map(val => {
                  const num = parseFloat(val)
                  return isNaN(num) || val === 'Infinity' ? null : num
                }).filter(val => val !== null)
                
                if (ranges.length > 0) {
                  parsedData = { ranges: ranges }
                  console.log('手动解析 /scan 消息成功')
                } else {
                  throw new Error('无法解析激光雷达数据格式')
                }
              } else {
                throw cleanError
              }
            }
          }
        } else {
          // 其他主题使用标准JSON解析
          parsedData = JSON.parse(message)
        }
        
        // 为数据添加话题信息，便于处理器区分来源
        parsedData._topic = topic
        
        handler(parsedData)
      } else {
        console.log(`收到未处理的话题 ${topic}:`, message)
      }
    } catch (error) {
      console.error(`处理消息错误 ${topic}:`, error)
    }
  }
  
  // 处理地图数据
  handleMapData(data) {
    if (data && data.map_url) {
      this.robotStore.setMapData({
        pgmUrl: data.map_url,
        resolution: data.resolution || 0.05,
        origin: data.origin || { x: -10, y: -10, z: 0 }
      })
    }
  }
  
  // 处理机器人位姿数据
  handlePoseData(data) {
    if (data && data.pose) {
      const x = data.pose.position.x
      const y = data.pose.position.y
      const theta = this.quaternionToYaw(data.pose.orientation)
      
      // 验证数据有效性
      if (isNaN(x) || isNaN(y) || isNaN(theta)) {
        console.warn('机器人位姿数据包含无效值:', { x, y, theta })
        return
      }
      
      // 获取话题信息
      const topic = data._topic || 'unknown'
      
      console.log('机器人位姿数据更新:', {
        topic: topic,
        x: x.toFixed(3),
        y: y.toFixed(3),
        theta: theta.toFixed(3),
        theta_degrees: (theta * 180 / Math.PI).toFixed(1)
      })
      
      // 处理所有位姿数据，但优先使用amcl数据
      if (topic === '/amcl_pose' || topic.includes('amcl')) {
        console.log('使用AMCL定位数据更新机器人位置')
        this.robotStore.updateRobotPose({
          x: x,
          y: y,
          theta: theta
        })
      } else if (topic === '/robot_pose') {
        // /robot_pose 也用于更新，确保有数据可用
        console.log('使用 /robot_pose 数据更新机器人位置')
        this.robotStore.updateRobotPose({
          x: x,
          y: y,
          theta: theta
        })
      } else {
        // 其他未知话题，也进行更新以确保数据可用性
        console.log('使用其他位姿话题数据更新机器人位置:', topic)
        this.robotStore.updateRobotPose({
          x: x,
          y: y,
          theta: theta
        })
      }
    } else {
      console.warn('无效的机器人位姿数据:', data)
    }
  }
  
  // 处理激光雷达数据
  handleLaserScan(data) {
    if (data && data.ranges) {
      // 清理激光雷达数据，处理 Infinity 和无效值
      const cleanedRanges = data.ranges.map(range => {
        if (range === null || range === undefined || range === 'Infinity') {
          return null // 或者返回一个最大值，如 100.0
        }
        const num = parseFloat(range)
        return isNaN(num) ? null : num
      }).filter(range => range !== null)
      
      this.robotStore.updateSensorData('laserScan', cleanedRanges)
    }
  }
  
  // 处理导航状态
  handleNavigationStatus(data) {
    if (data && data.status_list && data.status_list.length > 0) {
      const status = data.status_list[0].status
      let navStatus = 'idle'
      
      switch (status) {
        case 1: // ACTIVE
          navStatus = 'navigating'
          break
        case 3: // SUCCEEDED
          navStatus = 'arrived'
          break
        case 4: // ABORTED
          navStatus = 'failed'
          break
        default:
          navStatus = 'idle'
      }
      
      this.robotStore.updateNavigationStatus(navStatus)
    }
  }
  
  // 处理相机图像数据
  handleCameraImage(data) {
    if (data && data.image_data) {
      // 假设数据是base64编码的图像
      // 或者包含图像URL
      if (data.image_data.startsWith('data:image/')) {
        // base64图像数据
        this.robotStore.updateSensorData('cameraImage', data.image_data)
      } else if (data.image_url) {
        // 图像URL
        this.robotStore.updateSensorData('cameraImage', data.image_url)
      } else if (data.image_data) {
        // 尝试处理其他格式的图像数据
        this.robotStore.updateSensorData('cameraImage', data.image_data)
      }
    }
  }
  
  // 处理视频流数据
  handleVideoStream(data) {
    if (data && data.video_url) {
      // 视频流URL（RTSP转WebRTC或HLS）
      this.robotStore.updateSensorData('videoStream', data.video_url)
    } else if (data && data.stream_url) {
      // 备用字段名
      this.robotStore.updateSensorData('videoStream', data.stream_url)
    } else if (data && data.web_video_server_url) {
      // web_video_server 流媒体URL
      this.robotStore.updateSensorData('videoStream', data.web_video_server_url)
    } else if (data && data.topic) {
      // 如果只提供话题名，自动生成 web_video_server URL
      const topic = data.topic.replace(/^\//, '') // 移除开头的斜杠
      const streamConfig = webVideoService.getAutoStreamConfig(topic)
      const streamUrl = webVideoService.generateStreamUrl(topic, streamConfig)
      
      // 同时存储流配置信息
      this.robotStore.updateSensorData('videoStream', streamUrl)
      this.robotStore.updateSensorData('videoStreamConfig', {
        topic: topic,
        type: streamConfig.type,
        width: streamConfig.width,
        height: streamConfig.height
      })
    }
  }
  
  // 设置 web_video_server 服务器地址
  setWebVideoServerUrl(url) {
    webVideoService.setBaseUrl(url)
  }
  
  // 获取可用的图像话题
  async getAvailableVideoTopics() {
    return await webVideoService.getAvailableTopics()
  }
  
  // 手动添加视频流话题
  addVideoStream(topic, options = {}) {
    const streamUrl = webVideoService.generateStreamUrl(topic, options)
    this.robotStore.updateSensorData('videoStream', streamUrl)
    this.robotStore.updateSensorData('videoStreamConfig', {
      topic: topic,
      type: options.type || 'mjpeg',
      width: options.width,
      height: options.height
    })
  }
  
  // 四元数转偏航角
  quaternionToYaw(orientation) {
    if (!orientation) return 0
    const { x, y, z, w } = orientation
    const siny_cosp = 2 * (w * z + x * y)
    const cosy_cosp = 1 - 2 * (y * y + z * z)
    return Math.atan2(siny_cosp, cosy_cosp)
  }
  
  // 发布消息到话题
  publish(topic, message) {
    if (this.client && this.isConnected) {
      const mqttMessage = new Message(JSON.stringify(message))
      mqttMessage.destinationName = topic
      this.client.send(mqttMessage)
    }
  }
  
  // 断开连接
  disconnect() {
    if (this.client && this.isConnected) {
      this.client.disconnect()
      this.isConnected = false
      this.robotStore.setMqttConnected(false)
    }
  }
  
  // 订阅话题
  subscribe(topic) {
    if (this.client && this.isConnected) {
      try {
        this.client.subscribe(topic)
        this.robotStore.subscribeToTopic(topic)
      } catch (error) {
        console.error(`订阅话题失败 ${topic}:`, error)
      }
    }
  }
  
  // 取消订阅话题
  unsubscribe(topic) {
    if (this.client && this.isConnected) {
      try {
        this.client.unsubscribe(topic)
        this.robotStore.unsubscribeFromTopic(topic)
      } catch (error) {
        console.error(`取消订阅话题失败 ${topic}:`, error)
      }
    }
  }
}

// 创建MQTTService实例但不立即初始化store
const mqttService = new MQTTService()

export default mqttService