import { Client, Message } from 'paho-mqtt'
import { useRobotStore } from '../stores/robotStore'
import webVideoService from './webVideoService'
import unreachableGoalService from './unreachableGoalService'

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
      // 初始化无法到达目标服务
      unreachableGoalService.initStore(this.robotStore)
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
      this.registerHandler('/navigation/unreachable_goal', unreachableGoalService.handleUnreachableGoal.bind(unreachableGoalService))
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
      
      // console.log(`MQTT收到消息: ${topic}, 长度: ${message.length}`)

      // 尝试直接匹配注册的处理器（精确匹配），如果未命中则尝试多种回退匹配策略
      let handler = this.messageHandlers.get(topic)
      let matchedTopic = topic
      if (!handler) {
        // 尝试去掉/或加上前导斜杠
        const alt1 = topic.replace(/^\//, '')
        const alt2 = ('/' + topic).replace('//', '/')
        handler = this.messageHandlers.get(alt1) || this.messageHandlers.get(alt2)
        if (handler) matchedTopic = this.messageHandlers.has(alt1) ? alt1 : alt2
      }

      if (!handler) {
        // 尝试按话题最后一段进行匹配（例如 /map/pose -> pose）
        const lastSegment = topic.split('/').filter(Boolean).pop()
        for (const key of this.messageHandlers.keys()) {
          if (!key) continue
          const kLast = key.split('/').filter(Boolean).pop()
          if (kLast && lastSegment && kLast === lastSegment) {
            handler = this.messageHandlers.get(key)
            matchedTopic = key
            break
          }
        }
      }

      if (!handler) {
        // 尝试模糊包含匹配
        for (const key of this.messageHandlers.keys()) {
          if (topic.includes(key) || key.includes(topic)) {
            handler = this.messageHandlers.get(key)
            matchedTopic = key
            break
          }
        }
      }

      if (handler) {
        let parsedData
        
        // 特殊处理 /scan 主题的消息，处理 Infinity 值
        if (topic === '/scan' || matchedTopic === '/scan') {
          try {
            // 首先尝试标准JSON解析
            parsedData = JSON.parse(message)
          } catch (jsonError) {
            // 如果标准解析失败，尝试清理 Infinity 值
            
            // 修复: 使用更精确的正则，只替换作为值的 Infinity
            const cleanedMessage = message.replace(/:\s*Infinity\b/g, ': null')
            
            try {
              parsedData = JSON.parse(cleanedMessage)
              // console.log('成功清理并解析 /scan 消息')
            } catch (cleanError) {
              console.error(`清理后仍无法解析 /scan 消息: ${cleanError.message}`)
              
              // 如果清理后仍然失败，尝试手动解析激光雷达数据格式
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
          // 其他主题使用标准JSON解析，宽松处理
          try {
            parsedData = JSON.parse(message)
          } catch (e) {
            // 有些后端可能发送单行 key=value 或裸数字，尝试做简单解析
            try {
              // 去掉首尾引号
              const s = message.trim().replace(/^\"|\"$/g, '')
              parsedData = JSON.parse(s)
            } catch (e2) {
              // 作为最后手段，包装为 text 字段
              parsedData = { text: message }
            }
          }
        }
        
        // 为数据添加话题信息，便于处理器区分来源（使用匹配到的话题键）
        parsedData._topic = matchedTopic || topic

        try {
          handler(parsedData)
        } catch (err) {
          console.error(`消息处理器执行错误，话题: ${matchedTopic || topic}`, err)
        }
      } else {
        // console.log(`收到未注册的话题 ${topic}（尝试匹配失败）:`, message)
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
    try {
      if (!data) {
        console.warn('无效的机器人位姿数据: data 为空')
        return
      }

      // 尝试从常见路径提取坐标和朝向
      let x = null
      let y = null
      let theta = null

      // 常见 ROS PoseStamped 格式
      if (data.pose && data.pose.position) {
        x = Number(data.pose.position.x)
        y = Number(data.pose.position.y)
        theta = this.quaternionToYaw(data.pose.orientation)
      } else if (data.position && typeof data.position === 'object') {
        x = Number(data.position.x)
        y = Number(data.position.y)
        if (data.orientation) {
          theta = this.quaternionToYaw(data.orientation)
        }
      } else if (typeof data.x === 'number' || typeof data.x === 'string') {
        x = Number(data.x)
        y = Number(data.y)
        // 支持 yaw 或 theta 字段
        if (data.yaw !== undefined) theta = Number(data.yaw)
        else if (data.theta !== undefined) theta = Number(data.theta)
        else if (data.angle !== undefined) theta = Number(data.angle)
      } else if (data.pose && (data.pose.x !== undefined || data.pose.y !== undefined)) {
        x = Number(data.pose.x)
        y = Number(data.pose.y)
        if (data.pose.yaw !== undefined) theta = Number(data.pose.yaw)
        else if (data.pose.theta !== undefined) theta = Number(data.pose.theta)
      }

      // 如果 theta 仍为空且存在 orientation 字段（四元数形式），解析它
      if ((theta === null || isNaN(theta)) && data.orientation && data.orientation.x !== undefined) {
        theta = this.quaternionToYaw(data.orientation)
      }

      // 最终验证
      if (isNaN(x) || isNaN(y) || isNaN(theta)) {
        // console.warn('机器人位姿数据包含无效值或缺少字段:', { x, y, theta, sample: data })
        return
      }

      const topic = data._topic || 'unknown'

      // 如果 mock 服务正在运行，忽略外部 MQTT 位姿推送，避免干扰模拟
      try {
        if (window && window.mockRobotService && window.mockRobotService.isRunning) {
          // console.debug('mqttService: 忽略 MQTT 位姿更新，因为 mockRobotService 正在运行', topic)
          return
        }
      } catch (e) {
        // ignore
      }

      // 更新 store
      this.robotStore.updateRobotPose({ x: x, y: y, theta: theta })
      this.robotStore.setHasRealPose(true)
      
    } catch (err) {
      console.error('处理机器人位姿数据时发生异常:', err, data)
    }
  }
  
  // 处理激光雷达数据
  handleLaserScan(data) {
    if (data && data.ranges) {
      // 修复：不要使用 filter 删除元素，这会破坏索引与角度的对应关系！
      // 使用 map 将无效值转换为 0 或 null，但保持数组长度不变
      const cleanedRanges = data.ranges.map(range => {
        // 处理 null, undefined, Infinity
        if (range === null || range === undefined || range === 'Infinity') {
          return 0.0 // 返回 0.0 代表无效或无限远，前端渲染时应处理 0 值
        }
        const num = parseFloat(range)
        // 处理 NaN 或无限大
        return (isNaN(num) || !isFinite(num)) ? 0.0 : num
      })
      
      this.robotStore.updateSensorData('laserScan', cleanedRanges)
    }
  }
  
  // 处理导航状态
  handleNavigationStatus(data) {
    // 如果 mock 服务正在运行，则忽略来自 MQTT 的导航状态更新，避免与本地模拟冲突
    try {
      if (window && window.mockRobotService && window.mockRobotService.isRunning) {
        return
      }
    } catch (e) {}

    if (data && data.status_list && data.status_list.length > 0) {
      // 修复：不要只取第0个，应该取最后一个（最新的目标状态）
      // status_list 通常按时间顺序排列，最后一个是最新的
      const lastStatusObj = data.status_list[data.status_list.length - 1]
      const status = lastStatusObj.status
      
      let navStatus = 'idle'
      
      // ROS actionlib_msgs/GoalStatus 定义:
      // 1: ACTIVE (正在执行)
      // 3: SUCCEEDED (成功)
      // 4: ABORTED (失败)
      switch (status) {
        case 1: // ACTIVE
          navStatus = 'navigating'
          break
        case 3: // SUCCEEDED
          navStatus = 'arrived'
          break
        case 4: // ABORTED
        case 5: // REJECTED
          navStatus = 'failed'
          break
        case 2: // PREEMPTED
        default:
          navStatus = 'idle'
      }
      
      this.robotStore.updateNavigationStatus(navStatus)
    }
  }
  
  // 处理相机图像数据
  handleCameraImage(data) {
    if (data && data.image_data) {
      if (data.image_data.startsWith('data:image/')) {
        this.robotStore.updateSensorData('cameraImage', data.image_data)
      } else if (data.image_url) {
        this.robotStore.updateSensorData('cameraImage', data.image_url)
      } else if (data.image_data) {
        this.robotStore.updateSensorData('cameraImage', data.image_data)
      }
    }
  }
  
  // 处理视频流数据
  handleVideoStream(data) {
    if (data && data.video_url) {
      this.robotStore.updateSensorData('videoStream', data.video_url)
    } else if (data && data.stream_url) {
      this.robotStore.updateSensorData('videoStream', data.stream_url)
    } else if (data && data.web_video_server_url) {
      this.robotStore.updateSensorData('videoStream', data.web_video_server_url)
    } else if (data && data.topic) {
      const topic = data.topic.replace(/^\//, '')
      const streamConfig = webVideoService.getAutoStreamConfig(topic)
      const streamUrl = webVideoService.generateStreamUrl(topic, streamConfig)
      
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