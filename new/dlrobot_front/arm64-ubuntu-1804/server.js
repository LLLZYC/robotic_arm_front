const express = require('express')
const path = require('path')
const compression = require('compression')

const app = express()
const PORT = process.env.PORT || 3000

// ARM64 Ubuntu 18.04 生产服务器配置

// Gzip压缩
app.use(compression())

// 静态文件服务
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1y', // 长期缓存
  etag: false,  // 禁用ETag以减少计算
  lastModified: false
}))

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    memory: process.memoryUsage()
  })
})

// 所有路由都返回index.html（SPA支持）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// 优雅关闭处理
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...')
  process.exit(0)
})

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ARM64 Ubuntu 18.04 服务器运行在 http://0.0.0.0:${PORT}`)
  console.log(`📊 平台: ${process.platform} ${process.arch}`)
  console.log(`💾 内存: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`)
  console.log(`🔗 健康检查: http://localhost:${PORT}/health`)
})

// 错误处理
app.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error
  }
  
  switch (error.code) {
    case 'EACCES':
      console.error(`端口 ${PORT} 需要权限`)
      process.exit(1)
      break
    case 'EADDRINUSE':
      console.error(`端口 ${PORT} 已被占用`)
      process.exit(1)
      break
    default:
      throw error
  }
})