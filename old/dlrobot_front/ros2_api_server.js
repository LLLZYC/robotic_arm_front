#!/usr/bin/env node

/**
 * ROS2服务API代理服务器
 * 提供HTTP接口来调用ROS2服务
 */

import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { promisify } from 'util'

const app = express()
const PORT = 17863

// 中间件
app.use(cors())
app.use(express.json())

// 日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// ROS2服务调用
app.post('/api/ros2/service', async (req, res) => {
  try {
    const { service_name, service_type, request_data } = req.body
    
    console.log(`收到ROS2服务调用请求:`, {
      service_name,
      service_type,
      request_data
    })
    
    if (!service_name) {
      return res.status(400).json({
        success: false,
        message: '缺少服务名称'
      })
    }
    
    // 调用ROS2 CLI服务
    const result = await callROS2Service(service_name, service_type, request_data)
    
    res.json(result)
    
  } catch (error) {
    console.error('ROS2服务调用失败:', error)
    res.status(500).json({
      success: false,
      message: `服务调用失败: ${error.message}`
    })
  }
})

// 专门处理线性插入服务的端点
app.post('/api/ros2/service/run_linear_insert', async (req, res) => {
  try {
    console.log('调用线性插入服务: /run_linear_insert')
    
    const result = await callROS2Service('/run_linear_insert', 'std_srvs/srv/Trigger', {})
    
    res.json(result)
    
  } catch (error) {
    console.error('线性插入服务调用失败:', error)
    res.status(500).json({
      success: false,
      message: `线性插入失败: ${error.message}`
    })
  }
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      ros2_api: 'running'
    }
  })
})

/**
 * 调用ROS2服务的核心函数
 * @param {string} serviceName - ROS2服务名称
 * @param {string} serviceType - ROS2服务类型
 * @param {object} requestData - 请求数据
 * @returns {Promise<object>} 服务响应结果
 */
async function callROS2Service(serviceName, serviceType = 'std_srvs/srv/Trigger', requestData = {}) {
  return new Promise((resolve, reject) => {
    try {
      // 构建ROS2服务调用命令
      // 对于std_srvs/srv/Trigger类型，不需要特殊参数
      let command = 'ros2'
      let args = ['service', 'call', serviceName, serviceType]
      
      // 如果是Trigger服务，添加空的请求体
      if (serviceType === 'std_srvs/srv/Trigger') {
        args.push('{}')
      } else {
        // 对于其他服务类型，需要根据具体类型构造请求
        const requestJson = JSON.stringify(requestData)
        args.push(requestJson)
      }
      
      console.log(`执行命令: ${command} ${args.join(' ')}`)
      
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        timeout: 10000 // 10秒超时
      })
      
      let stdout = ''
      let stderr = ''
      
      process.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      
      process.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      
      process.on('close', (code) => {
        console.log(`ROS2服务调用完成，退出码: ${code}`)
        console.log(`stdout: ${stdout}`)
        console.log(`stderr: ${stderr}`)
        
        if (code === 0) {
          // 服务调用成功
          let responseData = {}
          
          try {
            // 尝试解析JSON响应
            if (stdout.trim()) {
              responseData = JSON.parse(stdout.trim())
            }
          } catch (e) {
            // 如果不是JSON，使用原始文本
            responseData = {
              output: stdout.trim()
            }
          }
          
          resolve({
            success: true,
            message: `服务 ${serviceName} 调用成功`,
            data: responseData,
            timestamp: new Date().toISOString()
          })
          
        } else {
          // 服务调用失败
          reject(new Error(`ROS2服务调用失败 (退出码: ${code}): ${stderr || stdout}`))
        }
      })
      
      process.on('error', (error) => {
        console.error('进程执行错误:', error)
        
        // 如果是command not found，可能是ROS2环境未配置
        if (error.message.includes('ENOENT')) {
          reject(new Error('ROS2命令未找到，请检查ROS2环境配置'))
        } else {
          reject(new Error(`进程执行失败: ${error.message}`))
        }
      })
      
    } catch (error) {
      reject(new Error(`ROS2服务调用异常: ${error.message}`))
    }
  })
}

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error)
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  })
})

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API端点不存在'
  })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 ROS2 API服务器启动成功`)
  console.log(`   监听端口: ${PORT}`)
  console.log(`   API地址: http://localhost:${PORT}`)
  console.log(`   ROS2服务端点: http://localhost:${PORT}/api/ros2/service`)
  console.log(`   线性插入服务: http://localhost:${PORT}/api/ros2/service/run_linear_insert`)
  console.log(`   健康检查: http://localhost:${PORT}/api/health`)
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n收到关闭信号，正在关闭服务器...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n收到终止信号，正在关闭服务器...')
  process.exit(0)
})