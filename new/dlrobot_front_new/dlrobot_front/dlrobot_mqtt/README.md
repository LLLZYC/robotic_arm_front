# dlrobot_mqtt

ROS → MQTT 桥接节点，用于将 `dlrobot` 机器人系统选定的话题转发到前端。

## 功能概述

- 基于 YAML 配置文件，按需订阅 ROS 话题，并以 JSON 形式发布到 MQTT。
- 支持 `/map`、`/amcl_pose`、`/scan`、`/move_base/status`、`/camera/image`、`/camera/video` 等默认话题。
- 自动将地图和图像消息转换为前端可直接使用的 data URL。
- 每个订阅可单独配置节流、QoS、Retain、队列长度，以及自定义 MQTT 目标话题。
- 支持为单个订阅追加静态字段，或通过 `mode: web_video_server` 直接推送 web_video_server 流信息。

## 快速使用

1. **安装依赖**  
   确保 ROS 环境中安装了以下 Python 包：`rospy`、`paho-mqtt`、`cv_bridge`、`opencv-python`、`numpy`。例如：
   ```bash
   sudo apt install ros-${ROS_DISTRO}-cv-bridge python3-paho-mqtt python3-opencv
   pip install numpy
   ```

2. **配置 YAML**  
   编辑 `config/topics.yaml`，配置 MQTT 代理地址及需要转发的话题。默认情况下 `base_topic` 为空，MQTT 话题名称与 ROS 话题一致，例如 `/map`。

3. **构建并启动**  
   ```bash
   cd /home/what/ros源码/ros╘┤┬δ
   catkin_make
   source devel/setup.bash
   rosrun dlrobot_mqtt mqtt_bridge_node.py
   ```

4. **前端联调**  
   前端默认订阅 `/map`、`/amcl_pose`、`/scan`、`/move_base/status`、`/camera/image`、`/camera/video`。可在 MQTT 代理开启 WebSocket（如 `ws://localhost:9001`）后直接查看数据。

## 配置说明

配置文件：`config/topics.yaml`

### 顶层字段 `mqtt`

| 字段 | 说明 |
|------|------|
| `host` | MQTT 服务器地址（TCP） |
| `port` | MQTT TCP 端口（默认 1883） |
| `username` / `password` | 账号密码（可选） |
| `client_id` | MQTT 客户端 ID |
| `base_topic` | 全局 MQTT 前缀（留空表示使用 ROS 原始话题名，例如 `/map`） |
| `keepalive` | 心跳间隔（秒） |
| `tls` | TLS 相关配置（启用后需提供证书路径） |
| `reconnect_delay(_max)` | 重连参数 |
| `clean_session` | 是否使用 clean session |

### `subscriptions` 列表

每个元素描述一条 ROS 话题 → MQTT 话题的映射：

| 字段 | 说明 |
|------|------|
| `name` | 可选别名，未指定 `mqtt_topic` 时会拼接到 `base_topic` 后 |
| `topic` | ROS 话题名称（必填） |
| `type` | ROS 消息类型（如 `nav_msgs/OccupancyGrid`） |
| `enabled` | 布尔值，是否启用此订阅 |
| `mqtt_topic` | 覆盖默认 MQTT 话题（可选） |
| `throttle_rate` | 最大发送频率（Hz，可选） |
| `queue_size` | ROS Subscriber 队列大小（默认 1） |
| `qos` | MQTT 发布 QoS (0/1/2) |
| `retain` | MQTT 发布 retain 标志 |
| `static_fields` | 静态 JSON 字段（会合并进 payload，可选） |
| `mode` | 特殊模式，目前支持 `web_video_server` |
| `web_video` | `web_video_server` 模式专用配置（见下） |
| `image_encoding` / `jpeg_quality` | 图像类消息专用参数 |

当 `mode: web_video_server` 时，可在 `web_video` 下配置：

| 字段 | 说明 |
|------|------|
| `topic` | 提供给 web_video_server 的图像话题（默认沿用 `topic`） |
| `base_url` | web_video_server 服务地址（如 `http://localhost:8080`） |
| `stream_type` | 优先推荐的流类型（`mjpeg`/`h264`/`vp8` 等，可选） |
| `width` / `height` | 默认分辨率（可选） |
| `quality` / `bitrate` | 质量或码率参数（可选） |
| `stream_path` / `snapshot_path` | 自定义流、快照接口路径（可选） |

## 发布数据格式

- `/map`：包含 `map_url`（PNG data URL）、`resolution`、`origin`、`width`、`height`。
- `/amcl_pose`：`pose.position.{x,y,z}`、`pose.orientation.{x,y,z,w}`、`covariance`。
- `/scan`：`ranges`、`angle_min`、`angle_max` 等原始字段。
- `/move_base/status`：`status_list`（数组，每项含 `status`、`text`、`goal_id`）。
- `/camera/image`：`image_data`（data URL）以及 `format`、`encoding`。
- `/camera/video`：在默认配置中发送 `topic`（去掉前导 `/`）、`stream_topic`（原始话题）、`web_video_server_url`、`stream_type` 等字段，方便前端根据 web_video_server 自动拼装播放地址；如需回退到直接推送压缩图像，可禁用 `mode: web_video_server`。

如需新增话题，可在 `subscriptions` 中追加条目，并在 `mqtt_bridge_node.py` 中实现对应的转换函数。

## 常见问题

- **地图过大**：默认将完整地图编码为 PNG data URL。如果网络拥塞，可改为保留 `map_url` 指向静态 HTTP 服务。
- **WebSocket 端口**：前端使用 WebSocket（默认 `ws://localhost:9001`），请在 MQTT 代理（如 Mosquitto）中额外启用 WS 监听。
- **TLS/认证**：在 `mqtt` 配置内启用 `tls.enabled` 并填写证书信息即可。

欢迎根据项目需求扩展或定制。
