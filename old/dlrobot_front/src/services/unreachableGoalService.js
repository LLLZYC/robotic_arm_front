// 无法到达目标服务
// 处理无法到达的目标事件，显示通知并在地图上标记

class UnreachableGoalService {
  constructor() {
    this.robotStore = null
  }

  // 初始化store
  initStore(robotStore) {
    this.robotStore = robotStore
  }

  // 处理无法到达目标事件
  handleUnreachableGoal(message) {
    try {
      const goalData = JSON.parse(message.payloadString)
      console.log('收到无法到达目标事件:', goalData)

      // 显示通知
      this.showUnreachableGoalNotification(goalData)

      // 在地图上标记该点
      if (this.robotStore) {
        this.robotStore.addUnreachableGoal(goalData)
      }
    } catch (error) {
      console.error('解析无法到达目标消息失败:', error)
    }
  }

  // 显示无法到达目标通知
  showUnreachableGoalNotification(goalData) {
    // 创建通知元素
    const notification = document.createElement('div')
    notification.className = 'unreachable-goal-notification'
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-header">
          <span class="notification-icon">⚠️</span>
          <span class="notification-title">路径点无法到达</span>
        </div>
        <div class="notification-body">
          路径点 <strong>${goalData.goal_name}</strong> 无法到达，已跳过，请检查是否有杂物阻挡。
        </div>
        <div class="notification-footer">
          <button class="notification-close-btn">关闭</button>
        </div>
      </div>
    `

    // 添加样式
    notification.style.position = 'fixed'
    notification.style.top = '20px'
    notification.style.right = '20px'
    notification.style.zIndex = '9999'
    notification.style.backgroundColor = '#fff3cd'
    notification.style.border = '1px solid #ffeeba'
    notification.style.borderRadius = '8px'
    notification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
    notification.style.maxWidth = '400px'
    notification.style.padding = '0'
    notification.style.marginBottom = '10px'
    notification.style.animation = 'slideInRight 0.3s ease-out'

    // 添加到页面
    document.body.appendChild(notification)

    // 添加关闭按钮事件
    const closeBtn = notification.querySelector('.notification-close-btn')
    closeBtn.addEventListener('click', () => {
      notification.style.animation = 'slideOutRight 0.3s ease-out'
      setTimeout(() => {
        document.body.removeChild(notification)
      }, 300)
    })

    // 自动关闭
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideOutRight 0.3s ease-out'
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification)
          }
        }, 300)
      }
    }, 8000) // 8秒后自动关闭
  }
}

// 创建单例
const unreachableGoalService = new UnreachableGoalService()

// 添加CSS动画
function addUnreachableGoalStyles() {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }

    .unreachable-goal-notification {
      /* 其他样式已在JS中设置 */
    }

    .notification-content {
      padding: 15px;
    }

    .notification-header {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }

    .notification-icon {
      margin-right: 10px;
      font-size: 20px;
    }

    .notification-title {
      font-weight: bold;
      font-size: 16px;
    }

    .notification-body {
      margin-bottom: 15px;
      line-height: 1.4;
    }

    .notification-footer {
      text-align: right;
    }

    .notification-close-btn {
      background: #ffc107;
      color: #212529;
      border: none;
      padding: 5px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
    }

    .notification-close-btn:hover {
      background: #e0a800;
    }
  `
  document.head.appendChild(style)
}

// 初始化样式
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addUnreachableGoalStyles)
  } else {
    addUnreachableGoalStyles()
  }
}

export default unreachableGoalService