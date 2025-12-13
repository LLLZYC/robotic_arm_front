# 后端API配置指南

本指南将帮助你配置后端服务，以支持DLRobot前端系统的所有功能。

## 目录
- [系统架构](#系统架构)
- [必需的后端服务](#必需的后端服务)
- [API端点实现](#api端点实现)
- [MQTT配置](#mqtt配置)
- [Web Video Server配置](#web-video-server配置)
- [完整示例代码](#完整示例代码)

---

## 系统架构

```
┌─────────────────┐
│  前端 (Vue.js)  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐
│ MQTT  │ │ REST API│
│ Broker│ │ Server  │
└───┬───┘ └──┬──────┘
    │        │
┌───▼────────▼───┐
│   ROS系统      │
│  (机器人控制)  │
└────────────────┘
```

---

## 必需的后端服务

### 1. MQTT Broker (Mosquitto)

**安装 Mosquitto:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install mosquitto mosquitto-clients

# macOS
brew install mosquitto
```

**配置 WebSocket 支持:**

编辑配置文件 `/etc/mosquitto/mosquitto.conf`:
```conf
# 标准MQTT端口
listener 1883
protocol mqtt

# WebSocket端口（前端使用）
listener 9001
protocol websockets

# 允许匿名连接（生产环境建议配置认证）
allow_anonymous true

# 日志配置
log_dest file /var/log/mosquitto/mosquitto.log
log_type all
```

**启动服务:**
```bash
# Ubuntu/Debian
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
sudo systemctl status mosquitto

# macOS
brew services start mosquitto
```

**测试连接:**
```bash
# 订阅测试
mosquitto_sub -h localhost -p 1883 -t "test/topic"

# 发布测试
mosquitto_pub -h localhost -p 1883 -t "test/topic" -m "Hello MQTT"
```

---

### 2. REST API Server

你需要实现以下API端点来支持前端功能。

#### 必需的API端点

| 端点 | 方法 | 功能 | 优先级 |
|------|------|------|--------|
| `/api/goal` | POST | 发送导航目标位置 | 高 |
| `/api/goal/cancel` | POST | 取消当前导航任务 | 高 |
| `/api/map/config` | GET | 获取地图配置信息 | 高 |
| `/api/camera/images` | GET | 获取相机图像列表 | 中 |
| `/api/camera/image/<path>` | GET | 获取特定图像文件 | 中 |
| `/api/topics` | GET | 获取可用ROS话题列表 | 低 |

---

## API端点实现

### 方案A: Python Flask (推荐用于ROS)

**安装依赖:**
```bash
pip install flask flask-cors rospy
```

**完整服务器代码 (`backend_server.py`):**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import rospy
from geometry_msgs.msg import PoseStamped
from actionlib_msgs.msg import GoalID
import os
import json
from pathlib import Path
import base64

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# ROS初始化
rospy.init_node('dlrobot_api_server', anonymous=True)

# ROS发布器
goal_pub = rospy.Publisher('/move_base_simple/goal', PoseStamped, queue_size=10)
cancel_pub = rospy.Publisher('/move_base/cancel', GoalID, queue_size=10)

# ==================== 导航相关API ====================

@app.route('/api/goal', methods=['POST'])
def send_goal():
    """
    发送导航目标位置
    
    请求格式:
    {
        "goal": {
            "name": "override_001",
            "frame_id": "map",
            "position": {"x": 1.0, "y": 2.0, "z": 0.0},
            "orientation": {"yaw": 0.5},
            "wait_before": 0,
            "wait_after": 0
        }
    }
    """
    try:
        data = request.get_json()
        goal_data = data.get('goal', {})
        
        # 创建ROS消息
        goal_msg = PoseStamped()
        goal_msg.header.frame_id = goal_data.get('frame_id', 'map')
        goal_msg.header.stamp = rospy.Time.now()
        
        # 设置位置
        position = goal_data.get('position', {})
        goal_msg.pose.position.x = position.get('x', 0.0)
        goal_msg.pose.position.y = position.get('y', 0.0)
        goal_msg.pose.position.z = position.get('z', 0.0)
        
        # 设置方向（从yaw转换为四元数）
        orientation = goal_data.get('orientation', {})
        yaw = orientation.get('yaw', 0.0)
        
        # 简化的yaw到四元数转换
        import math
        goal_msg.pose.orientation.x = 0.0
        goal_msg.pose.orientation.y = 0.0
        goal_msg.pose.orientation.z = math.sin(yaw / 2.0)
        goal_msg.pose.orientation.w = math.cos(yaw / 2.0)
        
        # 发布目标
        goal_pub.publish(goal_msg)
        
        rospy.loginfo(f"发送导航目标: x={position.get('x')}, y={position.get('y')}, yaw={yaw}")
        
        return jsonify({
            'success': True,
            'message': '目标位置已发送',
            'goal': goal_data
        }), 200
        
    except Exception as e:
        rospy.logerr(f"发送目标失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/goal/cancel', methods=['POST'])
def cancel_goal():
    """取消当前导航任务"""
    try:
        cancel_msg = GoalID()
        cancel_pub.publish(cancel_msg)
        
        rospy.loginfo("已取消导航任务")
        
        return jsonify({
            'success': True,
            'message': '导航任务已取消'
        }), 200
        
    except Exception as e:
        rospy.logerr(f"取消导航失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ==================== 地图相关API ====================

@app.route('/api/map/config', methods=['GET'])
def get_map_config():
    """
    获取地图配置信息
    
    返回格式:
    {
        "image": "/path/to/map.pgm",
        "resolution": 0.05,
        "origin": [-10.0, -10.0, 0.0],
        "negate": 0,
        "occupied_thresh": 0.65,
        "free_thresh": 0.196
    }
    """
    try:
        # 从ROS参数服务器获取地图配置
        map_file = rospy.get_param('/map_file', '/home/dlrobot_autocontrol/map.yaml')
        
        # 读取YAML配置
        import yaml
        with open(map_file, 'r') as f:
            map_config = yaml.safe_load(f)
        
        return jsonify(map_config), 200
        
    except Exception as e:
        rospy.logerr(f"获取地图配置失败: {str(e)}")
        return jsonify({
            'error': str(e)
        }), 500


# ==================== 相机图像API ====================

@app.route('/api/camera/images', methods=['GET'])
def get_camera_images():
    """
    获取相机图像列表
    
    查询参数:
    - path: 图像文件夹路径（默认: /home/dlrobot_autocontrol）
    
    返回格式:
    {
        "images": [
            {
                "name": "image_001.jpg",
                "path": "/home/dlrobot_autocontrol/image_001.jpg",
                "size": 123456,
                "modified": "2025-11-05T10:30:00"
            }
        ]
    }
    """
    try:
        # 获取路径参数
        image_path = request.args.get('path', '/home/dlrobot_autocontrol')
        
        # 安全检查：防止路径遍历攻击
        image_path = os.path.abspath(image_path)
        if not image_path.startswith('/home/dlrobot_autocontrol'):
            return jsonify({'error': '无效的路径'}), 403
        
        # 检查路径是否存在
        if not os.path.exists(image_path):
            return jsonify({'error': '路径不存在'}), 404
        
        # 支持的图像格式
        image_extensions = {'.jpg', '.jpeg', '.png', '.pgm', '.bmp', '.gif'}
        
        # 扫描图像文件
        images = []
        for filename in os.listdir(image_path):
            file_path = os.path.join(image_path, filename)
            
            # 检查是否为文件且为图像格式
            if os.path.isfile(file_path):
                ext = os.path.splitext(filename)[1].lower()
                if ext in image_extensions:
                    stat = os.stat(file_path)
                    images.append({
                        'name': filename,
                        'path': file_path,
                        'size': stat.st_size,
                        'modified': stat.st_mtime
                    })
        
        # 按修改时间降序排序
        images.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({'images': images}), 200
        
    except Exception as e:
        rospy.logerr(f"获取图像列表失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/camera/image/<path:image_path>', methods=['GET'])
def get_camera_image(image_path):
    """
    获取特定图像文件
    
    路径参数:
    - image_path: Base64编码的图像路径
    """
    try:
        # 解码路径
        decoded_path = base64.b64decode(image_path).decode('utf-8')
        
        # 安全检查
        decoded_path = os.path.abspath(decoded_path)
        if not decoded_path.startswith('/home/dlrobot_autocontrol'):
            return jsonify({'error': '无效的路径'}), 403
        
        # 检查文件是否存在
        if not os.path.exists(decoded_path):
            return jsonify({'error': '文件不存在'}), 404
        
        # 返回图像文件
        return send_file(decoded_path, mimetype='image/jpeg')
        
    except Exception as e:
        rospy.logerr(f"获取图像失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ==================== ROS话题API ====================

@app.route('/api/topics', methods=['GET'])
def get_topics():
    """获取可用的ROS话题列表"""
    try:
        # 获取所有话题
        topics = rospy.get_published_topics()
        
        # 格式化返回
        topic_list = [
            {
                'name': topic[0],
                'type': topic[1]
            }
            for topic in topics
        ]
        
        return jsonify({'topics': topic_list}), 200
        
    except Exception as e:
        rospy.logerr(f"获取话题列表失败: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ==================== 健康检查 ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({
        'status': 'healthy',
        'service': 'DLRobot API Server',
        'version': '1.0.0'
    }), 200


# ==================== 启动服务器 ====================

if __name__ == '__main__':
    print("=" * 50)
    print("DLRobot API Server 启动中...")
    print("=" * 50)
    print(f"REST API: http://0.0.0.0:5000")
    print(f"MQTT Broker: ws://localhost:9001")
    print("=" * 50)
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True
    )
```

**启动服务器:**
```bash
# 确保ROS环境已配置
source /opt/ros/noetic/setup.bash  # 或你的ROS版本

# 启动服务器
python3 backend_server.py
```

---

### 方案B: Node.js Express (备选方案)

**安装依赖:**
```bash
npm install express cors rosnodejs
```

**服务器代码 (`server.js`):**

```javascript
const express = require('express');
const cors = require('cors');
const rosnodejs = require('rosnodejs');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ROS节点初始化
let rosNode;
let goalPublisher;
let cancelPublisher;

async function initROS() {
    rosNode = await rosnodejs.initNode('/dlrobot_api_server');
    
    const geometry_msgs = rosnodejs.require('geometry_msgs');
    const actionlib_msgs = rosnodejs.require('actionlib_msgs');
    
    goalPublisher = rosNode.advertise(
        '/move_base_simple/goal',
        geometry_msgs.msg.PoseStamped
    );
    
    cancelPublisher = rosNode.advertise(
        '/move_base/cancel',
        actionlib_msgs.msg.GoalID
    );
    
    console.log('ROS节点初始化成功');
}

// 发送导航目标
app.post('/api/goal', async (req, res) => {
    try {
        const { goal } = req.body;
        const geometry_msgs = rosnodejs.require('geometry_msgs');
        
        const goalMsg = new geometry_msgs.msg.PoseStamped();
        goalMsg.header.frame_id = goal.frame_id || 'map';
        goalMsg.header.stamp = rosnodejs.Time.now();
        
        goalMsg.pose.position.x = goal.position.x;
        goalMsg.pose.position.y = goal.position.y;
        goalMsg.pose.position.z = goal.position.z || 0;
        
        const yaw = goal.orientation.yaw || 0;
        goalMsg.pose.orientation.z = Math.sin(yaw / 2);
        goalMsg.pose.orientation.w = Math.cos(yaw / 2);
        
        goalPublisher.publish(goalMsg);
        
        res.json({ success: true, message: '目标位置已发送' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 取消导航
app.post('/api/goal/cancel', async (req, res) => {
    try {
        const actionlib_msgs = rosnodejs.require('actionlib_msgs');
        const cancelMsg = new actionlib_msgs.msg.GoalID();
        
        cancelPublisher.publish(cancelMsg);
        
        res.json({ success: true, message: '导航任务已取消' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 获取相机图像列表
app.get('/api/camera/images', async (req, res) => {
    try {
        const imagePath = req.query.path || '/home/dlrobot_autocontrol';
        const files = await fs.readdir(imagePath);
        
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.pgm', '.bmp'];
        const images = [];
        
        for (const file of files) {
            const filePath = path.join(imagePath, file);
            const ext = path.extname(file).toLowerCase();
            
            if (imageExtensions.includes(ext)) {
                const stats = await fs.stat(filePath);
                images.push({
                    name: file,
                    path: filePath,
                    size: stats.size,
                    modified: stats.mtime.getTime()
                });
            }
        }
        
        images.sort((a, b) => b.modified - a.modified);
        
        res.json({ images });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取特定图像
app.get('/api/camera/image/:encodedPath', async (req, res) => {
    try {
        const decodedPath = Buffer.from(req.params.encodedPath, 'base64').toString();
        res.sendFile(decodedPath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 启动服务器
initROS().then(() => {
    app.listen(5000, () => {
        console.log('DLRobot API Server 运行在 http://localhost:5000');
    });
});
```

---

## MQTT配置

### ROS到MQTT桥接

如果你需要将ROS话题桥接到MQTT，可以使用 `mqtt_bridge` 包：

**安装:**
```bash
sudo apt-get install ros-noetic-mqtt-bridge
```

**配置文件 (`mqtt_bridge.yaml`):**
```yaml
mqtt:
  client:
    protocol: 4  # MQTTv311
  connection:
    host: localhost
    port: 1883
    keepalive: 60
  
bridge:
  # 机器人位姿
  - factory: mqtt_bridge.bridge:RosToMqttBridge
    msg_type: geometry_msgs.msg:PoseStamped
    topic_from: /robot_pose
    topic_to: /robot_pose
  
  # 激光雷达
  - factory: mqtt_bridge.bridge:RosToMqttBridge
    msg_type: sensor_msgs.msg:LaserScan
    topic_from: /scan
    topic_to: /scan
  
  # 相机图像
  - factory: mqtt_bridge.bridge:RosToMqttBridge
    msg_type: sensor_msgs.msg:Image
    topic_from: /camera/rgb/image_raw
    topic_to: /camera/rgb/image_raw
```

**启动桥接:**
```bash
roslaunch mqtt_bridge mqtt_bridge.launch
```

---

## Web Video Server配置

**安装:**
```bash
sudo apt-get install ros-noetic-web-video-server
```

**启动:**
```bash
# 基本启动
rosrun web_video_server web_video_server

# 指定端口
rosrun web_video_server web_video_server _port:=8080

# 指定地址
rosrun web_video_server web_video_server _address:=0.0.0.0 _port:=8080
```

**访问视频流:**
```
http://192.168.6.214:8080/stream_viewer?topic=/camera/rgb/image_raw
```

---

## 完整启动脚本

创建 `start_backend.sh`:

```bash
#!/bin/bash

echo "========================================="
echo "启动 DLRobot 后端服务"
echo "========================================="

# 1. 启动 Mosquitto MQTT Broker
echo "1. 启动 MQTT Broker..."
sudo systemctl start mosquitto
sleep 2

# 2. 启动 ROS Master
echo "2. 启动 ROS Master..."
roscore &
sleep 3

# 3. 启动 Web Video Server
echo "3. 启动 Web Video Server..."
rosrun web_video_server web_video_server _port:=8080 &
sleep 2

# 4. 启动 MQTT Bridge
echo "4. 启动 MQTT Bridge..."
roslaunch mqtt_bridge mqtt_bridge.launch &
sleep 2

# 5. 启动 REST API Server
echo "5. 启动 REST API Server..."
python3 backend_server.py &

echo "========================================="
echo "所有服务已启动！"
echo "========================================="
echo "MQTT Broker: ws://localhost:9001"
echo "REST API: http://localhost:5000"
echo "Web Video: http://localhost:8080"
echo "========================================="
```

**使用:**
```bash
chmod +x start_backend.sh
./start_backend.sh
```

---

## 测试后端服务

### 测试MQTT连接
```bash
# 订阅话题
mosquitto_sub -h localhost -p 1883 -t "/robot_pose" -v

# 发布测试消息
mosquitto_pub -h localhost -p 1883 -t "/robot_pose" -m '{"x":1.0,"y":2.0,"theta":0.5}'
```

### 测试REST API
```bash
# 健康检查
curl http://localhost:5000/api/health

# 发送导航目标
curl -X POST http://localhost:5000/api/goal \
  -H "Content-Type: application/json" \
  -d '{
    "goal": {
      "frame_id": "map",
      "position": {"x": 1.0, "y": 2.0, "z": 0.0},
      "orientation": {"yaw": 0.5}
    }
  }'

# 获取图像列表
curl http://localhost:5000/api/camera/images?path=/home/dlrobot_autocontrol
```

---

## 故障排查

### MQTT连接失败
```bash
# 检查服务状态
sudo systemctl status mosquitto

# 检查端口
sudo netstat -tulpn | grep 9001

# 查看日志
sudo tail -f /var/log/mosquitto/mosquitto.log
```

### REST API无法访问
```bash
# 检查端口占用
sudo lsof -i :5000

# 检查防火墙
sudo ufw status
sudo ufw allow 5000
```

### ROS话题无数据
```bash
# 列出所有话题
rostopic list

# 查看话题数据
rostopic echo /robot_pose

# 检查话题频率
rostopic hz /scan
```

---

## 安全建议

1. **生产环境配置MQTT认证:**
```conf
# /etc/mosquitto/mosquitto.conf
allow_anonymous false
password_file /etc/mosquitto/passwd
```

2. **使用HTTPS/WSS:**
```conf
listener 9001
protocol websockets
certfile /path/to/cert.pem
keyfile /path/to/key.pem
```

3. **限制API访问:**
```python
# 添加API密钥验证
from functools import wraps

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        if api_key != 'your-secret-key':
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/goal', methods=['POST'])
@require_api_key
def send_goal():
    # ...
```

---

## 联系支持

如有问题，请检查：
- ROS日志: `~/.ros/log/`
- Mosquitto日志: `/var/log/mosquitto/`
- API服务器日志: 控制台输出

---

**文档版本:** 1.0.0  
**最后更新:** 2025-11-05
