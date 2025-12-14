import { defineStore } from 'pinia'

export const useRobotStore = defineStore('robot', {
  state: () => ({
    // MQTT连接状态
    mqttConnected: false,
    mqttClient: null,
    
    // ROS话题订阅
    subscribedTopics: [],
    
    // 机器人状态数据
    robotPose: {
      x: 0,
      y: 0,
      theta: 0
    },
    // 标记是否已收到来自机器人/后端的真实位姿
    hasRealPose: false,
    // 临时诊断字段：记录最近一次 setGoalPose 写入的目标（用于检测谁把 robotPose 设为 goal）
    __lastSetGoalPose: null,
    
    // 传感器数据
    sensorData: {
      laserScan: [],
      cameraImage: null,
      videoStream: null
    },
    
    // 导航状态
    navigationStatus: 'idle', // idle, navigating, arrived, failed
    goalPose: null,
    
    // 无法到达的目标
    unreachableGoals: [],
    
    // 地图数据
    mapData: {
      pgmUrl: '',
      resolution: 0.05,
      origin: { x: -5.0, y: -15.2, z: 0 },
      widthPixels: 480,  // DLROBOT.pgm实际宽度
      heightPixels: 640  // DLROBOT.pgm实际高度
    },
    
    // 配置参数
    config: {
      mqttBroker: 'ws://localhost:9001',
      restApiUrl: 'http://localhost:17863',
      // 前端在未收到真实位姿时使用的默认位姿
      defaultRobotPose: { x: 0, y: 0, theta: 0 },
      mapTopics: ['/map'],
      sensorTopics: ['/scan', '/camera/image', '/camera/video'],
      // 默认话题配置
      defaultTopics: {
        laser: '/scan',
        camera: '/camera/rgb/image_raw',
        video: '/camera/rgb/image_raw',
        pose: '/robot_pose',
        map: '/map'
      },
      // 相机图像文件夹路径
      cameraImagePath: '/home/dlrobot_autocontrol',
      // MQTT话题配置（用于各个组件订阅）
      mqttTopics: {
        robotStatus: '/robot_pose',        // 左下角机器人状态
        laserScan: '/scan',                // 右上角激光雷达
        cameraImage: '/camera/rgb/image_raw',  // 相机图像
        videoStream: '/camera/rgb/image_raw',  // 视频流
        robotPoseMap: '/amcl_pose',        // 地图中机器人位置
        mapData: '/map',                   // 地图数据
        navigationStatus: '/move_base/status'  // 导航状态
      }
    }
  }),
  
  getters: {
    isConnected: (state) => state.mqttConnected,
    // currentPose: 返回真实位姿（如果已接收），否则返回默认位姿
    currentPose: (state) => {
      if (state.hasRealPose) return state.robotPose
      return state.config.defaultRobotPose || state.robotPose
    },
    hasGoal: (state) => state.goalPose !== null
  },
  
  actions: {
    // 设置MQTT连接状态
    setMqttConnected(status) {
      this.mqttConnected = status
    },
    
    // 设置MQTT客户端
    setMqttClient(client) {
      this.mqttClient = client
    },
    
    // 更新机器人位姿
    updateRobotPose(pose) {
      try {
        // Diagnostic: if the incoming pose is (almost) equal to the last set goal,
        // and debug flag enabled, print a stack to help find who wrote it.
        const dbg = (typeof window !== 'undefined' && window.__poseDebug === true)
        if (dbg && this.__lastSetGoalPose && pose) {
          const eps = 1e-3
          const gx = Number(this.__lastSetGoalPose.x || 0)
          const gy = Number(this.__lastSetGoalPose.y || 0)
          const px = Number(pose.x || 0)
          const py = Number(pose.y || 0)
          const dx = Math.abs(gx - px)
          const dy = Math.abs(gy - py)
          if (dx < eps && dy < eps) {
            console.warn('RobotStore: Detected robotPose being set equal to last goalPose — logging stack for diagnosis', { goal: this.__lastSetGoalPose, pose })
            try { console.warn(new Error('Stack trace:').stack) } catch (e) {}
          }
        }
      } catch (e) {
        // ignore diagnostics failures
      }

      console.log('RobotStore: 更新机器人位姿:', {
        old: this.robotPose,
        new: pose
      })
      this.robotPose = { ...this.robotPose, ...pose }
      console.log('RobotStore: 位姿更新完成:', this.robotPose)
    },

    // 设置是否已经接收到真实机器人的位姿
    setHasRealPose(flag = true) {
      this.hasRealPose = !!flag
    },
    
    // 更新传感器数据
    updateSensorData(type, data) {
      this.sensorData[type] = data
    },
    
    // 设置目标位置
    setGoalPose(pose) {
      this.goalPose = pose
      this.navigationStatus = 'navigating'
      // store diagnostic copy
      try { this.__lastSetGoalPose = { ...pose } } catch (e) {}
    },
    
    // 更新导航状态
    updateNavigationStatus(status) {
      this.navigationStatus = status
    },
    
    // 添加无法到达的目标
    addUnreachableGoal(goalData) {
      // 检查是否已存在
      const exists = this.unreachableGoals.some(g => g.goal_name === goalData.goal_name);
      if (!exists) {
        this.unreachableGoals.push({
          ...goalData,
          timestamp: Date.now()
        });
      }
    },
    
    // 清除所有无法到达的目标
    clearUnreachableGoals() {
      this.unreachableGoals = [];
    },
    
    // 设置地图数据
    setMapData(mapData) {
      this.mapData = { ...this.mapData, ...mapData }
    },

    setMapPixels(widthPixels, heightPixels) {
      this.mapData.widthPixels = widthPixels
      this.mapData.heightPixels = heightPixels
    },

    setMapResolution(resolution) {
      this.mapData.resolution = resolution
    },

    setMapOrigin(origin) {
      if (Array.isArray(origin)) {
        this.mapData.origin = {
          x: origin[0] || 0,
          y: origin[1] || 0,
          z: origin[2] || 0
        }
      } else if (origin && typeof origin === 'object') {
        this.mapData.origin = {
          x: origin.x || 0,
          y: origin.y || 0,
          z: origin.z || origin[2] || 0
        }
      } else {
        this.mapData.origin = { x: -10, y: -10, z: 0 }
      }
    },

    setMapPgmUrl(pgmUrl) {
      this.mapData.pgmUrl = pgmUrl
    },

    // 清除当前目标位置
    clearGoalPose() {
      this.goalPose = null
      // 将导航状态回到 idle 以与 UI 保持一致
      this.navigationStatus = 'idle'
    },
    
    // 订阅话题
    subscribeToTopic(topic) {
      if (!this.subscribedTopics.includes(topic)) {
        this.subscribedTopics.push(topic)
      }
    },
    
    // 取消订阅话题
    unsubscribeFromTopic(topic) {
      this.subscribedTopics = this.subscribedTopics.filter(t => t !== topic)
    },
    
    // 更新配置并持久化到localStorage
    updateConfig(key, value) {
      this.config[key] = value
      this.saveConfigToLocalStorage()
    },
    
    // 保存配置到localStorage
    saveConfigToLocalStorage() {
      try {
        localStorage.setItem('robotConfig', JSON.stringify(this.config))
        console.log('配置已保存到localStorage:', this.config)
      } catch (error) {
        console.error('保存配置失败:', error)
      }
    },
    
    // 从localStorage加载配置
    loadConfigFromLocalStorage() {
      try {
        const savedConfig = localStorage.getItem('robotConfig')
        if (savedConfig) {
          const parsedConfig = JSON.parse(savedConfig)
          this.config = { ...this.config, ...parsedConfig }
          console.log('从localStorage加载配置:', this.config)
        }
      } catch (error) {
        console.error('加载配置失败:', error)
      }
    },

    // 发送目标位置
    async sendGoalPose(goalPose) {
      try {
        // 验证目标位置参数
        if (!goalPose || typeof goalPose !== 'object') {
          throw new Error('目标位置参数无效')
        }

        // 检查是否为测试模式：支持多种检测方式（URL、页面 class、全局 mock 服务）
        const isTestMode = window.location.pathname.includes('/test') ||
              document.querySelector('.test-panel') ||
              (document && document.body && document.body.classList && document.body.classList.contains && document.body.classList.contains('test-mode')) ||
              (window && window.mockRobotService && window.mockRobotService.isRunning)

        // 获取位置信息
        const position = goalPose.position || {
          x: goalPose.x,
          y: goalPose.y
        }

        // 获取朝向信息
        const orientation = goalPose.orientation || goalPose.yaw || 0

        // 设置目标位置和导航状态
        this.setGoalPose({
          ...position,
          theta: orientation
        })

        // 如果 mock 服务正在运行，优先将目标委托给 mockRobotService（避免重复模拟）
        if (window && window.mockRobotService && window.mockRobotService.isRunning) {
          try {
            const m = window.mockRobotService
            // prepare start snapshot similar to CruiseControl if possible
            const startSnapshot = (m && m.currentPose && typeof m.currentPose.x !== 'undefined') ? { ...m.currentPose } : (window.robotStore && window.robotStore.robotPose ? { ...window.robotStore.robotPose } : null)
            try { m.cancelCurrentMove && m.cancelCurrentMove() } catch (e) {}
            try { m.sendGoalPosition({ x: position.x, y: position.y, yaw: orientation }, startSnapshot) } catch (e) { console.warn('委托 mockRobotService 发送目标失败', e) }
            // ensure store state is consistent
            try { this.setGoalPose({ ...position, theta: orientation }) } catch (e) {}
            try { this.updateNavigationStatus('navigating') } catch (e) {}
            return { success: true, delegatedToMock: true }
          } catch (e) {
            console.warn('sendGoalPose: delegate to mock failed', e)
          }
        }

        // 在非测试模式下，发送到实际机器人
        if (!isTestMode) {
          // 导入apiService
          const { default: apiService } = await import('../services/apiService.js')

          // 发送到后端
          const result = await apiService.sendGoalPose({
            ...position,
            yaw: orientation
          })

          console.log('目标位置已发送到实际机器人:', result)
          return result
        } else {
          // 如果到这里，表示 isTestMode 为 true，但没有 mockRobotService：使用 store 内置模拟（短延迟到达）
          console.log('测试模式 (store 模拟): 模拟发送目标位置', { ...position, yaw: orientation })

          // 模拟导航成功（保留短延迟以避免立刻冲突）
          setTimeout(() => {
            try { this.updateRobotPose({ x: position.x, y: position.y, theta: orientation }) } catch (e) {}
            try { this.updateNavigationStatus('arrived') } catch (e) {}
            // 触发导航状态变化事件
            if (window.eventBus) {
              try { window.eventBus.value.emit('navigation-status-change', 'arrived') } catch (e) {}
            }
          }, 2000) // 2秒后模拟到达

          return { success: true, testMode: true }
        }
      } catch (error) {
        console.error('发送目标位置失败:', error)
        this.updateNavigationStatus('failed')
        throw error
      }
    }
  }
})