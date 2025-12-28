cmake_minimum_required(VERSION 3.0.2)
project(dlrobot_autocontrol)

find_package(catkin REQUIRED COMPONENTS
  rospy
  geometry_msgs
  move_base_msgs
  std_msgs
  actionlib_msgs
  std_srvs
  tf
  sensor_msgs
  cv_bridge
)

catkin_package(
  CATKIN_DEPENDS
    geometry_msgs
    move_base_msgs
    std_msgs
    actionlib_msgs
    std_srvs
    tf
    sensor_msgs
    cv_bridge
)

catkin_install_python(PROGRAMS
  scripts/autocontrol_node.py
  DESTINATION ${CATKIN_PACKAGE_BIN_DESTINATION}
)

install(DIRECTORY config launch
  DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}
)
