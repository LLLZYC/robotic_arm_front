import axios from 'axios'
import { useRobotStore } from '../stores/robotStore'

class ApiService {
  constructor() {
    this.robotStore = null
    this.client = axios.create({
      baseURL: 'http://localhost:5001',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
  
  // 初始化store（在Pinia可用后调用）
  initStore() {
    if (!this.robotStore) {
      this.robotStore = useRobotStore()
      
      // 请求拦截器
      this.client.interceptors.request.use(
        (config) => {
          const fullUrl = config.baseURL ? `${config.baseURL}${config.url}` : config.url
          console.log(`发送API请求: ${config.method?.toUpperCase()} ${fullUrl}`)
          console.log(`当前baseURL: ${config.baseURL}`)
          return config
        },
        (error) => {
          return Promise.reject(error)
        }
      )
      
      // 响应拦截器
      this.client.interceptors.response.use(
        (response) => {
          return response
        },
        (error) => {
          console.error('API请求错误:', error)
          return Promise.reject(error)
        }
      )
    }
  }
  
  // 发送目标位置到move_base
  async sendGoalPose(goalPose) {
    try {
      // 验证目标位置参数
      if (!goalPose || typeof goalPose !== 'object') {
        throw new Error('目标位置参数无效')
      }
      
      if (goalPose.x === undefined || goalPose.y === undefined || isNaN(goalPose.x) || isNaN(goalPose.y)) {
        throw new Error('目标位置坐标无效')
      }
      
      // 验证坐标范围合理性
      if (Math.abs(goalPose.x) > 1000 || Math.abs(goalPose.y) > 1000) {
        console.warn('目标位置坐标超出常规范围，可能无效:', goalPose)
      }
      
      // 按照后端期望的格式发送
      const response = await this.client.post('/api/navigation/goal', {
        goal: {
          name: goalPose.name || "override_001",
          frame_id: "map",
          position: {
            x: goalPose.x,
            y: goalPose.y,
            z: 0
          },
          orientation: {
            yaw: goalPose.yaw !== undefined ? goalPose.yaw : (goalPose.theta || 0)
          },
          wait_before: goalPose.wait_before || 0,
          wait_after: goalPose.wait_after || 0
        }
      })
      
      console.log('目标位置发送成功:', response.data)
      return response.data
      
    } catch (error) {
      let errorMessage = '发送目标位置失败'
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = '无法连接到后端服务，请检查ROS导航服务是否启动'
      } else if (error.response) {
        // 服务器返回错误状态码
        const status = error.response.status
        if (status === 404) {
          errorMessage = '导航API端点不存在，请检查后端服务配置'
        } else if (status === 500) {
          errorMessage = '服务器内部错误，请检查ROS导航系统状态'
        } else {
          errorMessage = `服务器错误: ${status} - ${error.response.data}`
        }
      } else if (error.request) {
        // 请求已发送但无响应
        errorMessage = '网络连接超时，请检查后端服务地址和网络连接'
      } else if (error.message) {
        // 自定义错误消息
        errorMessage = error.message
      }
      
      console.error('发送目标位置失败:', errorMessage, error)
      throw new Error(errorMessage)
    }
  }
  
  // 取消当前导航任务
  async cancelGoal() {
    try {
      const response = await this.client.post('/api/navigation/cancel')
      console.log('导航任务取消成功:', response.data)
      return response.data
    } catch (error) {
      console.error('取消导航任务失败:', error)
      throw error
    }
  }
  
  // 获取机器人状态
  async getRobotStatus() {
    try {
      const response = await this.client.get('/api/robot/status')
      return response.data
    } catch (error) {
      console.error('获取机器人状态失败:', error)
      throw error
    }
  }
  
  // 获取地图信息
  async getMapInfo() {
    try {
      const response = await this.client.get('/api/map/info')
      return response.data
    } catch (error) {
      console.error('获取地图信息失败:', error)
      throw error
    }
  }
  
  // ROS2服务调用
  async callROS2Service(serviceName, serviceType = 'std_srvs/srv/Trigger', data = {}) {
    try {
      console.log(`调用ROS2服务: ${serviceName}`)
      
      const response = await this.client.post('/api/ros2/service', {
        service_name: serviceName,
        service_type: serviceType,
        request_data: data
      })
      
      console.log(`ROS2服务调用成功:`, response.data)
      return response.data
      
    } catch (error) {
      console.error(`ROS2服务调用失败:`, error)
      
      // 如果服务不存在，返回模拟结果
      if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
        console.log('使用模拟ROS2服务响应')
        await new Promise(resolve => setTimeout(resolve, 1000)) // 模拟延迟
        
        // 模拟成功/失败结果
        const success = Math.random() > 0.2
        return {
          success: success,
          message: success 
            ? `服务 ${serviceName} 执行成功`
            : `服务 ${serviceName} 执行失败: 模拟错误`,
          timestamp: Date.now()
        }
      }
      
      throw error
    }
  }
  
  // 专门用于线性插入服务的快捷方法
  async runLinearInsert() {
    try {
      // 直接调用简单的Python后端
      const response = await this.client.post('/run_linear_insert', {
        simulation: true  // 使用模拟模式
      })
      
      console.log('线性插入服务调用成功:', response.data)
      return response.data
      
    } catch (error) {
      console.error('线性插入服务调用失败:', error)
      
      // 如果连接失败，返回模拟结果
      return {
        success: false,
        message: `连接后端失败: ${error.message}`
      }
    }
  }
  
  // 获取默认巡航点
  async getDefaultGoals() {
    try {
      const response = await this.client.get('/api/navigation/default_goals')
      return response.data
    } catch (error) {
      console.error('获取巡航点失败:', error)
      throw error
    }
  }
  
  // 更新默认巡航点
  async updateDefaultGoals(goals) {
    try {
      const response = await this.client.post('/api/navigation/default_goals', {
        goals: goals
      })
      return response.data
    } catch (error) {
      console.error('更新巡航点失败:', error)
      throw error
    }
  }
  
  // 停止巡航
  async holdNavigation() {
    try {
      const response = await this.client.post('/api/navigation/hold')
      console.log('巡航已停止:', response.data)
      return response.data
    } catch (error) {
      console.error('停止巡航失败:', error)
      throw error
    }
  }
  
  // 恢复巡航
  async resumeNavigation() {
    try {
      const response = await this.client.post('/api/navigation/resume')
      console.log('巡航已恢复:', response.data)
      return response.data
    } catch (error) {
      console.error('恢复巡航失败:', error)
      throw error
    }
  }
  
  // 手动抓拍
  async captureManualPhoto(label = null, session = null) {
    try {
      const payload = {}
      if (label) payload.label = label
      if (session) payload.session = session
      
      const response = await this.client.post('/api/camera/capture', payload)
      console.log('手动抓拍成功:', response.data)
      return response.data
    } catch (error) {
      console.error('手动抓拍失败:', error)
      throw error
    }
  }
  
  // 获取相机图片列表
  async getCameraImages(path = null) {
    try {
      const params = path ? { path } : {}
      const response = await this.client.get('/api/camera/images', { params })
      return response.data
    } catch (error) {
      console.error('获取相机图片列表失败:', error)
      throw error
    }
  }
  
  // 获取相机图片
  async getCameraImage(imagePath) {
    try {
      const response = await this.client.get(`/api/camera/image/${encodeURIComponent(imagePath)}`, {
        responseType: 'blob'
      })
      return response.data
    } catch (error) {
      console.error('获取相机图片失败:', error)
      throw error
    }
  }
  
  // 偏航角转四元数
  yawToQuaternion(yaw) {
    return {
      x: 0,
      y: 0,
      z: Math.sin(yaw / 2),
      w: Math.cos(yaw / 2)
    }
  }
  
  // 更新API基础URL
  updateBaseUrl(baseUrl) {
    console.log(`更新API baseURL: ${this.client.defaults.baseURL} -> ${baseUrl}`)
    this.client.defaults.baseURL = baseUrl
    this.robotStore.config.restApiUrl = baseUrl
    console.log(`更新后baseURL: ${this.client.defaults.baseURL}`)
  }
  
  // 获取当前baseURL（用于调试）
  getCurrentBaseUrl() {
    return this.client.defaults.baseURL
  }
}

// 创建ApiService实例但不立即初始化store
const apiService = new ApiService()

export default apiService