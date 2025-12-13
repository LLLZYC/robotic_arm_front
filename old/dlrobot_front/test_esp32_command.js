#!/usr/bin/env node

/**
 * ESP32命令测试脚本
 * 用于验证CRC计算和命令格式
 */

console.log('🔍 ESP32热成像模块命令测试\n')

// 修复后的CRC函数
function calculateCRC(data) {
  let crcResult = 0
  for (let i = 0; i < data.length; i++) {
    crcResult += data.charCodeAt(i)
  }
  return (crcResult & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
}

// 测试数据
function testCRC() {
  console.log('📊 CRC计算测试:')
  console.log('=' .repeat(50))
  
  const cmdData = '0010WREGB103'
  const crc = calculateCRC(cmdData)
  const fullCmd = `#${cmdData}${crc}`
  
  console.log('命令数据:', cmdData)
  console.log('CRC结果:', crc)
  console.log('完整命令:', fullCmd)
  console.log('命令长度:', fullCmd.length, '字节')
  console.log('')
  
  // 验证CRC
  const expectedCRC = '02CC'
  if (crc === expectedCRC) {
    console.log('✅ CRC计算正确！')
  } else {
    console.log('❌ CRC计算错误，期望:', expectedCRC, ' 实际:', crc)
  }
  console.log('')
}

// 模拟命令解析（类似ESP32内部逻辑）
function simulateESP32CommandParser(cmdString) {
  console.log('🤖 模拟ESP32命令解析:')
  console.log('=' .repeat(50))
  
  if (cmdString[0] !== '#') {
    console.log('❌ 错误：命令缺少起始字符 #')
    return false
  }
  
  // 提取各部分
  const lengthStr = cmdString.slice(1, 5)  // 4字节长度
  const command = cmdString.slice(5, 9)     // 4字节命令
  const addressValue = cmdString.slice(9, 13) // 4字节地址+值
  const crcStr = cmdString.slice(13, 17)   // 4字节CRC
  
  console.log('起始符:', '#')
  console.log('长度字段:', lengthStr, '(十进制:', parseInt(lengthStr, 16), ')')
  console.log('命令:', command)
  console.log('地址+值:', addressValue, '(地址:B1, 值:03)')
  console.log('CRC接收:', crcStr)
  
  // 计算CRC
  const calcCRC = calculateCRC(lengthStr + command + addressValue)
  console.log('CRC计算:', calcCRC)
  
  if (calcCRC === crcStr) {
    console.log('✅ CRC校验通过！ESP32会执行此命令。')
    return true
  } else {
    console.log('❌ CRC校验失败！ESP32会拒绝此命令。')
    console.log('期望CRC:', calcCRC)
    console.log('接收CRC:', crcStr)
    return false
  }
}

// 测试不同情况
function runTests() {
  console.log('🧪 运行测试:\n')
  
  // 测试1：正确命令
  console.log('测试1: 正确命令')
  const correctCmd = '#0010WREGB10302CC'
  simulateESP32CommandParser(correctCmd)
  console.log('')
  
  // 测试2：错误CRC（实际问题是Node.js中的calculateCRC函数）
  console.log('测试2: 错误CRC（0000）')
  const wrongCRC = '#0010WREGB1030000'
  simulateESP32CommandParser(wrongCRC)
  console.log('')
  
  // 测试3：原服务器使用的错误命令（空格+换行符）
  console.log('测试3: 带空格的命令（原始错误版本）')
  const oldWrongCmd = '   #0010WREGB1030000\n'
  console.log('原始命令:', JSON.stringify(oldWrongCmd))
  console.log('说明: 多了3个空格和1个换行符，ESP32会解析失败')
  console.log('')
  
  // 测试4：修复后的命令（应正确工作）
  console.log('')
  console.log('=' .repeat(50))
  console.log('🎯 推荐使用的修复命令:')
  console.log('=' .repeat(50))
  const fixedCmd = '#0010WREGB10302CC'
  testCRC()
  if (simulateESP32CommandParser(fixedCmd)) {
    console.log('🎉 此命令应该能让ESP32正常发送数据帧！')
  }
}

// 运行测试
runTests()

console.log('\n' + '=' .repeat(50))
console.log('💡 使用建议:')
console.log('=' .repeat(50))
console.log('1. 确保thermal-proxy-server.js中的calculateCRC函数已修复')
console.log('2. 使用命令: #0010WREGB10302CC')
console.log('3. 不要使用空格或额外的换行符')
console.log('4. 检查ESP32日志确认命令接收')
console.log('')
