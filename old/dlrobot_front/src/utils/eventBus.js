// 事件总线，用于组件间通信
import { ref } from 'vue'

// 创建事件总线
const bus = {
  // 地图实例
  map: null,

  // 事件监听器
  listeners: {},
  // 在地图就绪后要执行的任务队列（用于排队渲染/清理请求）
  _mapReadyQueue: [],

  // 注册事件
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  },

  // 触发事件
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data))
    }
  },

  // 移除事件监听器
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
    }
  },

  // 设置地图实例
  setMap(map) {
    this.map = map

    // 如果传入 null/undefined，表示地图已被卸载，清除引用并通知订阅者
    if (!map) {
      try { this.emit('map-unset', null) } catch (e) { /* ignore */ }
      // 不执行 _mapReadyQueue，保留队列以便下次 map 再次设置后继续执行
      return
    }

    this.emit('map-ready', map)
    // 执行队列中的任务（按注册顺序）
    try {
      while (this._mapReadyQueue && this._mapReadyQueue.length > 0) {
        const fn = this._mapReadyQueue.shift()
        try { fn(map) } catch (e) { console.warn('eventBus: 执行 mapReady 队列任务失败', e) }
      }
    } catch (e) {
      console.warn('eventBus: 处理 mapReady 队列失败', e)
    }
  },

  // 获取地图实例
  getMap() {
    return this.map
  }

  ,

  // 如果地图已准备好则立即执行，否则将任务加入队列，在 setMap 时执行
  runWhenMapReady(fn) {
    if (this.map) {
      try { fn(this.map) } catch (e) { console.warn('eventBus: runWhenMapReady 执行失败', e) }
    } else {
      this._mapReadyQueue.push(fn)
    }
  }
}

// 导出为ref对象
export const eventBus = ref(bus)
