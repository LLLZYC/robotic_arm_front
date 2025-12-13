# MQTT话题配置指南

## 📋 概述

本指南说明如何配置DLRobot前端系统中各个功能模块订阅的MQTT话题，方便您根据实际的ROS系统进行调整。

---

## 🎯 话题功能映射

### 界面位置与对应话题

| 界面位置 | 功能 | 配置项 | 默认话题 | 说明 |
|---------|------|--------|----------|------|
| **左下角** | 机器人状态 | `robotStatus` | `/robot_pose` | 显示机器人基本状态信息 |
| **左下角** | 导航状态 | `navigationStatus` | `/move_base/status` | 显示导航状态（待机/导航中/已到达） |
| **右上角** | 激光雷达 | `laserScan` | `/scan` | 显示激光雷达扫描数据 |
| **右上角** | 相机图像 | `cameraImage` | `/camera/rgb/image_raw` | 显示相机静态图像 |
| **右上角** | 视频流 | `videoStream` | `/camera/rgb/image_raw` | 显示实时视频流 |
| **地图中央** | 机器人位置 | `robotPoseMap` | `/amcl_pose` | 在地图上显示机器人位置和朝向 |
| **地图背景** | 地图数据 | `mapData` | `/map` | 占用栅格地图数据 |

---

## ⚙️ 配置方法

### 方法1: 通过界面配置（推荐）

1. **打开设置界面**
   - 点击右上角的 ⚙️ 设置按钮
   - 选择 "📡 MQTT话题" 标签页

2. **修改话题配置**
   - 根据界面提示，修改各个功能对应的话题名称
   - 每个配置项都有说明其对应的界面位置

3. **应用配置**
   - 点击 "保存" 按钮保存配置
   - 重新连接MQTT以使配置生效

### 方法2: 修改配置文件

编辑 `src/stores/robotStore.js` 文件：

```javascript
config: {
  mqttTopics: {
    // 左下角机器人状态
    robotStatus: '/robot_pose',
    
    // 右上角激光雷达
    laserScan: '/scan',
    
    // 右上角相机图像
    cameraImage: '/camera/rgb/image_raw',
    
    // 右上角视频流
    videoStream: '/camera/rgb/image_raw',
    
    // 地图中机器人位置
    robotPoseMap: '/amcl_pose',
    
    // 地图数据
    mapData: '/map',
    
    // 导航状态
    navigationStatus: '/move_base/status'
  }
}
```

---

## 📝 话题详细说明

### 1. 机器人位姿 (robotPoseMap)

**默认话题**: `/amcl_pose`

**消息类型**: `geometry_msgs/PoseWithCovarianceStamped`

**用途**: 在地图中央显示机器人的当前位置和朝向

**消息格式示例**:
```json
{
  "pose": {
    "position": {
      "x": 1.23,
      "y": 4.56,
      "z": 0.0
    },
    "orientation": {
      "x": 0.0,
      "y": 0.0,
      "z": 0.707,
      "w": 0.707
    }
  }
}
```

**常见话题名称**:
- `/amcl_pose` - AMCL定位
- `/robot_pose` - 机器人位姿
- `/odom` - 里程计位姿

---

### 2. 激光雷达 (laserScan)

**默认话题**: `/scan`

**消息类型**: `sensor_msgs/LaserScan`

**用途**: 在右上角数据监控面板显示激光雷达扫描数据

**消息格式示例**:
```json
{
  "ranges": [1.2, 1.5, 2.0, 3.5, ...],
  "angle_min": -1.57,
  "angle_max": 1.57,
  "angle_increment": 0.0174,
  "range_min": 0.1,
  "range_max": 10.0
}
```

**常见话题名称**:
- `/scan` - 标准激光雷达
- `/base_scan` - 基座激光雷达
- `/front_scan` - 前置激光雷达

---

### 3. 相机图像 (cameraImage)

**默认话题**: `/camera/rgb/image_raw`

**消息类型**: `sensor_msgs/Image` 或 `sensor_msgs/CompressedImage`

**用途**: 在右上角显示相机拍摄的静态图像

**消息格式示例**:
```json
{
  "image_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "width": 640,
  "height": 480,
  "encoding": "rgb8"
}
```

**常见话题名称**:
- `/camera/rgb/image_raw` - RGB相机原始图像
- `/camera/rgb/image_raw/compressed` - 压缩图像
- `/usb_cam/image_raw` - USB相机
- `/camera/color/image_raw` - RealSense彩色图像

---

### 4. 视频流 (videoStream)

**默认话题**: `/camera/rgb/image_raw`

**消息类型**: 通过 `web_video_server` 转换

**用途**: 在右上角显示实时视频流

**配置说明**:
- 需要配合 `web_video_server` 使用
- 在设置中配置 Web Video Server 地址（默认: `http://192.168.6.214:8080`）
- 系统会自动生成流媒体URL

**常见话题名称**:
- 与相机图像话题相同

---

### 5. 导航状态 (navigationStatus)

**默认话题**: `/move_base/status`

**消息类型**: `actionlib_msgs/GoalStatusArray`

**用途**: 在左下角控制面板显示机器人导航状态

**消息格式示例**:
```json
{
  "status_list": [
    {
      "status": 1,  // 1=ACTIVE, 3=SUCCEEDED, 4=ABORTED
      "text": "Navigating to goal"
    }
  ]
}
```

**状态映射**:
- `1` (ACTIVE) → "导航中"
- `3` (SUCCEEDED) → "已到达"
- `4` (ABORTED) → "导航失败"
- 其他 → "待机"

**常见话题名称**:
- `/move_base/status` - move_base导航状态
- `/navigation/status` - 自定义导航状态

---

### 6. 地图数据 (mapData)

**默认话题**: `/map`

**消息类型**: `nav_msgs/OccupancyGrid`

**用途**: 提供占用栅格地图数据

**消息格式示例**:
```json
{
  "map_url": "/path/to/map.pgm",
  "resolution": 0.05,
  "origin": {
    "x": -10.0,
    "y": -10.0,
    "z": 0.0
  }
}
```

**常见话题名称**:
- `/map` - 标准地图话题
- `/map_server/map` - 地图服务器
- `/slam/map` - SLAM生成的地图

---

## 🔧 配置示例

### 示例1: TurtleBot3 配置

```javascript
mqttTopics: {
  robotStatus: '/robot_pose',
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
  laserScan: '/my_robot/laser/scan',
  cameraImage: '/my_robot/camera/image',
  videoStream: '/my_robot/camera/image',
  robotPoseMap: '/my_robot/localization/pose',
  mapData: '/my_robot/map',
  navigationStatus: '/my_robot/navigation/status'
}
```

### 示例3: 多传感器配置

```javascript
mqttTopics: {
  robotStatus: '/robot_pose',
  laserScan: '/front_scan',           // 使用前置激光雷达
  cameraImage: '/camera/front/image', // 使用前置相机
  videoStream: '/camera/front/image',
  robotPoseMap: '/amcl_pose',
  mapData: '/map',
  navigationStatus: '/move_base/status'
}
```

---

## 🚀 快速开始

### 1. 检查ROS话题

在ROS系统中查看可用话题：

```bash
# 列出所有话题
rostopic list

# 查看话题类型
rostopic type /scan

# 查看话题数据
rostopic echo /scan

# 查看话题频率
rostopic hz /scan
```

### 2. 配置MQTT Bridge

确保MQTT Bridge正确转发这些话题（参考 `BACKEND_SETUP_GUIDE.md`）

### 3. 在前端配置

1. 打开前端应用
2. 点击右上角 ⚙️ 设置
3. 选择 "📡 MQTT话题" 标签
4. 根据您的ROS话题修改配置
5. 保存并重新连接

---

## 🔍 故障排查

### 问题1: 话题无数据

**症状**: 界面显示"等待数据..."

**解决方案**:
1. 检查ROS话题是否发布数据：
   ```bash
   rostopic echo /scan
   ```

2. 检查MQTT Bridge是否转发：
   ```bash
   mosquitto_sub -h localhost -p 1883 -t "/scan" -v
   ```

3. 检查前端是否订阅：
   - 查看左下角控制面板的"话题订阅管理"
   - 确认话题已订阅

### 问题2: 话题名称不匹配

**症状**: 配置后仍无数据

**解决方案**:
1. 确认ROS话题名称（注意大小写和斜杠）
2. 检查MQTT Bridge配置文件中的话题映射
3. 重启MQTT Bridge和前端应用

### 问题3: 视频流无法显示

**症状**: 视频流区域空白或报错

**解决方案**:
1. 检查 `web_video_server` 是否运行：
   ```bash
   rosnode list | grep web_video_server
   ```

2. 测试视频流URL：
   ```bash
   curl http://192.168.6.214:8080/stream?topic=/camera/rgb/image_raw
   ```

3. 在设置中配置正确的 Web Video Server 地址

---

## 💡 最佳实践

### 1. 话题命名规范

- 使用描述性名称，如 `/robot/sensor/laser` 而不是 `/s1`
- 保持一致的命名风格
- 使用命名空间组织话题

### 2. 性能优化

- 降低高频话题的发布频率（如激光雷达从10Hz降到5Hz）
- 使用压缩图像话题（`/compressed`）减少带宽
- 只订阅需要的话题

### 3. 配置管理

- 为不同机器人创建配置预设
- 定期备份配置文件
- 使用版本控制管理配置

---

## 📚 相关文档

- [后端配置指南](./BACKEND_SETUP_GUIDE.md) - 详细的后端服务配置
- [API文档](./API_CAMERA_IMAGES.md) - REST API接口说明
- [ROS Wiki](http://wiki.ros.org) - ROS官方文档

---

## 🆘 获取帮助

如果遇到问题：

1. 查看浏览器控制台的错误信息
2. 检查MQTT代理日志：`sudo tail -f /var/log/mosquitto/mosquitto.log`
3. 查看ROS日志：`rosnode info mqtt_bridge`
4. 参考故障排查章节

---

**最后更新**: 2025-11-05
**版本**: v1.0.0
