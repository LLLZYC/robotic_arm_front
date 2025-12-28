// 模拟机器人服务，用于测试各种功能
class MockRobotService {
  constructor() {
    this.isRunning = false
    this.intervalId = null
    this.moveTimerId = null
    this.moveStart = null
    this.moveGoal = null
    this.moveStartTime = null
    this.moveDuration = null
    this.moveSpeed = 0.8 // m/s
    this.mapConfig = {
      resolution: 0.05,
      origin: { x: -10, y: -10 },
      width: 400,
      height: 400,
      image: '/map.png'
    }
    this.currentPose = { x: 7, y: 0.8, theta: 0 }
    this.navigationStatus = 'idle'
    this.unreachableGoals = []
    this.laserScanData = []
    this.cameraImage = null
    this.debugMove = false // set to true to log per-tick movement diagnostics
    this.moveToken = 0 // incremented for each move start/cancel to avoid stale ticks
    this.currentMoveToken = null
  }

  // 启动模拟
  start() {
    if (this.isRunning) return

    this.isRunning = true
    console.log('机器人模拟服务已启动')

    // 初始化激光扫描数据
    this.initLaserScan()

    // 只更新传感器数据，不再定期更新机器人位置
    this.intervalId = setInterval(() => {
      this.updateSensorData()
    }, 1000)

    // 初始化地图
    this.initMap()

    // 模拟连接成功
    setTimeout(() => {
      this.simulateConnectionSuccess()
    }, 1000)
  }

  // 停止模拟
  stop() {
    if (!this.isRunning) return

    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    // 取消任何正在进行的移动
    try { this.cancelCurrentMove() } catch (e) {}
    this.navigationStatus = 'idle'
    if (window.robotStore) {
      window.robotStore.updateNavigationStatus('idle')
    }
    console.log('机器人模拟服务已停止')
  }

  // 初始化激光扫描数据
  initLaserScan() {
    // 创建360度的激光扫描数据
    const numPoints = 360
    this.laserScanData = []

    for (let i = 0; i < numPoints; i++) {
      const angle = (i * Math.PI) / 180 // 转换为弧度
      const range = 1 + Math.random() * 4 // 1-5米的随机范围

      this.laserScanData.push({
        angle: angle,
        range: range
      })
    }
  }

  // 更新机器人位置
  updateRobotPose() {
    // 不再随机移动机器人，保持当前位置
    // 机器人位置只在用户点击地图设置目标时更新
    
    // 限制在地图范围内
    this.currentPose.x = Math.max(-9, Math.min(9, this.currentPose.x))
    this.currentPose.y = Math.max(-9, Math.min(9, this.currentPose.y))

    // 更新store中的机器人位置
    if (window.robotStore) {
      window.robotStore.updateRobotPose(this.currentPose)
    }
  }

  // 取消当前移动模拟
  cancelCurrentMove() {
    if (this.moveTimerId) {
      clearInterval(this.moveTimerId)
      this.moveTimerId = null
    }
    this.moveStart = null
    this.moveGoal = null
    this.moveStartTime = null
    this.moveDuration = null
    // invalidate any running move token so pending ticks ignore completion
    try { this.moveToken++; this.currentMoveToken = null } catch (e) {}
  }

  // 更新传感器数据
  updateSensorData() {
    // 更新激光扫描数据
    if (window.robotStore) {
      window.robotStore.updateSensorData('laserScan', this.laserScanData)
    }

    // 模拟相机图像更新（每5秒一次）
    if (Math.random() < 0.2 && window.robotStore) {
      // 模拟base64图像数据
      const mockImageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
      window.robotStore.updateSensorData('cameraImage', mockImageData)
    }
  }

  // 初始化地图
  initMap() {
    if (window.robotStore) {
      window.robotStore.setMapData(this.mapConfig)
    }
  }

  // 模拟连接成功
  simulateConnectionSuccess() {
    if (window.robotStore) {
      window.robotStore.setMqttConnected(true)
    }
    console.log('模拟: MQTT连接成功')
  }

  // 模拟无法到达目标
  simulateUnreachableGoal(goalName, position) {
    const goalData = {
      goal_name: goalName,
      position: position,
      header: {
        stamp: {
          secs: Math.floor(Date.now() / 1000),
          nsecs: (Date.now() % 1000) * 1000000
        },
        frame_id: "map"
      }
    }

    // 调用无法到达目标服务
    if (window.unreachableGoalService) {
      const mockMessage = {
        payloadString: JSON.stringify(goalData)
      }
      window.unreachableGoalService.handleUnreachableGoal(mockMessage)
    }

    // 更新导航状态
    this.navigationStatus = 'failed'
    if (window.robotStore) {
      window.robotStore.updateNavigationStatus('failed')
    }

    console.log('模拟: 无法到达目标', goalName)
  }

  // 设置导航状态
  setNavigationStatus(status) {
    this.navigationStatus = status
    // 如果切换到非导航状态，取消正在进行的移动
    if (status !== 'navigating') {
      try { this.cancelCurrentMove() } catch (e) {}
    }
    if (window.robotStore) {
      window.robotStore.updateNavigationStatus(status)
    }
  }

  // 发送目标位置（模拟）
  // Accepts optional second parameter `startOverride` to use a frozen start pose
  // provided by caller. Signature: sendGoalPosition(goal, startOverride)
  sendGoalPosition(goal, startOverride) {
    console.log('模拟: 发送目标位置', goal, 'time:', new Date().toISOString())

    // Diagnostic: log authoritative mock pose and store pose at send time
    try {
      console.log('模拟: sendGoalPosition currentPose (mock):', this.currentPose)
      if (window && window.robotStore && window.robotStore.robotPose) {
        console.log('模拟: sendGoalPosition robotPose (store):', window.robotStore.robotPose)
      }
    } catch (e) {
      console.warn('模拟: sendGoalPosition diagnostics failed', e)
    }
    // Cancel any previous move
    this.cancelCurrentMove()

    // Prepare move interpolation
    // We may have multiple candidates for the "start" pose: the mock's internal
    // `currentPose` and the `window.robotStore.robotPose`. In some race cases one
    // of them may have been set to the goal already (causing zero-distance moves).
    // Choose the candidate that is farthest from the goal to avoid accidental
    // start==goal cases.
    const candidates = []
    if (this.currentPose && typeof this.currentPose.x !== 'undefined') {
      candidates.push({ source: 'mock', pose: { ...this.currentPose } })
    }
    if (window && window.robotStore && window.robotStore.robotPose) {
      try {
        candidates.push({ source: 'store', pose: { ...window.robotStore.robotPose } })
      } catch (e) {
        // defensive: if reading store throws, ignore
      }
    }
    // fallback default
    if (candidates.length === 0) {
      candidates.push({ source: 'fallback', pose: { x: 0, y: 0, theta: 0 } })
    }

    const end = { x: Number(goal.x), y: Number(goal.y), theta: Number(goal.yaw || 0) }
    // If caller supplied a startOverride, use that as authoritative start.
    let start
    if (startOverride && typeof startOverride.x !== 'undefined') {
      start = { ...startOverride }
      console.log('模拟: sendGoalPosition using startOverride from caller ->', start, 'time:', new Date().toISOString())
    } else {
      // compute distance for each candidate and pick the one farthest from goal
      start = candidates[0].pose
      try {
        let best = { idx: 0, dist: -1 }
        candidates.forEach((c, i) => {
          const dx_c = end.x - (c.pose.x || 0)
          const dy_c = end.y - (c.pose.y || 0)
          const d = Math.sqrt(dx_c * dx_c + dy_c * dy_c)
          if (d > best.dist) {
            best = { idx: i, dist: d }
          }
        })
        start = candidates[best.idx].pose
        if (candidates.length > 1) {
          console.log('模拟: sendGoalPosition selected start candidate', candidates.map(c => c.source), 'selected:', candidates[best.idx].source, 'time:', new Date().toISOString())
        }
      } catch (e) {
        // fallback to first candidate
        start = candidates[0].pose
      }
    }
    let dx = end.x - start.x
    let dy = end.y - start.y
    let distance = Math.sqrt(dx * dx + dy * dy)

    // If distance is extremely small (start ~= end), nudge the start slightly
    // backwards from the goal along its yaw to avoid zero-distance immediate arrival
    if (distance < 0.02) {
      // Increase nudge distance slightly to make the robot visibly move and
      // avoid immediate arrival when start is extremely close to end.
      const nudge = 0.1 // meters
      const ex = end.x - Math.cos(end.theta || 0) * nudge
      const ey = end.y - Math.sin(end.theta || 0) * nudge
      console.log('模拟: 距离过小，微调起点以避免零距离到达，nudge start->', { ex, ey })
      start.x = ex
      start.y = ey
      dx = end.x - start.x
      dy = end.y - start.y
      distance = Math.sqrt(dx * dx + dy * dy)
    }

    // Duration based on speed, with a minimum duration
    // Increase minimum duration to make very short moves still visible
    const minDuration = 800 // ms
    const duration = Math.max(minDuration, (distance / this.moveSpeed) * 1000)

    this.moveStart = start
    this.moveGoal = end
    this.moveStartTime = Date.now()
    this.moveDuration = duration
    console.log(`模拟: move start=${JSON.stringify(start)} end=${JSON.stringify(end)} distance=${distance.toFixed(3)} duration=${this.moveDuration}ms`)

    // bump token and capture for this move so cancelCurrentMove can invalidate
    try { this.moveToken++; this.currentMoveToken = this.moveToken } catch (e) {}

    this.navigationStatus = 'navigating'
    // Immediately write the authoritative start pose into the mock and store.
    // This prevents races where the global store already equals the goal
    // (causing zero-distance moves) — by forcing the start to be the one the
    // caller intended, we ensure visible motion.
    this.currentPose = { x: start.x, y: start.y, theta: start.theta }
    if (window.robotStore) {
      try { window.robotStore.updateRobotPose(this.currentPose) } catch (e) { console.warn('模拟: 同步起点到 store 失败', e) }
      try { window.robotStore.updateNavigationStatus('navigating') } catch (e) {}
      // Delay setting the authoritative goal into store briefly so that
      // map/store watchers have time to process the start snapshot and avoid
      // race conditions that could make start==goal appear instantaneously.
      try {
        setTimeout(() => {
          try { window.robotStore.setGoalPose(goal) } catch (e) { console.warn('模拟: 延迟写入 goalPose 失败', e) }
        }, 50)
      } catch (e) {
        try { window.robotStore.setGoalPose(goal) } catch (e2) { console.warn('模拟: 写入 goalPose 失败', e2) }
      }
    }

    // Tick at 100ms
    const myToken = this.currentMoveToken
    this.moveTimerId = setInterval(() => {
      // if token changed, this move has been cancelled/replaced
      if (myToken !== this.currentMoveToken) {
        // clear this interval in case cancel did not run in time
        try { if (this.moveTimerId) { clearInterval(this.moveTimerId); this.moveTimerId = null } } catch(e){}
        return
      }

      const now = Date.now()
      const elapsed = now - this.moveStartTime
      const t = Math.min(1, elapsed / this.moveDuration)

      // linear interpolate x,y
      const nx = this.moveStart.x + (this.moveGoal.x - this.moveStart.x) * t
      const ny = this.moveStart.y + (this.moveGoal.y - this.moveStart.y) * t

      // shortest angle interpolation for theta
      const a0 = this.moveStart.theta || 0
      const a1 = this.moveGoal.theta || 0
      let dtheta = a1 - a0
      while (dtheta > Math.PI) dtheta -= 2 * Math.PI
      while (dtheta < -Math.PI) dtheta += 2 * Math.PI
      const nth = a0 + dtheta * t

      this.currentPose = { x: nx, y: ny, theta: nth }
      // clamp to map bounds
      this.currentPose.x = Math.max(-1000, Math.min(1000, this.currentPose.x))
      this.currentPose.y = Math.max(-1000, Math.min(1000, this.currentPose.y))

      // 更新到 store
      if (window.robotStore) {
        window.robotStore.updateRobotPose(this.currentPose)
      }

      if (this.debugMove) {
        console.log(`mockRobotService.tick t=${t.toFixed(3)} pose=${JSON.stringify(this.currentPose)} token=${myToken}`)
      }

      // 完成 — 再次校验 token
      if (t >= 1) {
        // ensure this completion is still valid
        if (myToken !== this.currentMoveToken) {
          // stale completion, ignore
          try { if (this.moveTimerId) { clearInterval(this.moveTimerId); this.moveTimerId = null } } catch(e){}
          return
        }
        this.cancelCurrentMove()
        this.navigationStatus = 'arrived'
        if (window.robotStore) {
          window.robotStore.updateNavigationStatus('arrived')
        }
        console.log('模拟: 到达目标位置', end)
      }
    }, 100)
  }
}

// 创建单例
const mockRobotService = new MockRobotService()

// 导出服务
export default mockRobotService