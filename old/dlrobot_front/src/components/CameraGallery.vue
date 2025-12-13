<template>
  <div class="camera-gallery">
    <div class="gallery-header">
      <h3>📷 相机图像库</h3>
      <div class="header-controls">
        <button @click="refreshImages" class="refresh-btn" :disabled="loading">
          {{ loading ? '加载中...' : '🔄 刷新' }}
        </button>
        <button @click="toggleAutoRefresh" :class="['auto-refresh-btn', { active: autoRefresh }]">
          {{ autoRefresh ? '⏸ 停止自动刷新' : '▶ 自动刷新' }}
        </button>
      </div>
    </div>

    <div class="gallery-info">
      <div class="info-item">
        <span>图像路径:</span>
        <span class="path">{{ imagePath }}</span>
      </div>
      <div class="info-item">
        <span>图像数量:</span>
        <span class="count">{{ images.length }}</span>
      </div>
      <div class="info-item">
        <span>最后更新:</span>
        <span class="time">{{ lastUpdateTime }}</span>
      </div>
    </div>

    <div v-if="error" class="error-message">
      <p>⚠️ {{ error }}</p>
      <button @click="refreshImages" class="retry-btn">重试</button>
    </div>

    <div v-if="loading && images.length === 0" class="loading-state">
      <div class="spinner"></div>
      <p>正在加载图像...</p>
    </div>

    <div v-if="!loading && images.length === 0 && !error" class="empty-state">
      <p>📁 暂无图像</p>
      <p class="hint">请确保相机正在运行并保存图像到 {{ imagePath }}</p>
    </div>

    <div v-if="images.length > 0" class="gallery-grid">
      <div 
        v-for="(image, index) in images" 
        :key="image.name"
        class="image-card"
        @click="openImagePreview(image, index)">
        <div class="image-wrapper">
          <img 
            :src="image.url" 
            :alt="image.name"
            @error="handleImageError(image)"
            loading="lazy"
          />
          <div class="image-overlay">
            <span class="image-name">{{ image.name }}</span>
            <span class="image-time">{{ formatTime(image.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 图像预览模态框 -->
    <div v-if="previewImage" class="preview-modal" @click="closePreview">
      <div class="preview-content" @click.stop>
        <button class="close-btn" @click="closePreview">✕</button>
        <button class="nav-btn prev-btn" @click="prevImage" v-if="previewIndex > 0">‹</button>
        <button class="nav-btn next-btn" @click="nextImage" v-if="previewIndex < images.length - 1">›</button>
        
        <div class="preview-image-wrapper">
          <img :src="previewImage.url" :alt="previewImage.name" />
        </div>
        
        <div class="preview-info">
          <h4>{{ previewImage.name }}</h4>
          <p>时间: {{ formatTime(previewImage.timestamp) }}</p>
          <p>大小: {{ formatFileSize(previewImage.size) }}</p>
          <div class="preview-actions">
            <a :href="previewImage.url" :download="previewImage.name" class="download-btn">
              💾 下载
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRobotStore } from '../stores/robotStore'

export default {
  name: 'CameraGallery',
  
  setup() {
    const robotStore = useRobotStore()
    
    const images = ref([])
    const loading = ref(false)
    const error = ref(null)
    const autoRefresh = ref(false)
    const refreshInterval = ref(null)
    const lastUpdateTime = ref('')
    const previewImage = ref(null)
    const previewIndex = ref(-1)
    
    const imagePath = computed(() => robotStore.config.cameraImagePath || '/home/dlrobot_autocontrol')
    
    // 获取图像列表
    const fetchImages = async () => {
      loading.value = true
      error.value = null
      
      try {
        // 调用后端API获取图像列表
        const response = await fetch(`${robotStore.config.restApiUrl}/api/camera/images?path=${encodeURIComponent(imagePath.value)}`)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        // 处理图像数据
        images.value = data.images.map(img => ({
          name: img.name,
          url: `${robotStore.config.restApiUrl}/api/camera/image/${encodeURIComponent(img.path)}`,
          timestamp: img.timestamp,
          size: img.size,
          path: img.path
        }))
        
        lastUpdateTime.value = new Date().toLocaleTimeString('zh-CN')
        
      } catch (err) {
        console.error('获取图像列表失败:', err)
        error.value = err.message || '无法连接到服务器'
      } finally {
        loading.value = false
      }
    }
    
    // 刷新图像
    const refreshImages = () => {
      fetchImages()
    }
    
    // 切换自动刷新
    const toggleAutoRefresh = () => {
      autoRefresh.value = !autoRefresh.value
      
      if (autoRefresh.value) {
        refreshImages()
        refreshInterval.value = setInterval(refreshImages, 5000) // 每5秒刷新
      } else {
        if (refreshInterval.value) {
          clearInterval(refreshInterval.value)
          refreshInterval.value = null
        }
      }
    }
    
    // 处理图像加载错误
    const handleImageError = (image) => {
      console.error('图像加载失败:', image.name)
    }
    
    // 打开图像预览
    const openImagePreview = (image, index) => {
      previewImage.value = image
      previewIndex.value = index
    }
    
    // 关闭预览
    const closePreview = () => {
      previewImage.value = null
      previewIndex.value = -1
    }
    
    // 上一张图片
    const prevImage = () => {
      if (previewIndex.value > 0) {
        previewIndex.value--
        previewImage.value = images.value[previewIndex.value]
      }
    }
    
    // 下一张图片
    const nextImage = () => {
      if (previewIndex.value < images.value.length - 1) {
        previewIndex.value++
        previewImage.value = images.value[previewIndex.value]
      }
    }
    
    // 格式化时间
    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      const date = new Date(timestamp)
      return date.toLocaleString('zh-CN')
    }
    
    // 格式化文件大小
    const formatFileSize = (bytes) => {
      if (!bytes) return '-'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
    
    // 键盘导航
    const handleKeydown = (e) => {
      if (!previewImage.value) return
      
      if (e.key === 'Escape') {
        closePreview()
      } else if (e.key === 'ArrowLeft') {
        prevImage()
      } else if (e.key === 'ArrowRight') {
        nextImage()
      }
    }
    
    onMounted(() => {
      fetchImages()
      window.addEventListener('keydown', handleKeydown)
    })
    
    onUnmounted(() => {
      if (refreshInterval.value) {
        clearInterval(refreshInterval.value)
      }
      window.removeEventListener('keydown', handleKeydown)
    })
    
    return {
      images,
      loading,
      error,
      autoRefresh,
      lastUpdateTime,
      imagePath,
      previewImage,
      previewIndex,
      refreshImages,
      toggleAutoRefresh,
      handleImageError,
      openImagePreview,
      closePreview,
      prevImage,
      nextImage,
      formatTime,
      formatFileSize
    }
  }
}
</script>

<style scoped>
.camera-gallery {
  height: 100%;
  background: #1a202c;
  padding: 20px;
  overflow-y: auto;
}

.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #2d3748;
}

.gallery-header h3 {
  color: #e2e8f0;
  font-size: 18px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 10px;
}

.refresh-btn,
.auto-refresh-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn {
  background: #4299e1;
  color: white;
}

.refresh-btn:hover:not(:disabled) {
  background: #3182ce;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auto-refresh-btn {
  background: #2d3748;
  color: #a0aec0;
  border: 1px solid #4a5568;
}

.auto-refresh-btn.active {
  background: #48bb78;
  color: white;
  border-color: #48bb78;
}

.auto-refresh-btn:hover {
  background: #4a5568;
  color: #e2e8f0;
}

.gallery-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background: #2d3748;
  border-radius: 8px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-item span:first-child {
  color: #a0aec0;
  font-size: 12px;
}

.info-item .path {
  color: #4299e1;
  font-size: 14px;
  font-family: monospace;
  word-break: break-all;
}

.info-item .count {
  color: #48bb78;
  font-size: 20px;
  font-weight: 600;
}

.info-item .time {
  color: #e2e8f0;
  font-size: 14px;
}

.error-message {
  padding: 20px;
  background: rgba(245, 101, 101, 0.1);
  border: 1px solid rgba(245, 101, 101, 0.3);
  border-radius: 8px;
  text-align: center;
  color: #f56565;
  margin-bottom: 20px;
}

.retry-btn {
  margin-top: 10px;
  padding: 8px 16px;
  background: #f56565;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #a0aec0;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 20px;
  border: 4px solid #2d3748;
  border-top-color: #4299e1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 10px;
  color: #718096;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.image-card {
  background: #2d3748;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
}

.image-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

.image-wrapper {
  position: relative;
  padding-top: 75%; /* 4:3 aspect ratio */
  overflow: hidden;
}

.image-wrapper img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
  color: white;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s;
}

.image-card:hover .image-overlay {
  opacity: 1;
}

.image-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-time {
  font-size: 12px;
  color: #cbd5e0;
}

/* 预览模态框 */
.preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.preview-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 32px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.prev-btn {
  left: -70px;
}

.next-btn {
  right: -70px;
}

.preview-image-wrapper {
  max-width: 80vw;
  max-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image-wrapper img {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 8px;
}

.preview-info {
  background: rgba(45, 55, 72, 0.9);
  padding: 20px;
  border-radius: 8px;
  color: white;
}

.preview-info h4 {
  margin-bottom: 10px;
  color: #e2e8f0;
}

.preview-info p {
  margin: 5px 0;
  color: #a0aec0;
  font-size: 14px;
}

.preview-actions {
  margin-top: 15px;
  display: flex;
  gap: 10px;
}

.download-btn {
  padding: 8px 16px;
  background: #4299e1;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

.download-btn:hover {
  background: #3182ce;
}

/* 滚动条样式 */
.camera-gallery::-webkit-scrollbar {
  width: 6px;
}

.camera-gallery::-webkit-scrollbar-track {
  background: #2d3748;
}

.camera-gallery::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 3px;
}

.camera-gallery::-webkit-scrollbar-thumb:hover {
  background: #718096;
}
</style>
