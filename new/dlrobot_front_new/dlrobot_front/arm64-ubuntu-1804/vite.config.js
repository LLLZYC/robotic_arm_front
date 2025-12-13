import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  
  // ARM64 Ubuntu 18.04 优化配置
  server: {
    host: '0.0.0.0',
    port: 3000,
    // 针对低内存设备的优化
    hmr: {
      overlay: false // 禁用热重载覆盖层以减少内存使用
    }
  },
  
  build: {
    // 构建优化
    target: 'es2015', // 兼容旧版浏览器
    minify: 'terser', // 使用terser进行更好的压缩
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除console
        drop_debugger: true
      }
    },
    
    // 分块优化
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          leaflet: ['leaflet'],
          mqtt: ['paho-mqtt']
        }
      }
    },
    
    // 内存使用优化
    chunkSizeWarningLimit: 1000,
    
    // 源映射配置
    sourcemap: false // 生产环境禁用sourcemap以节省空间
  },
  
  // 预加载优化
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'axios']
  }
})