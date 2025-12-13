# 地图文件说明

## PGM 地图文件处理

由于浏览器无法直接显示PGM二进制文件，这里提供几种解决方案：

### 方案1：使用占位符地图（当前实现）
- 使用网格背景和ROS地图信息作为占位符
- 支持坐标转换和导航功能
- 适用于开发和测试环境

### 方案2：服务器端PGM转换
需要后端服务将PGM文件转换为PNG格式：

```python
# Python示例代码
import cv2
import numpy as np

def pgm_to_png(pgm_path, png_path):
    # 读取PGM文件
    img = cv2.imread(pgm_path, cv2.IMREAD_UNCHANGED)
    
    # 转换为PNG格式
    cv2.imwrite(png_path, img)
    
    # 返回PNG文件URL
    return f"/maps/{os.path.basename(png_path)}"
```

### 方案3：使用地图服务
- 使用OpenStreetMap作为基础地图
- 通过MQTT接收动态地图数据
- 支持实时地图更新

## 当前配置

### map.yaml 配置说明
```yaml
image: /maps/sample_map.pgm    # 地图图像文件路径
resolution: 0.050000           # 地图分辨率（米/像素）
origin: [-10.000000, -10.000000, 0.000000]  # 地图原点坐标
negate: 0                      # 是否反转颜色（0=不反转）
occupied_thresh: 0.65          # 障碍物阈值
free_thresh: 0.196             # 自由空间阈值
```

## 坐标系统

### ROS坐标系
- 原点：地图左下角
- X轴：向右
- Y轴：向上

### Leaflet坐标系  
- 原点：地图左上角
- X轴：向右
- Y轴：向下

### 坐标转换公式
```javascript
// ROS转Leaflet
leafletX = rosX
leafletY = mapHeight - rosY

// Leaflet转ROS
rosX = leafletX
rosY = mapHeight - leafletY
```

## 使用说明

1. **地图加载**：系统会自动尝试加载本地地图文件
2. **坐标转换**：点击地图时自动进行坐标转换
3. **导航功能**：支持设置目标位置和路径规划
4. **实时更新**：通过MQTT接收机器人位置和地图更新

## 故障排除

### 常见问题
1. **地图无法显示**：检查PGM文件路径和格式
2. **坐标不准确**：验证地图配置参数
3. **标记位置错误**：检查坐标转换逻辑

### 调试方法
- 打开浏览器开发者工具查看控制台输出
- 检查网络请求是否成功加载地图文件
- 验证MQTT连接和消息接收状态