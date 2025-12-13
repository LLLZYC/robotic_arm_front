#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bridge selected ROS topics into MQTT messages using a YAML configuration."""
import base64
import json
import os
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlencode

import rospy
import yaml
from roslib.message import get_message_class

import paho.mqtt.client as mqtt
from cv_bridge import CvBridge, CvBridgeError
import cv2
import numpy as np

from actionlib_msgs.msg import GoalStatusArray
from geometry_msgs.msg import PoseWithCovarianceStamped, Pose, Twist
from nav_msgs.msg import OccupancyGrid
from sensor_msgs.msg import Image, CompressedImage, LaserScan


class ConfigError(RuntimeError):
    pass


def header_to_dict(header) -> Dict[str, Any]:
    return {
        "stamp": header.stamp.to_sec(),
        "frame_id": header.frame_id,
        "seq": header.seq,
    }


def pose_to_dict(pose: Pose) -> Dict[str, Any]:
    return {
        "position": {
            "x": pose.position.x,
            "y": pose.position.y,
            "z": pose.position.z,
        },
        "orientation": {
            "x": pose.orientation.x,
            "y": pose.orientation.y,
            "z": pose.orientation.z,
            "w": pose.orientation.w,
        },
    }


def occupancy_grid_to_payload(msg: OccupancyGrid) -> Dict[str, Any]:
    width = int(msg.info.width)
    height = int(msg.info.height)
    resolution = msg.info.resolution
    origin_pose = msg.info.origin
    if width <= 0 or height <= 0:
        return {
            "header": header_to_dict(msg.header),
            "map_url": "",
            "resolution": resolution,
            "origin": pose_to_dict(origin_pose)["position"],
            "width": width,
            "height": height,
        }

    data = np.array(msg.data, dtype=np.int16).reshape((height, width))
    # 初始化为未知区域颜色
    image = np.full((height, width), 128, dtype=np.uint8)
    known_mask = data >= 0
    if np.any(known_mask):
        known_values = np.clip(data[known_mask], 0, 100)
        # 将占据率映射到灰度，0 -> 白色(255)，100 -> 黑色(0)
        image[known_mask] = ((100 - known_values) * 255) // 100

    # 以顶部为北方，翻转 Y 轴以匹配前端显示习惯
    image = np.flipud(image)

    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise ConfigError("Failed to encode map image to PNG")
    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
    data_url = f"data:image/png;base64,{encoded}"

    return {
        "header": header_to_dict(msg.header),
        "map_url": data_url,
        "resolution": resolution,
        "origin": {
            "x": origin_pose.position.x,
            "y": origin_pose.position.y,
            "z": origin_pose.position.z,
        },
        "width": width,
        "height": height,
    }


def pose_with_covariance_to_payload(msg: PoseWithCovarianceStamped) -> Dict[str, Any]:
    pose_dict = pose_to_dict(msg.pose.pose)
    return {
        "header": header_to_dict(msg.header),
        "pose": {
            "position": pose_dict["position"],
            "orientation": pose_dict["orientation"],
        },
        "covariance": list(msg.pose.covariance),
    }


def laser_scan_to_dict(msg: LaserScan) -> Dict[str, Any]:
    return {
        "header": header_to_dict(msg.header),
        "angle_min": msg.angle_min,
        "angle_max": msg.angle_max,
        "angle_increment": msg.angle_increment,
        "time_increment": msg.time_increment,
        "scan_time": msg.scan_time,
        "range_min": msg.range_min,
        "range_max": msg.range_max,
        "ranges": list(msg.ranges),
        "intensities": list(msg.intensities),
    }


def goal_status_to_dict(status) -> Dict[str, Any]:
    return {
        "goal_id": {
            "stamp": status.goal_id.stamp.to_sec(),
            "id": status.goal_id.id,
        },
        "status": status.status,
        "text": status.text,
    }


def goal_status_array_to_payload(msg: GoalStatusArray) -> Dict[str, Any]:
    return {
        "header": header_to_dict(msg.header),
        "status_list": [goal_status_to_dict(status) for status in msg.status_list],
    }


def compressed_image_to_payload(msg: CompressedImage) -> Dict[str, Any]:
    encoded = base64.b64encode(msg.data).decode("ascii")
    fmt = msg.format or "jpeg"
    data_url = f"data:image/{fmt};base64,{encoded}"
    return {
        "header": header_to_dict(msg.header),
        "image_data": data_url,
        "format": fmt,
    }


def web_video_server_payload(entry: Dict[str, Any]) -> Dict[str, Any]:
    # 构造 web_video_server 元数据，避免在 MQTT 中重复传输大体积图像帧。
    config = entry.get("web_video", {}) or {}
    stream_topic = config.get("topic") or entry.get("topic")
    if not stream_topic:
        raise ConfigError("web_video_server mode requires 'topic' to be set")
    normalized_topic = str(stream_topic).lstrip("/")
    payload: Dict[str, Any] = {
        "topic": normalized_topic,
        "stream_topic": stream_topic,
    }
    base_url = config.get("base_url")
    stream_path = config.get("stream_path", "/stream")
    params: Dict[str, Any] = {"topic": stream_topic}
    stream_type = config.get("stream_type")
    if stream_type:
        params["type"] = stream_type
        payload["stream_type"] = stream_type
    width = config.get("width")
    if width:
        params["width"] = width
        payload["width"] = width
    height = config.get("height")
    if height:
        params["height"] = height
        payload["height"] = height
    quality = config.get("quality")
    if quality:
        params["quality"] = quality
    bitrate = config.get("bitrate")
    if bitrate:
        params["bitrate"] = bitrate
    custom_query = config.get("query", {}) or {}
    for key, value in custom_query.items():
        if value is None:
            continue
        params[key] = value
    if base_url:
        base = base_url.rstrip("/")
        path = stream_path if stream_path.startswith("/") else f"/{stream_path}"
        payload["web_video_server_url"] = f"{base}{path}?{urlencode(params)}"
    snapshot_path = config.get("snapshot_path")
    if base_url and snapshot_path:
        snap_path = snapshot_path if snapshot_path.startswith("/") else f"/{snapshot_path}"
        payload["snapshot_url"] = f"{base}{snap_path}?{urlencode({'topic': stream_topic})}"
    return payload


def image_to_payload(msg: Image, bridge: CvBridge, *, jpeg_quality: int, desired_encoding: str) -> Optional[Dict[str, Any]]:
    try:
        cv_image = bridge.imgmsg_to_cv2(msg, desired_encoding)
    except (CvBridgeError, ImportError) as exc:
        rospy.logwarn_once(
            "dlrobot_mqtt: failed to convert image; ensure cv_bridge supports this Python and encoding (%s)",
            exc,
        )
        return None
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(jpeg_quality)]
    ok, buffer = cv2.imencode(".jpg", cv_image, encode_params)
    if not ok:
        rospy.logwarn("dlrobot_mqtt: jpeg encoding failed")
        return None
    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
    data_url = f"data:image/jpeg;base64,{encoded}"
    return {
        "header": header_to_dict(msg.header),
        "image_data": data_url,
        "encoding": desired_encoding,
        "format": "jpeg",
    }


def twist_from_json(data: Dict[str, Any], *, linear_scale: float = 1.0, angular_scale: float = 1.0) -> Twist:
    msg = Twist()
    linear = data.get("linear", {}) or {}
    angular = data.get("angular", {}) or {}
    try:
        msg.linear.x = float(linear.get("x", 0.0)) * linear_scale
        msg.linear.y = float(linear.get("y", 0.0)) * linear_scale
        msg.linear.z = float(linear.get("z", 0.0)) * linear_scale
        msg.angular.x = float(angular.get("x", 0.0)) * angular_scale
        msg.angular.y = float(angular.get("y", 0.0)) * angular_scale
        msg.angular.z = float(angular.get("z", 0.0)) * angular_scale
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"Invalid twist components: {exc}") from exc
    return msg


class MQTTClientWrapper:
    def __init__(self, config: Dict[str, Any]):
        self._lock = threading.Lock()
        self._connected = threading.Event()
        client_id = config.get("client_id", "dlrobot_mqtt_bridge")
        clean_session = bool(config.get("clean_session", True))
        self._client = mqtt.Client(client_id=client_id, clean_session=clean_session)
        username = config.get("username") or None
        password = config.get("password") or None
        if username:
            self._client.username_pw_set(username, password)
        tls_cfg = config.get("tls", {})
        if tls_cfg.get("enabled"):
            ca_cert = tls_cfg.get("ca_cert") or None
            certfile = tls_cfg.get("certfile") or None
            keyfile = tls_cfg.get("keyfile") or None
            self._client.tls_set(ca_certs=ca_cert, certfile=certfile, keyfile=keyfile)
        reconnect_delay = float(config.get("reconnect_delay", 2.0))
        reconnect_delay_max = float(config.get("reconnect_delay_max", 30.0))
        self._client.reconnect_delay_set(reconnect_delay, reconnect_delay_max)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._subscriptions = {}  # type: Dict[str, Tuple[int, Callable[[str, bytes], None]]]
        host = config.get("host", "localhost")
        port = int(config.get("port", 1883))
        keepalive = int(config.get("keepalive", 60))
        try:
            self._client.connect_async(host, port, keepalive)
        except Exception as exc:  # pylint: disable=broad-except
            rospy.logerr("dlrobot_mqtt: mqtt connect_async failed (%s)", exc)
        self._client.loop_start()

    def _on_connect(self, client, userdata, flags, rc):  # noqa: D401
        del client, userdata, flags  # unused
        if rc == mqtt.MQTT_ERR_SUCCESS:
            self._connected.set()
            rospy.loginfo("dlrobot_mqtt: connected to MQTT broker")
            with self._lock:
                for topic, (qos, _) in self._subscriptions.items():
                    self._client.subscribe(topic, qos)
        else:
            rospy.logwarn("dlrobot_mqtt: MQTT connection error code %s", rc)

    def _on_disconnect(self, client, userdata, rc):  # noqa: D401
        del client, userdata
        self._connected.clear()
        if rc != mqtt.MQTT_ERR_SUCCESS:
            rospy.logwarn("dlrobot_mqtt: unexpected MQTT disconnect (rc=%s)", rc)

    def _on_message(self, client, userdata, msg):  # noqa: D401
        del client, userdata
        callback = None
        with self._lock:
            entry = self._subscriptions.get(msg.topic)
            if entry:
                callback = entry[1]
        if callback:
            try:
                callback(msg.topic, msg.payload)
            except Exception as exc:  # noqa: BLE001
                rospy.logwarn("dlrobot_mqtt: command handler error for %s (%s)", msg.topic, exc)

    def publish(self, topic: str, payload: Dict[str, Any], *, qos: int = 0, retain: bool = False) -> None:
        json_payload = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
        with self._lock:
            result = self._client.publish(topic, json_payload, qos=qos, retain=retain)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            rospy.logwarn_throttle(5.0, "dlrobot_mqtt: publish failed (rc=%s)", result.rc)

    def subscribe(self, topic: str, qos: int, callback: Callable[[str, bytes], None]) -> None:
        normalized = topic.strip()
        if not normalized:
            raise ConfigError("MQTT subscription topic cannot be empty")
        with self._lock:
            self._subscriptions[normalized] = (qos, callback)
            if self._connected.is_set():
                self._client.subscribe(normalized, qos)

    def close(self):
        try:
            self._client.disconnect()
        finally:
            self._client.loop_stop()

    def wait_for_connection(self, timeout: float) -> bool:
        return self._connected.wait(timeout=timeout)


class TopicSubscription:
    def __init__(
        self,
        mqtt_client: MQTTClientWrapper,
        name: str,
        topic: str,
        message_type: str,
        payload_builder: Callable[[Any], Optional[Dict[str, Any]]],
        throttle_rate: Optional[float],
        *,
        mqtt_topic: str,
        queue_size: int,
        qos: int,
        retain: bool,
        static_fields: Optional[Dict[str, Any]] = None,
    ):
        self._mqtt_client = mqtt_client
        self._name = name or topic
        self._topic = topic
        if not mqtt_topic:
            raise ConfigError("MQTT topic cannot be empty")
        self._mqtt_topic = mqtt_topic
        self._payload_builder = payload_builder
        self._throttle_period = 0.0
        if throttle_rate and throttle_rate > 0:
            self._throttle_period = 1.0 / float(throttle_rate)
        self._last_sent = 0.0
        self._qos = max(0, min(2, int(qos)))
        self._retain = bool(retain)
        self._static_fields = dict(static_fields or {})
        self._message_class = self._resolve_message_class(message_type)
        self._subscriber = rospy.Subscriber(
            topic,
            self._message_class,
            self._callback,
            queue_size=queue_size,
        )

    @staticmethod
    def _resolve_message_class(message_type: str):
        cls = get_message_class(message_type)
        if cls is None:
            raise ConfigError(f"Unknown message type: {message_type}")
        return cls

    def _callback(self, msg):
        now = time.monotonic()
        if self._throttle_period and now - self._last_sent < self._throttle_period:
            return
        payload = self._payload_builder(msg)
        if payload is None:
            return
        if self._static_fields:
            payload.update(self._static_fields)
        payload["ros_topic"] = self._topic
        payload["timestamp"] = rospy.Time.now().to_sec()
        self._mqtt_client.publish(self._mqtt_topic, payload, qos=self._qos, retain=self._retain)
        self._last_sent = now


class CommandSubscription:
    def __init__(
        self,
        mqtt_client: MQTTClientWrapper,
        name: str,
        mqtt_topic: str,
        message_type: str,
        builder: Callable[[Dict[str, Any]], Optional[Any]],
        *,
        ros_topic: str,
        qos: int,
        queue_size: int,
    ):
        self._name = name or mqtt_topic
        if not mqtt_topic:
            raise ConfigError("Command entry requires 'mqtt_topic'")
        self._mqtt_topic = mqtt_topic
        self._builder = builder
        self._publisher = self._create_publisher(message_type, ros_topic, queue_size)
        mqtt_client.subscribe(self._mqtt_topic, qos, self._handle_message)
        rospy.loginfo("dlrobot_mqtt: subscribing MQTT %s -> %s (%s)", mqtt_topic, ros_topic, message_type)

    @staticmethod
    def _create_publisher(message_type: str, ros_topic: str, queue_size: int):
        message_class = TopicSubscription._resolve_message_class(message_type)
        return rospy.Publisher(ros_topic, message_class, queue_size=queue_size)

    def _handle_message(self, topic: str, payload: bytes) -> None:
        try:
            decoded = payload.decode("utf-8") if isinstance(payload, (bytes, bytearray)) else str(payload)
            data = json.loads(decoded) if decoded else {}
        except ValueError as exc:
            rospy.logwarn("dlrobot_mqtt: %s invalid JSON payload: %s", topic, exc)
            return
        msg = None
        try:
            msg = self._builder(data)
        except Exception as exc:  # noqa: BLE001
            rospy.logwarn("dlrobot_mqtt: %s command conversion failed: %s", topic, exc)
            return
        if msg is None:
            return
        self._publisher.publish(msg)


class MQTTBridgeNode:
    def __init__(self):
        rospy.init_node("dlrobot_mqtt_bridge")
        self._bridge = CvBridge()
        config = self._load_config()
        mqtt_cfg = config.get("mqtt", {})
        base_topic = mqtt_cfg.get("base_topic")
        if base_topic is None:
            base_topic = ""
        mqtt_cfg["base_topic"] = base_topic.rstrip("/")
        self._mqtt_client = MQTTClientWrapper(mqtt_cfg)
        connected = self._mqtt_client.wait_for_connection(timeout=10.0)
        if not connected:
            rospy.logwarn("dlrobot_mqtt: MQTT broker not reachable yet")
        subscriptions = config.get("subscriptions", [])
        if not subscriptions:
            raise ConfigError("No subscriptions defined in configuration")
        self._subscriptions = []
        for entry in subscriptions:
            if not bool(entry.get("enabled", True)):
                continue
            try:
                subscription = self._create_subscription(entry, mqtt_cfg)
            except ConfigError as exc:
                rospy.logerr("dlrobot_mqtt: skipping subscription (%s)", exc)
                continue
            self._subscriptions.append(subscription)
        commands = config.get("commands", [])
        self._commands = []
        for entry in commands:
            if not bool(entry.get("enabled", True)):
                continue
            try:
                command = self._create_command(entry)
            except ConfigError as exc:
                rospy.logerr("dlrobot_mqtt: skipping command subscription (%s)", exc)
                continue
            self._commands.append(command)
        rospy.on_shutdown(self._shutdown)

    def _load_config(self) -> Dict[str, Any]:
        pkg_path, default_path = self._default_config_path()
        config_path = rospy.get_param("~config_file", default_path)
        config_path = os.path.expanduser(os.path.expandvars(config_path))
        if not os.path.isabs(config_path):
            config_path = os.path.join(pkg_path, config_path)
        if not os.path.exists(config_path):
            raise ConfigError(f"Config file not found: {config_path}")
        encoding = str(rospy.get_param("~config_encoding", "utf-8"))
        try:
            with open(config_path, "r", encoding=encoding) as handle:
                data = yaml.safe_load(handle) or {}
        except UnicodeDecodeError as exc:
            raise ConfigError(
                f"Failed to decode config file using encoding '{encoding}'. "
                "Convert the file to UTF-8 or set '~config_encoding' to the correct encoding."
            ) from exc
        if not isinstance(data, dict):
            raise ConfigError("Config root must be a dictionary")
        return data

    @staticmethod
    def _default_config_path() -> Tuple[str, str]:
        try:
            import rospkg
        except ImportError as exc:
            raise ConfigError("rospkg is required to locate default config") from exc
        pkg_path = rospkg.RosPack().get_path("dlrobot_mqtt")
        default_path = os.path.join(pkg_path, "config", "topics.yaml")
        return pkg_path, default_path

    def _create_subscription(self, entry: Dict[str, Any], mqtt_cfg: Dict[str, Any]) -> TopicSubscription:
        name = entry.get("name") or entry.get("topic")
        topic = entry.get("topic")
        message_type = entry.get("type")
        if not topic or not message_type:
            raise ConfigError("Each subscription requires 'topic' and 'type'")
        throttle = entry.get("throttle_rate")
        builder = self._select_builder(entry)
        queue_size = max(1, int(entry.get("queue_size", 1)))
        qos = int(entry.get("qos", 0))
        retain = bool(entry.get("retain", False))
        mqtt_topic = self._resolve_mqtt_topic(entry, mqtt_cfg.get("base_topic"))
        static_fields = entry.get("static_fields") or entry.get("static_payload")
        if static_fields and not isinstance(static_fields, dict):
            raise ConfigError("static_fields must be a dictionary if provided")
        rospy.loginfo("dlrobot_mqtt: forwarding %s (%s) -> %s", topic, message_type, mqtt_topic)
        return TopicSubscription(
            self._mqtt_client,
            name,
            topic,
            message_type,
            builder,
            throttle,
            mqtt_topic=mqtt_topic,
            queue_size=queue_size,
            qos=qos,
            retain=retain,
            static_fields=static_fields,
        )

    def _create_command(self, entry: Dict[str, Any]) -> CommandSubscription:
        name = entry.get("name") or entry.get("mqtt_topic")
        mqtt_topic = entry.get("mqtt_topic")
        ros_topic = entry.get("ros_topic")
        message_type = entry.get("type")
        if not mqtt_topic or not ros_topic or not message_type:
            raise ConfigError("Command entry requires 'mqtt_topic', 'ros_topic', and 'type'")
        qos = int(entry.get("qos", 0))
        queue_size = max(1, int(entry.get("queue_size", 1)))
        builder = self._select_command_builder(entry)
        return CommandSubscription(
            self._mqtt_client,
            name,
            mqtt_topic,
            message_type,
            builder,
            ros_topic=ros_topic,
            qos=qos,
            queue_size=queue_size,
        )

    def _select_command_builder(self, entry: Dict[str, Any]) -> Callable[[Dict[str, Any]], Optional[Any]]:
        message_type = entry.get("type")
        if message_type == "geometry_msgs/Twist":
            linear_scale = float(entry.get("scale_linear", 1.0))
            angular_scale = float(entry.get("scale_angular", 1.0))
            return lambda data: twist_from_json(data, linear_scale=linear_scale, angular_scale=angular_scale)
        raise ConfigError(f"Unsupported command message type: {message_type}")

    def _resolve_mqtt_topic(self, entry: Dict[str, Any], base_topic: Optional[str]) -> str:
        explicit = entry.get("mqtt_topic")
        if explicit:
            return self._normalize_topic(explicit)

        ros_topic = entry.get("topic")
        if not ros_topic:
            raise ConfigError("Subscription entry missing ROS topic")

        if base_topic:
            base = base_topic.strip()
            suffix = (entry.get("name") or ros_topic).strip()
            base = base.lstrip("/").rstrip("/")
            suffix = suffix.lstrip("/")
            if base:
                combined = f"/{base}/{suffix}" if suffix else f"/{base}"
            else:
                combined = f"/{suffix}" if suffix else f"/{base}"
            return self._normalize_topic(combined)

        return self._normalize_topic(ros_topic)

    @staticmethod
    def _normalize_topic(topic: str) -> str:
        normalized = (topic or "").strip()
        if not normalized:
            raise ConfigError("Resolved MQTT topic is empty")
        if not normalized.startswith("/"):
            normalized = f"/{normalized}"
        while "//" in normalized:
            normalized = normalized.replace("//", "/")
        return normalized

    def _select_builder(self, entry: Dict[str, Any]) -> Callable[[Any], Optional[Dict[str, Any]]]:
        message_type = entry.get("type")
        if message_type == "nav_msgs/OccupancyGrid":
            return occupancy_grid_to_payload
        if message_type == "geometry_msgs/PoseWithCovarianceStamped":
            return pose_with_covariance_to_payload
        if message_type == "sensor_msgs/LaserScan":
            return laser_scan_to_dict
        if message_type == "actionlib_msgs/GoalStatusArray":
            return goal_status_array_to_payload
        mode = (entry.get("mode") or "").strip().lower()
        if mode == "web_video_server":
            return lambda msg: web_video_server_payload(entry)
        if message_type == "sensor_msgs/CompressedImage":
            return compressed_image_to_payload
        if message_type == "sensor_msgs/Image":
            quality = int(entry.get("jpeg_quality", 85))
            desired_encoding = entry.get("image_encoding", "bgr8")
            return lambda msg: image_to_payload(msg, self._bridge, jpeg_quality=quality, desired_encoding=desired_encoding)
        raise ConfigError(f"Unsupported message type: {message_type}")

    def spin(self):
        rospy.loginfo("dlrobot_mqtt: bridge started with %d subscriptions", len(self._subscriptions))
        rospy.spin()

    def _shutdown(self):
        rospy.loginfo("dlrobot_mqtt: shutting down")
        self._mqtt_client.close()


def main():
    try:
        node = MQTTBridgeNode()
    except ConfigError as exc:
        rospy.logfatal("dlrobot_mqtt: configuration error (%s)", exc)
        return
    node.spin()


if __name__ == "__main__":
    main()
