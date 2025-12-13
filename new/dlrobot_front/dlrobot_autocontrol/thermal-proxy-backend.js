#!/usr/bin/env node

/**
 * Waveshare热成像模块后端处理版
 * 
 * 功能：
 * 1. 连接到ESP32的TCP端口3333接收二进制数据流
 * 2. 解析并处理温度数据（后端完成所有计算）
 * 3. 通过WebSocket向前端发送JSON格式的温度矩阵
 * 4. 前端只需渲染，无需复杂计算
 */

import dotenv from 'dotenv'
import net from 'net'
import { WebSocketServer } from 'ws'

// 加载环境变量
dotenv.config()

// WebSocket状态常量
const WebSocket = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
}

// 配置
const CONFIG = {
  // ESP32热成像模块配置
  esp32: {
    host: process.env.ESP32_HOST || '192.168.6.194',  // ESP32的IP地址
    port: parseInt(process.env.ESP32_PORT) || 3333     // ESP32的TCP端口
  },
  
  // WebSocket服务器配置
  websocket: {
    port: parseInt(process.env.WS_PORT) || 8080        // WebSocket监听端口
  },
  
  // 重连配置
  reconnect: {
    enabled: true,
    interval: 5000,  // 5秒后重连
    maxRetries: -1   // -1表示无限重试
  },
  
  // MI0802传感器配置
  sensor: {
    width: 80,
    height: 64,
    resolution: 100,  // 0.01°C分辨率（由Tgain寄存器决定）
    frameSize: 10256,  // 总帧大小
    pixelDataOffset: 172,  // 像素数据起始位置
    headerOffset: 12       // 帧头起始位置
  }
}

// 全局状态
let tcpClient = null
let wsServer = null
let wsClients = new Set()
let reconnectTimer = null
let reconnectAttempts = 0
let isConnecting = false
let tcpDataBuffer = Buffer.alloc(0)  // TCP数据缓冲区

// 统计信息
const stats = {
  bytesReceived: 0,
  bytesSent: 0,
  framesProcessed: 0,
  framesDropped: 0,
  connectedClients: 0,
  startTime: Date.now(),
  tempMin: 0,
  tempMax: 0,
  tempAvg: 0
}

/**
 * 创建WebSocket服务器
 */
function createWebSocketServer() {
  wsServer = new WebSocketServer({ 
    port: CONFIG.websocket.port,
    perMessageDeflate: false  // 禁用压缩以提高性能
  })
  
  wsServer.on('listening', () => {
    console.log(`✅ WebSocket服务器启动成功`)
    console.log(`   监听端口: ${CONFIG.websocket.port}`)
    console.log(`   前端连接地址: ws://localhost:${CONFIG.websocket.port}`)
  })
  
  wsServer.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress
    console.log(`📱 新客户端连接: ${clientIp}`)
    
    wsClients.add(ws)
    stats.connectedClients = wsClients.size
    
    // 发送欢迎消息
    try {
      ws.send(JSON.stringify({
        type: 'info',
        message: 'Connected to Thermal Camera Backend',
        esp32Status: tcpClient ? 'connected' : 'disconnected',
        config: {
          sensor: {
            width: CONFIG.sensor.width,
            height: CONFIG.sensor.height,
            resolution: CONFIG.sensor.resolution
          },
          esp32: CONFIG.esp32
        }
      }))
    } catch (err) {
      console.error('发送欢迎消息失败:', err.message)
    }
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message)
        handleClientMessage(ws, data)
      } catch (err) {
        console.error('处理客户端消息失败:', err.message)
      }
    })
    
    ws.on('close', () => {
      console.log(`📴 客户端断开: ${clientIp}`)
      wsClients.delete(ws)
      stats.connectedClients = wsClients.size
    })
    
    ws.on('error', (err) => {
      console.error(`WebSocket客户端错误: ${err.message}`)
      wsClients.delete(ws)
      stats.connectedClients = wsClients.size
    })
  })
  
  wsServer.on('error', (err) => {
    console.error(`❌ WebSocket服务器错误: ${err.message}`)
    if (err.code === 'EADDRINUSE') {
      console.error(`   端口 ${CONFIG.websocket.port} 已被占用，请更改WS_PORT环境变量`)
      process.exit(1)
    }
  })
}

/**
 * 处理客户端消息
 */
function handleClientMessage(ws, data) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
      break
      
    case 'getStats':
      ws.send(JSON.stringify({
        type: 'stats',
        data: {
          ...stats,
          uptime: Date.now() - stats.startTime,
          esp32Connected: !!tcpClient
        }
      }))
      break
      
    case 'reconnect':
      console.log('📡 客户端请求重连ESP32')
      connectToESP32()
      break
      
    default:
      console.log('未知消息类型:', data.type)
  }
}

/**
 * 连接到ESP32 TCP服务器
 */
function connectToESP32() {
  if (isConnecting) {
    console.log('⏳ 正在连接中，跳过重复连接请求')
    return
  }
  
  if (tcpClient) {
    console.log('🔄 关闭现有TCP连接')
    tcpClient.destroy()
    tcpClient = null
  }
  
  isConnecting = true
  console.log(`🔌 正在连接ESP32热成像模块...`)
  console.log(`   地址: ${CONFIG.esp32.host}:${CONFIG.esp32.port}`)
  
  tcpClient = new net.Socket()
  
  // 设置超时 - 热成像数据可能不是连续发送，所以设置较长的超时时间
  tcpClient.setTimeout(30000)
  
  tcpClient.connect(CONFIG.esp32.port, CONFIG.esp32.host, () => {
    console.log(`✅ 已连接到ESP32热成像模块`)
    console.log(`   ${CONFIG.esp32.host}:${CONFIG.esp32.port}`)
    isConnecting = false
    reconnectAttempts = 0
    
    // 连接成功后重置超时
    tcpClient.setTimeout(0) // 禁用超时，热成像数据可能不是连续发送
    
    // 发送启动采集命令 (WREG 0xB1 0x03 - 启动连续采集)
    // 命令格式: #<长度>WREG<地址><值><CRC>
    // 长度=4(#和长度)+4(WREG)+4(地址值)+4(CRC)=16字节=0010
    // 地址=B1, 值=03 (B1_START_CAPTURE | B1_SINGLE_CONT)
    const cmdData = '0010WREGB103'
    const crc = calculateCRC(cmdData)
    const startCmd = `#${cmdData}${crc}`  // 移除开头的空格和末尾的换行符
    console.log('📤 发送启动采集命令:', startCmd)
    tcpClient.write(startCmd)
    
    // 通知所有WebSocket客户端
    broadcastToClients(JSON.stringify({
      type: 'esp32Status',
      status: 'connected',
      host: CONFIG.esp32.host,
      port: CONFIG.esp32.port
    }))
  })
  
  tcpClient.on('data', (data) => {
    stats.bytesReceived += data.length
    
    // 将新数据追加到缓冲区
    tcpDataBuffer = Buffer.concat([tcpDataBuffer, data])
    
    // ESP32帧格式：10256字节，帧头 "   #2808GFRA"
    const FRAME_SIZE = CONFIG.sensor.frameSize
    const FRAME_HEADER = Buffer.from('   #2808GFRA', 'ascii')
    
    // 处理所有完整帧
    while (tcpDataBuffer.length >= FRAME_SIZE) {
      // 查找帧头
      let frameStart = -1
      
      // 先检查缓冲区开头
      if (tcpDataBuffer.length >= 12 && tcpDataBuffer.slice(0, 12).equals(FRAME_HEADER)) {
        frameStart = 0
      } else {
        // 搜索整个缓冲区
        frameStart = tcpDataBuffer.indexOf(FRAME_HEADER)
      }
      
      if (frameStart === -1) {
        // 没找到帧头，保留最后11字节
        if (tcpDataBuffer.length > 11) {
          const discarded = tcpDataBuffer.length - 11
          console.warn(`⚠️ 未找到帧头，丢弃${discarded}字节`)
          tcpDataBuffer = tcpDataBuffer.slice(-11)
          stats.framesDropped++
        }
        break
      }
      
      // 如果帧头不在开头，丢弃前面的数据
      if (frameStart > 0) {
        console.warn(`⚠️ 帧头偏移${frameStart}字节，丢弃无效数据`)
        tcpDataBuffer = tcpDataBuffer.slice(frameStart)
        stats.framesDropped++
      }
      
      // 检查是否有完整帧
      if (tcpDataBuffer.length < FRAME_SIZE) {
        break
      }
      
      // 提取完整帧
      const frame = tcpDataBuffer.slice(0, FRAME_SIZE)
      
      // 验证帧完整性
      if (validateFrame(frame)) {
        // 在后端处理温度数据
        processThermalFrame(frame)
        stats.framesProcessed++
      } else {
        console.warn('❌ 帧验证失败，跳过此帧')
        stats.framesDropped++
      }
      
      // 移除已处理的帧
      tcpDataBuffer = tcpDataBuffer.slice(FRAME_SIZE)
    }
    
    // 防止缓冲区过大
    if (tcpDataBuffer.length > FRAME_SIZE * 3) {
      console.warn(`⚠️ 缓冲区过大(${tcpDataBuffer.length}字节)，重置`)
      tcpDataBuffer = tcpDataBuffer.slice(-FRAME_SIZE * 2)
    }
  })
  
  tcpClient.on('timeout', () => {
    console.error('⏱️ TCP连接超时')
    tcpClient.destroy()
  })
  
  tcpClient.on('error', (err) => {
    console.error(`❌ TCP连接错误: ${err.message}`)
    isConnecting = false
    
    if (err.code === 'ECONNREFUSED') {
      console.error(`   无法连接到 ${CONFIG.esp32.host}:${CONFIG.esp32.port}`)
      console.error(`   请检查：`)
      console.error(`   1. ESP32是否已开机并连接到WiFi`)
      console.error(`   2. IP地址是否正确（当前: ${CONFIG.esp32.host}）`)
      console.error(`   3. 端口是否正确（当前: ${CONFIG.esp32.port}）`)
      console.error(`   4. 设备是否在同一局域网`)
    }
    
    // 通知客户端
    broadcastToClients(JSON.stringify({
      type: 'esp32Status',
      status: 'error',
      error: err.message
    }))
    
    scheduleReconnect()
  })
  
  tcpClient.on('close', () => {
    console.log('🔌 TCP连接已关闭')
    tcpClient = null
    isConnecting = false
    tcpDataBuffer = Buffer.alloc(0)  // 清空缓冲区
    
    // 通知客户端
    broadcastToClients(JSON.stringify({
      type: 'esp32Status',
      status: 'disconnected'
    }))
    
    scheduleReconnect()
  })
}

/**
 * 处理热成像帧（后端处理所有计算）
 */
function processThermalFrame(frame) {
  try {
    const { width, height, pixelDataOffset, resolution } = CONFIG.sensor
    const pixelCount = width * height
    
    // 创建DataView方便读取
    const dataView = new DataView(frame.buffer, frame.byteOffset)
    
    // 提取像素数据（小端序）
    const pixelData = new Uint16Array(pixelCount)
    let sumTemp = 0
    let validCount = 0
    let minPixel = 0xFFFF
    let maxPixel = 0
    
    for (let i = 0; i < pixelCount; i++) {
      const offset = pixelDataOffset + i * 2
      // ESP32使用小端序
      pixelData[i] = dataView.getUint16(offset, true)
      
      // 统计有效像素
      if (pixelData[i] > 0 && pixelData[i] < 65000) {
        sumTemp += pixelData[i]
        validCount++
        if (pixelData[i] < minPixel) minPixel = pixelData[i]
        if (pixelData[i] > maxPixel) maxPixel = pixelData[i]
      }
    }
    
    if (validCount === 0) {
      console.warn('⚠️ 没有有效像素数据')
      return
    }
    
    // 计算温度统计（后端完成所有温度计算）
    let minTempC = Infinity
    let maxTempC = -Infinity
    let sumTempC = 0
    const temperatureMatrix = []
    
    // 转换为80×64的温度矩阵
    for (let y = 0; y < height; y++) {
      const row = []
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        const pixelValue = pixelData[index]
        
        // 过滤无效像素
        if (pixelValue === 0 || pixelValue > 65000) {
          row.push(null)
          continue
        }
        
        // 温度转换：像素值 ÷ 分辨率
        // ESP32已经将原始数据转换为摄氏度×resolution
        const tempC = pixelValue / resolution
        
        // 统计温度范围
        if (tempC < minTempC) minTempC = tempC
        if (tempC > maxTempC) maxTempC = tempC
        sumTempC += tempC
        
        row.push(parseFloat(tempC.toFixed(2)))  // 保留2位小数
      }
      temperatureMatrix.push(row)
    }
    
    const avgTempC = sumTempC / validCount
    
    // 更新统计信息
    stats.tempMin = minTempC
    stats.tempMax = maxTempC
    stats.tempAvg = avgTempC
    
    // 每30帧输出一次统计信息
    if (stats.framesProcessed % 30 === 0) {
      console.log(`🌡️ 后端温度统计 - 最小: ${minTempC.toFixed(1)}°C, 最大: ${maxTempC.toFixed(1)}°C, 平均: ${avgTempC.toFixed(1)}°C`)
    }
    
    // 构建JSON消息发送给前端
    const thermalFrame = {
      type: 'thermalFrame',
      timestamp: Date.now(),
      width: width,
      height: height,
      data: temperatureMatrix,  // 二维数组，温度值或null（无效像素）
      statistics: {
        minTemp: parseFloat(minTempC.toFixed(2)),
        maxTemp: parseFloat(maxTempC.toFixed(2)),
        avgTemp: parseFloat(avgTempC.toFixed(2)),
        validPixels: validCount,
        totalPixels: pixelCount,
        pixelRange: {
          min: minPixel,
          max: maxPixel
        },
        resolution: resolution
      }
    }
    
    // 发送JSON格式的温度矩阵到前端
    broadcastToClients(JSON.stringify(thermalFrame))
    
    // 同时发送原始二进制帧给需要它的客户端
    broadcastToClients(frame, true)
    
  } catch (err) {
    console.error('❌ 处理热成像帧失败:', err)
  }
}

/**
 * 验证帧完整性
 */
function validateFrame(frame) {
  try {
    // 大小检查
    if (frame.length !== CONFIG.sensor.frameSize) {
      console.warn('帧大小不匹配:', frame.length)
      return false
    }
    
    // 帧头检查
    const header = frame.slice(0, 12).toString('ascii')
    if (header !== '   #2808GFRA') {
      console.warn('帧头不匹配:', header)
      return false
    }
    
    // CRC检查（可选）
    const crc = frame.slice(10252, 10256).toString('ascii')
    if (!/^[0-9A-F]{4}$/.test(crc)) {
      console.warn('CRC格式无效:', crc)
      // 不返回false，继续尝试
    }
    
    return true
  } catch (err) {
    console.error('帧验证错误:', err.message)
    return false
  }
}

/**
 * 计算CRC校验和（与ESP32源码相同的算法）
 */
function calculateCRC(data) {
  let crcResult = 0
  for (let i = 0; i < data.length; i++) {
    crcResult += data.charCodeAt(i)
  }
  return (crcResult & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
}

/**
 * 广播消息到所有WebSocket客户端
 */
function broadcastToClients(data, isBinary = false) {
  if (wsClients.size === 0) return
  
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data, { binary: isBinary })
      } catch (err) {
        console.error('发送数据到客户端失败:', err.message)
      }
    }
  })
}

/**
 * 安排重连
 */
function scheduleReconnect() {
  if (!CONFIG.reconnect.enabled) return
  
  if (CONFIG.reconnect.maxRetries !== -1 && 
      reconnectAttempts >= CONFIG.reconnect.maxRetries) {
    console.error(`❌ 达到最大重连次数 (${CONFIG.reconnect.maxRetries})，停止重连`)
    return
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
  
  reconnectAttempts++
  const delay = CONFIG.reconnect.interval
  
  console.log(`🔄 将在 ${delay/1000} 秒后重连... (尝试 ${reconnectAttempts})`)
  
  reconnectTimer = setTimeout(() => {
    connectToESP32()
  }, delay)
}

/**
 * 打印统计信息
 */
function printStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000)
  const hours = Math.floor(uptime / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)
  const seconds = uptime % 60
  
  console.log('\n📊 统计信息:')
  console.log(`   运行时间: ${hours}h ${minutes}m ${seconds}s`)
  console.log(`   ESP32状态: ${tcpClient ? '✅ 已连接' : '❌ 未连接'}`)
  console.log(`   WebSocket客户端: ${stats.connectedClients}`)
  console.log(`   接收数据: ${formatBytes(stats.bytesReceived)}`)
  console.log(`   发送数据: ${formatBytes(stats.bytesSent)}`)
  console.log(`   处理帧数: ${stats.framesProcessed}`)
  console.log(`   丢弃帧数: ${stats.framesDropped}`)
  console.log(`   缓冲区大小: ${tcpDataBuffer.length} 字节`)
  if (stats.framesProcessed > 0) {
    console.log(`   温度范围: ${stats.tempMin.toFixed(1)}°C ~ ${stats.tempMax.toFixed(1)}°C (平均: ${stats.tempAvg.toFixed(1)}°C)`)
  }
  console.log('')
}

/**
 * 格式化字节数
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

/**
 * 优雅关闭
 */
function gracefulShutdown() {
  console.log('\n🛑 正在关闭服务器...')
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
  
  if (tcpClient) {
    tcpClient.destroy()
  }
  
  if (wsServer) {
    wsClients.forEach(client => {
      client.close(1000, 'Server shutting down')
    })
    wsServer.close(() => {
      console.log('✅ WebSocket服务器已关闭')
    })
  }
  
  printStats()
  
  setTimeout(() => {
    process.exit(0)
  }, 1000)
}

/**
 * 主函数
 */
function main() {
  console.log('🌡️  Waveshare热成像模块后端处理版')
  console.log('=====================================')
  console.log(`ESP32地址: ${CONFIG.esp32.host}:${CONFIG.esp32.port}`)
  console.log(`WebSocket端口: ${CONFIG.websocket.port}`)
  console.log(`传感器: ${CONFIG.sensor.width}×${CONFIG.sensor.height}像素`)
  console.log(`分辨率: 0.${CONFIG.sensor.resolution === 100 ? '01' : '1'}°C`)
  console.log('=====================================\n')
  
  // 创建WebSocket服务器
  createWebSocketServer()
  
  // 连接到ESP32
  setTimeout(() => {
    connectToESP32()
  }, 1000)
  
  // 定期打印统计信息
  setInterval(printStats, 60000)  // 每分钟
  
  // 处理退出信号
  process.on('SIGINT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)
  
  // 处理未捕获的异常
  process.on('uncaughtException', (err) => {
    console.error('❌ 未捕获的异常:', err)
  })
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason)
  })
}

// 启动服务器
main()
