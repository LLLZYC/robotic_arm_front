cmake_minimum_required(VERSION 3.0.2)
project(dlrobot_mqtt)

find_package(catkin REQUIRED COMPONENTS
  rospy
  std_msgs
  geometry_msgs
  nav_msgs
  sensor_msgs
  actionlib_msgs
  cv_bridge
  image_transport
)

catkin_package()

catkin_install_python(PROGRAMS
  scripts/mqtt_bridge_node.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)

install(DIRECTORY config
  DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}
  FILES_MATCHING PATTERN "*.yaml"
)
