// 测试CRC计算
function calculateCRC(data) {
  let crcResult = 0;
  for (let i = 0; i < data.length; i++) {
    crcResult += data.charCodeAt(i);
  }
  return (crcResult & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// 测试启动命令
const cmdData = '0010WREGB103';
const crc = calculateCRC(cmdData);
console.log('命令数据:', cmdData);
console.log('CRC计算:', crc);
console.log('完整命令:', `#${cmdData}${crc}`);
