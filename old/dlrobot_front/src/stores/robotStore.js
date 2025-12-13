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
    
    // 传感器数据
    sensorData: {
      laserScan: [],
      cameraImage: null,
      videoStream: null
    },
    
    // 导航状态
    navigationStatus: 'idle', // idle, navigating, arrived, failed
    goalPose: null,
    
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
    currentPose: (state) => state.robotPose,
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
      console.log('RobotStore: 更新机器人位姿:', {
        old: this.robotPose,
        new: pose
      })
      this.robotPose = { ...this.robotPose, ...pose }
      console.log('RobotStore: 位姿更新完成:', this.robotPose)
    },
    
    // 更新传感器数据
    updateSensorData(type, data) {
      this.sensorData[type] = data
    },
    
    // 设置目标位置
    setGoalPose(pose) {
      this.goalPose = pose
      this.navigationStatus = 'navigating'
    },
    
    // 更新导航状态
    updateNavigationStatus(status) {
      this.navigationStatus = status
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
    }
  }
})