// 路径点相关功能
import { rosToLeaflet } from '../utils/mapUtils'

// 加载路径点
export const loadPathPoints = async () => {
  try {
    // 从YAML文件加载路径点
    const response = await fetch('/path_points_test.yaml')
    const yamlText = await response.text()

    // 解析YAML（简化版，实际项目中应使用yaml库）
    const lines = yamlText.split('\n')
    const pathPoints = []
    let inPathPoints = false

    for (const line of lines) {
      if (line.trim() === 'path_points:') {
        inPathPoints = true
        continue
      }

      if (inPathPoints && line.trim() === '') {
        break
      }

      if (inPathPoints && line.trim().startsWith('- point:')) {
        // 开始一个新的路径点
        const point = { x: 0, y: 0, yaw: 0 }

        // 解析后续的x, y, yaw值
        let i = 1
        while (i < lines.length && !lines[i].trim().startsWith('- point:')) {
          const currentLine = lines[i].trim()

          if (currentLine.startsWith('x:')) {
            point.x = parseFloat(currentLine.split(':')[1].trim())
          } else if (currentLine.startsWith('y:')) {
            point.y = parseFloat(currentLine.split(':')[1].trim())
          } else if (currentLine.startsWith('yaw:')) {
            point.yaw = parseFloat(currentLine.split(':')[1].trim())
          } else if (currentLine.startsWith('description:')) {
            point.description = currentLine.split(':')[1].trim().replace(/"/g, '')
          }

          i++
        }

        pathPoints.push(point)
      }
    }

    return pathPoints
  } catch (error) {
    console.error('加载路径点失败:', error)
    return []
  }
}

// 在地图上显示路径点
export const displayPathPoints = (map, pathPoints, pathMarkers, pathLine) => {
  if (!map || !pathPoints || pathPoints.length === 0) return

  // 导入Leaflet
  import('leaflet').then(L => {
    // 清除现有标记和路径线
    if (pathMarkers.value) {
      pathMarkers.value.forEach(marker => map.removeLayer(marker))
      pathMarkers.value = []
    }

    if (pathLine.value) {
      map.removeLayer(pathLine.value)
    }

    // 创建路径点标记
    const pathCoords = []

    pathPoints.forEach((point, index) => {
      // 将ROS坐标转换为Leaflet坐标
      const leafletCoords = rosToLeaflet(point.x, point.y)
      pathCoords.push(leafletCoords)

      // 创建路径点标记
      const icon = L.divIcon({
        html: `<div class="path-point-marker">${index + 1}</div>`,
        className: 'path-point-marker-container',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })

      const marker = L.marker(leafletCoords, { icon })
        .addTo(map)
        .bindPopup(`路径点 ${index + 1}<br>坐标: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})<br>朝向: ${point.yaw.toFixed(2)} rad<br>${point.description || ''}`)

      pathMarkers.value.push(marker)
    })

    // 绘制路径线
    pathLine.value = L.polyline(pathCoords, {
      color: '#38b2ac',
      weight: 3,
      opacity: 0.7,
      dashArray: '10, 5'
    }).addTo(map)
  })
}

// 高亮当前目标点
export const highlightCurrentTarget = (map, pathPoints, currentTargetIndex, currentTargetMarker) => {
  if (!map || !pathPoints || currentTargetIndex.value < 0 || currentTargetIndex.value >= pathPoints.length) {
    if (currentTargetMarker.value) {
      map.removeLayer(currentTargetMarker.value)
      currentTargetMarker.value = null
    }
    return
  }

  import('leaflet').then(L => {
    // 移除旧的当前目标标记
    if (currentTargetMarker.value) {
      map.removeLayer(currentTargetMarker.value)
    }

    // 获取当前目标点
    const targetPoint = pathPoints[currentTargetIndex.value]
    const leafletCoords = rosToLeaflet(targetPoint.x, targetPoint.y)

    // 创建高亮标记
    const icon = L.divIcon({
      html: '<div class="current-target-marker">🎯</div>',
      className: 'current-target-marker-container',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })

    currentTargetMarker.value = L.marker(leafletCoords, { icon })
      .addTo(map)
      .bindPopup(`当前目标: ${currentTargetIndex.value + 1}<br>坐标: (${targetPoint.x.toFixed(2)}, ${targetPoint.y.toFixed(2)})<br>朝向: ${targetPoint.yaw.toFixed(2)} rad`)
  })
}

// 添加轨迹点
export const addTrajectoryPoint = (map, robotPose, trajectoryLine, trajectoryPoints) => {
  if (!map || !robotPose) return

  import('leaflet').then(L => {
    // 将ROS坐标转换为Leaflet坐标
    const leafletCoords = rosToLeaflet(robotPose.x, robotPose.y)

    // 添加到轨迹点数组
    trajectoryPoints.value.push(leafletCoords)

    // 更新轨迹线
    if (trajectoryLine.value) {
      trajectoryLine.value.setLatLngs(trajectoryPoints.value)
    } else {
      // 创建轨迹线
      trajectoryLine.value = L.polyline(trajectoryPoints.value, {
        color: '#e53e3e',
        weight: 3,
        opacity: 0.8
      }).addTo(map)
    }
  })
}

// 清除路径点显示
export const clearPathDisplay = (map, pathMarkers, pathLine, currentTargetMarker, trajectoryLine, trajectoryPoints) => {
  if (!map) return

  import('leaflet').then(() => {
    // 清除路径点标记
    if (pathMarkers.value) {
      pathMarkers.value.forEach(marker => map.removeLayer(marker))
      pathMarkers.value = []
    }

    // 清除路径线
    if (pathLine.value) {
      map.removeLayer(pathLine.value)
      pathLine.value = null
    }

    // 清除当前目标标记
    if (currentTargetMarker.value) {
      map.removeLayer(currentTargetMarker.value)
      currentTargetMarker.value = null
    }

    // 清除轨迹线
    if (trajectoryLine.value) {
      map.removeLayer(trajectoryLine.value)
      trajectoryLine.value = null
    }

    // 清空轨迹点数组
    trajectoryPoints.value = []
  })
}
