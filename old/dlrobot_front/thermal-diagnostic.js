#!/usr/bin/env node

/**
 * 热成像数据流诊断工具
 * 用于检测ESP32数据帧的完整性和格式
 */

import net from 'net'
import dotenv from 'dotenv'

dotenv.config()

const CONFIG = {
  esp32: {
    host: process.env.ESP32_HOST || '192.168.1.100',
    port: parseInt(process.env.ESP32_PORT) || 3333
  }
}

const FRAME_SIZE = 10256
const FRAME_HEADER = Buffer.from('   #2808GFRA', 'ascii')

let dataBuffer = Buffer.alloc(0)
let stats = {
  totalBytes: 0,
  validFrames: 0,
  invalidFrames: 0,
  partialFrames: 0,
  headerOffsets: [],
  startTime: Date.now()
}

console.log('🔍 热成像数据流诊断工具')
console.log('========================')
console.log(`ESP32地址: ${CONFIG.esp32.host}:${CONFIG.esp32.port}`)
console.log('正在连接...\n')

const client = new net.Socket()

client.connect(CONFIG.esp32.port, CONFIG.esp32.host, () => {
  console.log('✅ 已连接到ESP32')
  console.log('开始接收数据...\n')
  
  // 发送启动采集命令
  const cmdData = '0010WREGB103'
  const crc = calculateCRC(cmdData)
  const startCmd = `   #${cmdData}${crc}\n`
  client.write(startCmd)
  console.log('📤 已发送启动采集命令\n')
})

client.on('data', (data) => {
  stats.totalBytes += data.length
  dataBuffer = Buffer.concat([dataBuffer, data])
  
  // 处理完整帧
  while (dataBuffer.length >= FRAME_SIZE) {
    // 查找帧头
    let frameStart = dataBuffer.indexOf(FRAME_HEADER)
    
    if (frameStart === -1) {
      console.warn(`⚠️  未找到帧头，缓冲区大小: ${dataBuffer.length}`)
      console.warn(`   前16字节: ${dataBuffer.slice(0, 16).toString('hex')}`)
      dataBuffer = dataBuffer.slice(-11)
      stats.partialFrames++
      break
    }
    
    if (frameStart > 0) {
      console.warn(`⚠️  帧头偏移 ${frameStart} 字节`)
      stats.headerOffsets.push(frameStart)
      dataBuffer = dataBuffer.slice(frameStart)
    }
    
    if (dataBuffer.length < FRAME_SIZE) {
      break
    }
    
    const frame = dataBuffer.slice(0, FRAME_SIZE)
    
    if (validateFrame(frame)) {
      stats.validFrames++
      console.log(`✅ 有效帧 #${stats.validFrames}`)
      analyzeFrame(frame)
    } else {
      stats.invalidFrames++
      console.error(`❌ 无效帧 #${stats.invalidFrames}`)
    }
    
    dataBuffer = dataBuffer.slice(FRAME_SIZE)
  }
  
  // 每10秒打印统计
  const elapsed = Date.now() - stats.startTime
  if (elapsed > 0 && stats.validFrames % 100 === 0 && stats.validFrames > 0) {
    printStats()
  }
})

client.on('error', (err) => {
  console.error(`❌ 连接错误: ${err.message}`)
  process.exit(1)
})

client.on('close', () => {
  console.log('\n🔌 连接已关闭')
  printStats()
  process.exit(0)
})

function validateFrame(frame) {
  if (frame.length !== FRAME_SIZE) {
    console.error(`  大小错误: ${frame.length} (期望 ${FRAME_SIZE})`)
    return false
  }
  
  const header = frame.slice(0, 12)
  if (!header.equals(FRAME_HEADER)) {
    console.error(`  帧头错误: ${header.toString('ascii')}`)
    return false
  }
  
  const crc = frame.slice(10252, 10256).toString('ascii')
  if (!/^[0-9A-F]{4}$/.test(crc)) {
    console.warn(`  CRC格式警告: ${crc}`)
  }
  
  return true
}

function analyzeFrame(frame) {
  // 提取像素数据（80×63 = 5040像素）
  const pixelData = []
  const PIXEL_COUNT = 80 * 63  // 实际像素数
  const sampleSize = Math.min(100, PIXEL_COUNT)  // 采样前100个像素
  
  for (let i = 0; i < sampleSize; i++) {
    const offset = 172 + i * 2
    const value = frame.readUInt16LE(offset)
    pixelData.push(value)
  }
  
  const min = Math.min(...pixelData) / 100
  const max = Math.max(...pixelData) / 100
  const avg = pixelData.reduce((a, b) => a + b, 0) / pixelData.length / 100
  
  console.log(`   温度范围: ${min.toFixed(1)}°C ~ ${max.toFixed(1)}°C (平均: ${avg.toFixed(1)}°C)`)
  
  const crc = frame.slice(10252, 10256).toString('ascii')
  console.log(`   CRC: ${crc}`)
}

function printStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000
  const fps = stats.validFrames / elapsed
  
  console.log('\n📊 诊断统计:')
  console.log(`   运行时间: ${elapsed.toFixed(1)}秒`)
  console.log(`   接收数据: ${formatBytes(stats.totalBytes)}`)
  console.log(`   有效帧数: ${stats.validFrames}`)
  console.log(`   无效帧数: ${stats.invalidFrames}`)
  console.log(`   部分帧数: ${stats.partialFrames}`)
  console.log(`   平均帧率: ${fps.toFixed(2)} FPS`)
  console.log(`   缓冲区大小: ${dataBuffer.length} 字节`)
  
  if (stats.headerOffsets.length > 0) {
    console.log(`\n⚠️  帧头偏移统计:`)
    console.log(`   总次数: ${stats.headerOffsets.length}`)
    console.log(`   平均偏移: ${(stats.headerOffsets.reduce((a, b) => a + b, 0) / stats.headerOffsets.length).toFixed(0)} 字节`)
    console.log(`   最大偏移: ${Math.max(...stats.headerOffsets)} 字节`)
    console.log(`   最小偏移: ${Math.min(...stats.headerOffsets)} 字节`)
  }
  
  console.log('')
}

function calculateCRC(data) {
  let crcResult = 0
  for (let i = 0; i < data.length; i++) {
    crcResult += data.charCodeAt(i)
  }
  return (crcResult & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n🛑 收到退出信号')
  printStats()
  client.destroy()
  process.exit(0)
})
