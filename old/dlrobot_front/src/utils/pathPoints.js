import { rosToLeaflet } from './mapUtils'

// 辅助函数：安全获取坐标
const getPointData = (point) => {
  if (!point) return { x: 0, y: 0, yaw: 0, desc: '' }
  const x = point.x !== undefined ? point.x : (point.position ? point.position.x : 0)
  const y = point.y !== undefined ? point.y : (point.position ? point.position.y : 0)
  const yaw = point.yaw !== undefined ? point.yaw : (point.orientation ? point.orientation.yaw : (point.theta || 0))
  const desc = point.description || point.name || ''
  return { x, y, yaw, desc }
}

// 加载路径点
export const loadPathPoints = async () => {
  try {
    const response = await fetch('/path_points_test.yaml')
    const yamlText = await response.text()
    const lines = yamlText.split('\n')
    const pathPoints = []
    let inPathPoints = false
    let currentPoint = null

    for (const line of lines) {
      if (line.trim() === 'path_points:') {
        inPathPoints = true
        continue
      }
      if (inPathPoints && line.trim().startsWith('- point:')) {
        if (currentPoint) pathPoints.push(currentPoint)
        currentPoint = { x: 0, y: 0, yaw: 0 }
      } else if (inPathPoints && currentPoint) {
        const trimmedLine = line.trim()
        if (trimmedLine.startsWith('x:')) currentPoint.x = parseFloat(trimmedLine.split(':')[1].trim())
        else if (trimmedLine.startsWith('y:')) currentPoint.y = parseFloat(trimmedLine.split(':')[1].trim())
        else if (trimmedLine.startsWith('yaw:')) currentPoint.yaw = parseFloat(trimmedLine.split(':')[1].trim())
        else if (trimmedLine.startsWith('description:')) currentPoint.description = trimmedLine.split(':')[1].trim().replace(/"/g, '')
      }
    }
    if (currentPoint) pathPoints.push(currentPoint)
    return pathPoints
  } catch (error) {
    console.error('加载路径点失败:', error)
    return []
  }
}

// 在地图上显示路径点
export const displayPathPoints = async (map, pathPoints, pathMarkers, pathLine) => {
  if (!map || !pathPoints) return

  const L = await import('leaflet')

  // 清除现有标记
  if (pathMarkers && pathMarkers.value) {
    pathMarkers.value.forEach(marker => {
      if (map.hasLayer(marker)) map.removeLayer(marker)
    })
    pathMarkers.value = []
  }

  // 清除现有路径线
  if (pathLine && pathLine.value && map.hasLayer(pathLine.value)) {
    map.removeLayer(pathLine.value)
    pathLine.value = null
  }

  if (pathPoints.length === 0) return

  const pathCoords = []

  pathPoints.forEach((point, index) => {
    const { x, y, yaw, desc } = getPointData(point)
    const leafletCoords = rosToLeaflet(x, y)
    pathCoords.push(leafletCoords)

    const icon = L.divIcon({
      html: `<div class="path-point-marker">${index + 1}</div>`,
      className: 'path-point-marker-container',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })

    const marker = L.marker(leafletCoords, { icon })
      .addTo(map)
      .bindPopup(`路径点 ${index + 1}<br>坐标: (${x.toFixed(2)}, ${y.toFixed(2)})<br>朝向: ${yaw.toFixed(2)} rad<br>${desc}`)

    if (pathMarkers && pathMarkers.value) {
      pathMarkers.value.push(marker)
    }
  })

  // 绘制虚线路径
  if (pathLine) {
    pathLine.value = L.polyline(pathCoords, {
      color: '#38b2ac',
      weight: 3,
      opacity: 0.7,
      dashArray: '10, 5'
    }).addTo(map)
  }
}

// 高亮当前目标点
export const highlightCurrentTarget = async (map, pathPoints, currentTargetIndex, currentTargetMarker) => {
  if (!map || !pathPoints || !currentTargetIndex || !currentTargetMarker) return
  
  const idx = currentTargetIndex.value
  
  // 移除旧标记
  if (currentTargetMarker.value && map.hasLayer(currentTargetMarker.value)) {
    map.removeLayer(currentTargetMarker.value)
    currentTargetMarker.value = null
  }

  if (idx < 0 || idx >= pathPoints.length) return

  const L = await import('leaflet')
  const point = pathPoints[idx]
  const { x, y, yaw } = getPointData(point)
  const leafletCoords = rosToLeaflet(x, y)

  const icon = L.divIcon({
    html: '<div class="current-target-marker">🎯</div>',
    className: 'current-target-marker-container',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  })

  currentTargetMarker.value = L.marker(leafletCoords, { icon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(`当前目标: ${idx + 1}<br>坐标: (${x.toFixed(2)}, ${y.toFixed(2)})`)
}

// 添加轨迹点
export const addTrajectoryPoint = async (map, robotPose, trajectoryLine, trajectoryPoints) => {
  if (!map || !robotPose || !trajectoryLine || !trajectoryPoints) return

  const L = await import('leaflet')
  const leafletCoords = rosToLeaflet(robotPose.x, robotPose.y)

  trajectoryPoints.value.push(leafletCoords)

  if (trajectoryLine.value) {
    trajectoryLine.value.setLatLngs(trajectoryPoints.value)
  } else {
    trajectoryLine.value = L.polyline(trajectoryPoints.value, {
      color: '#e53e3e',
      weight: 3,
      opacity: 0.8
    }).addTo(map)
  }
}

// 清除路径点显示（修复：支持可选参数，传null则不清除轨迹）
export const clearPathDisplay = async (map, pathMarkers, pathLine, currentTargetMarker, trajectoryLine = null, trajectoryPoints = null) => {
  if (!map) return

  // 清除标记
  if (pathMarkers && pathMarkers.value) {
    pathMarkers.value.forEach(marker => {
      if (map.hasLayer(marker)) map.removeLayer(marker)
    })
    pathMarkers.value = []
  }

  // 清除路径线
  if (pathLine && pathLine.value) {
    if (map.hasLayer(pathLine.value)) map.removeLayer(pathLine.value)
    pathLine.value = null
  }

  // 清除当前目标
  if (currentTargetMarker && currentTargetMarker.value) {
    if (map.hasLayer(currentTargetMarker.value)) map.removeLayer(currentTargetMarker.value)
    currentTargetMarker.value = null
  }

  // 只有当明确传入了 trajectoryLine 对象时才清除（防止切换目标时轨迹消失）
  // 这里的关键是：如果调用时传了 null，这里就不会执行清除
  if (trajectoryLine && trajectoryLine.value) {
    if (map.hasLayer(trajectoryLine.value)) map.removeLayer(trajectoryLine.value)
    trajectoryLine.value = null
  }

  if (trajectoryPoints) {
    trajectoryPoints.value = []
  }
}