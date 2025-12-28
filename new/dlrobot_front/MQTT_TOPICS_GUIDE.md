# MQTT话题配置指南

本指南说明如何在DLRobot前端系统中配置和使用MQTT话题。

## 📋 目录
- [话题配置位置](#话题配置位置)
- [默认话题映射](#默认话题映射)
- [如何修改话题](#如何修改话题)
- [话题说明](#话题说明)
- [常见问题](#常见问题)

---

## 话题配置位置

### 方式1: 通过设置界面（推荐）

1. 点击右上角的 **⚙️ 设置** 按钮
2. 切换到 **📡 MQTT话题** 标签页
3. 修改对应的话题名称
4. 点击 **保存** 按钮
5. 重新订阅话题以使更改生效

### 方式2: 直接修改配置文件

编辑 `src/stores/robotStore.js` 文件中的 `mqttTopics` 配置：

```javascript
mqttTopics: {
  robotStatus: '/robot_pose',           // 修改为你的话题
  laserScan: '/scan',
  cameraImage: '/camera/rgb/image_raw',
  videoStream: '/camera/rgb/image_raw',
  robotPoseMap: '/amcl_pose',
  mapData: '/map',
  navigationStatus: '/move_base/status'
}
```

---

## 默认话题映射

| 功能位置 | 配置项 | 默认话题 | 数据类型 | 说明 |
|---------|--------|----------|----------|------|
| 左下角机器人状态 | `robotStatus` | `/robot_pose` | `geometry_msgs/PoseStamped` | 显示机器人当前位置和朝向 |
| 右上角激光雷达 | `laserScan` | `/scan` | `sensor_msgs/LaserScan` | 显示激光雷达扫描数据 |
| 右上角相机图像 | `cameraImage` | `/camera/rgb/image_raw` | `sensor_msgs/Image` | 显示相机拍摄的图像 |
| 右上角视频流 | `videoStream` | `/camera/rgb/image_raw` | `sensor_msgs/Image` | 实时视频流显示 |
| 地图中机器人位置 | `robotPoseMap` | `/amcl_pose` | `geometry_msgs/PoseWithCovarianceStamped` | 地图上机器人标记位置 |
| 地图数据 | `mapData` | `/map` | `nav_msgs/OccupancyGrid` | 占用栅格地图数据 |
| 导航状态 | `navigationStatus` | `/move_base/status` | `actionlib_msgs/GoalStatusArray` | 导航任务状态 |

---

## 如何修改话题

### 示例1: 修改激光雷达话题

**场景**: 你的激光雷达发布在 `/laser_scan` 而不是 `/scan`

**步骤**:
1. 打开设置界面
2. 切换到 "📡 MQTT话题" 标签
3. 找到 "激光雷达 (右上角显示)"
4. 将 `/scan` 改为 `/laser_scan`
5. 保存设置
6. 在左侧控制面板中重新订阅话题

### 示例2: 修改机器人位姿话题

**场景**: 你的机器人位姿发布在 `/odom` 而不是 `/robot_pose`

**步骤**:
1. 打开设置界面
2. 切换到 "📡 MQTT话题" 标签
3. 找到 "机器人位姿 (左下角状态)"
4. 将 `/robot_pose` 改为 `/odom`
5. 保存设置
6. 重新订阅话题

### 示例3: 使用不同的相机话题

**场景**: 你有多个相机，想使用深度相机的图像

**步骤**:
1. 打开设置界面
2. 切换到 "📡 MQTT话题" 标签
3. 找到 "相机图像"
4. 将 `/camera/rgb/image_raw` 改为 `/camera/depth/image_raw`
5. 保存设置
6. 重新订阅话题

---

## 话题说明

### 📍 机器人位姿话题

#### robotStatus (左下角状态显示)
- **用途**: 在控制面板左下角显示机器人的实时位置和朝向
- **数据格式**: 
  ```json
  {
    "x": 1.23,
    "y": 4.56,
    "theta": 0.78
  }
  ```
- **常用话题**: `/robot_pose`, `/odom`, `/base_pose`

#### robotPoseMap (地图中机器人标记)
- **用途**: 在地图上显示机器人的位置标记（🤖）
- **数据格式**: `geometry_msgs/PoseWithCovarianceStamped`
- **常用话题**: `/amcl_pose`, `/robot_pose`, `/slam_pose`

### 📡 激光雷达话题

#### laserScan
- **用途**: 在右上角数据监控面板显示激光雷达数据
- **数据格式**: `sensor_msgs/LaserScan`
- **显示内容**:
  - 数据点数
  - 最近距离
  - 最远距离
- **常用话题**: `/scan`, `/laser_scan`, `/base_scan`

### 📷 相机话题

#### cameraImage
- **用途**: 显示静态相机图像
- **数据格式**: `sensor_msgs/Image` 或 `sensor_msgs/CompressedImage`
- **常用话题**: 
  - `/camera/rgb/image_raw`
  - `/camera/image_raw`
  - `/usb_cam/image_raw`

#### videoStream
- **用途**: 显示实时视频流
- **数据格式**: Web Video Server URL
- **常用话题**: 与 cameraImage 相同

### 🗺️ 地图话题

#### mapData
- **用途**: 加载和显示占用栅格地图
- **数据格式**: `nav_msgs/OccupancyGrid`
- **常用话题**: `/map`, `/map_server/map`, `/slam_map`

### 🚦 导航状态话题

#### navigationStatus
- **用途**: 显示导航任务的状态（导航中、已到达、失败等）
- **数据格式**: `actionlib_msgs/GoalStatusArray`
- **常用话题**: `/move_base/status`, `/navigation/status`

---

## 常见问题

### Q1: 修改话题后没有数据？

**A**: 请按以下步骤检查：

1. **确认话题是否存在**:
   ```bash
   rostopic list | grep your_topic
   ```

2. **检查话题是否有数据**:
   ```bash
   rostopic echo /your_topic
   ```

3. **重新订阅话题**:
   - 在左侧控制面板中取消订阅旧话题
   - 订阅新话题
   - 或点击 "📌 订阅默认话题" 按钮

4. **检查MQTT Bridge配置**:
   确保后端的MQTT Bridge已配置相应话题

### Q2: 如何查看当前订阅的话题？

**A**: 在左侧控制面板的 "话题订阅管理" 部分可以看到所有已订阅的话题。

### Q3: 话题配置会保存吗？

**A**: 是的！话题配置会自动保存到浏览器的 localStorage 中，刷新页面后仍然有效。

### Q4: 如何恢复默认话题配置？

**A**: 有两种方式：

**方式1**: 手动恢复
1. 打开设置界面
2. 切换到 "📡 MQTT话题" 标签
3. 将每个话题改回默认值（参考上面的默认话题映射表）
4. 保存设置

**方式2**: 清除浏览器缓存
1. 打开浏览器开发者工具 (F12)
2. 切换到 Console 标签
3. 运行: `localStorage.removeItem('robotConfig')`
4. 刷新页面

### Q5: 不同的话题可以使用相同的名称吗？

**A**: 可以。例如，`cameraImage` 和 `videoStream` 可以都使用 `/camera/rgb/image_raw`，系统会根据不同的用途处理数据。

### Q6: 如何知道我的ROS系统有哪些话题？

**A**: 在ROS系统中运行：

```bash
# 列出所有话题
rostopic list

# 查看话题类型
rostopic type /your_topic

# 查看话题信息
rostopic info /your_topic

# 查看话题数据
rostopic echo /your_topic
```

### Q7: 话题修改后需要重启前端吗？

**A**: 不需要重启，但需要：
1. 保存设置
2. 重新订阅话题（在左侧控制面板中操作）

### Q8: 如何批量订阅所有配置的话题？

**A**: 点击左侧控制面板中的 **"📌 订阅默认话题"** 按钮，会自动订阅所有在设置中配置的话题。

---

## 高级配置

### 使用命名空间

如果你的机器人使用了ROS命名空间，例如 `/robot1`，可以这样配置：

```javascript
mqttTopics: {
  robotStatus: '/robot1/robot_pose',
  laserScan: '/robot1/scan',
  cameraImage: '/robot1/camera/rgb/image_raw',
  // ...
}
```

### 多机器人系统

对于多机器人系统，可以为每个机器人创建不同的配置：

**机器人1**:
```javascript
mqttTopics: {
  robotStatus: '/robot1/pose',
  laserScan: '/robot1/scan',
  // ...
}
```

**机器人2**:
```javascript
mqttTopics: {
  robotStatus: '/robot2/pose',
  laserScan: '/robot2/scan',
  // ...
}
```

### 使用压缩图像

为了减少带宽使用，可以使用压缩图像话题：

```javascript
mqttTopics: {
  cameraImage: '/camera/rgb/image_raw/compressed',
  videoStream: '/camera/rgb/image_raw/compressed',
}
```

---

## 配置示例

### 示例1: TurtleBot3 配置

```javascript
mqttTopics: {
  robotStatus: '/odom',
  laserScan: '/scan',
  cameraImage: '/camera/rgb/image_raw',
  videoStream: '/camera/rgb/image_raw',
  robotPoseMap: '/amcl_pose',
  mapData: '/map',
  navigationStatus: '/move_base/status'
}
```

### 示例2: 自定义机器人配置

```javascript
mqttTopics: {
  robotStatus: '/my_robot/pose',
  laserScan: '/my_robot/laser',
  cameraImage: '/my_robot/front_camera/image',
  videoStream: '/my_robot/front_camera/image',
  robotPoseMap: '/my_robot/localization/pose',
  mapData: '/my_robot/map',
  navigationStatus: '/my_robot/nav/status'
}
```

### 示例3: 使用Gazebo仿真

```javascript
mqttTopics: {
  robotStatus: '/gazebo/model_states',
  laserScan: '/scan',
  cameraImage: '/camera/image_raw',
  videoStream: '/camera/image_raw',
  robotPoseMap: '/amcl_pose',
  mapData: '/map',
  navigationStatus: '/move_base/status'
}
```

---

## 调试技巧

### 1. 查看MQTT消息

在浏览器开发者工具的Console中，可以看到MQTT消息的日志：

```javascript
// 在mqttService.js中已经有日志输出
console.log('收到MQTT消息:', topic, message)
```

### 2. 测试话题连接

使用mosquitto客户端测试：

```bash
# 订阅话题
mosquitto_sub -h localhost -p 1883 -t "/robot_pose" -v

# 发布测试消息
mosquitto_pub -h localhost -p 1883 -t "/robot_pose" -m '{"x":1.0,"y":2.0,"theta":0.5}'
```

### 3. 检查ROS到MQTT的桥接

确保MQTT Bridge正在运行并正确配置：

```bash
# 检查MQTT Bridge节点
rosnode list | grep mqtt_bridge

# 查看MQTT Bridge日志
rosnode info mqtt_bridge
```

---

## 相关文档

- [后端配置指南](./BACKEND_SETUP_GUIDE.md)
- [系统更新日志](./UPDATES_SUMMARY.md)
- [README](./README.md)

---

**文档版本**: 1.0.0  
**最后更新**: 2025-11-05  
**维护者**: DLRobot Team
