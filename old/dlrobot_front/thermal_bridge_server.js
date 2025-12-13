import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

// Middleware
app.use(cors())
app.use(express.json())

// Global variables
let pythonProcess = null
let frameBuffer = null
let currentThermalIp = '192.168.31.170' // Default IP
let isStopping = false // Flag to indicate we are intentionally stopping the process

// Broadcast to all connected clients
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(data))
    }
  })
}

// Python script management
const startPythonScript = (ip = currentThermalIp) => {
  // If we are already stopping, or a process exists, we need to handle that
  if (pythonProcess) {
    console.log(`[Manager] Stopping existing Python script (PID: ${pythonProcess.pid}) to switch to ${ip}...`)
    isStopping = true
    pythonProcess.kill()
    // The 'close' handler will trigger. We rely on a timeout or callback to restart.
    // But to be robust, let's just wait a bit and try starting again.
    // We update currentThermalIp so the next start uses the new one.
    currentThermalIp = ip
    
    // We don't recursively call startPythonScript here immediately to avoid race conditions.
    // Instead, we let the close handler know we want to restart if it was a reconfig.
    // But simpler: just wait and retry.
    setTimeout(() => {
        if (!pythonProcess) {
            startPythonScript(ip)
        } else {
            // If it's still running (stuck?), force kill again? 
            // For now, assume it dies.
            startPythonScript(ip)
        }
    }, 2000) // Give it 2 seconds to die and release sockets
    return
  }

  currentThermalIp = ip
  isStopping = false
  console.log(`[Manager] Starting Python thermal imaging script connecting to ${ip}...`)
  
  try {
    // Start the Python thermal camera script
    const pythonScriptPath = join(__dirname, 'thermal_bridge.py')
    pythonProcess = spawn('python', [pythonScriptPath, '--host', ip], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Handle Python script output
    pythonProcess.stdout.on('data', (data) => {
      try {
        const output = data.toString().trim()
        const lines = output.split('\n')
        
        lines.forEach(line => {
          if (line.trim()) {
            try {
              const frameData = JSON.parse(line)
              frameBuffer = frameData
              
              // Broadcast frame to all connected clients
              broadcast({
                type: 'video_frame',
                data: {
                    frame: frameData.frame,
                    timestamp: frameData.timestamp,
                    temperature_range: frameData.temperature_range,
                    center_temp: frameData.center_temp,
                    max_temp: frameData.max_temp,
                    temps: frameData.temps,
                    width: frameData.width,
                    height: frameData.height
                }
              })
            } catch (parseError) {
              // console.log('Python output parse error:', line)
            }
          }
        })
      } catch (error) {
        console.error('Error processing Python output:', error)
      }
    })

    pythonProcess.stderr.on('data', (data) => {
      console.error('Python script error:', data.toString())
    })

    pythonProcess.on('close', (code) => {
      console.log(`[Manager] Python script exited with code ${code}`)
      pythonProcess = null
      broadcast({ type: 'python_status', data: { running: false } })
      
      // If we are NOT intentionally stopping (i.e. it crashed or timed out), restart it.
      if (!isStopping) {
          console.log('[Manager] Process crashed or timed out. Scheduling restart in 3s...')
          setTimeout(() => {
              // Check if a process was started in the meantime (unlikely but possible)
              if (!pythonProcess) {
                  startPythonScript(currentThermalIp)
              }
          }, 3000) // 3s delay to let ESP32 recover
      } else {
          console.log('[Manager] Process stopped intentionally. Waiting for next command.')
      }
    })

    pythonProcess.on('error', (error) => {
      console.error('[Manager] Failed to start Python script:', error)
      pythonProcess = null
      broadcast({ type: 'python_status', data: { running: false, error: error.message } })
    })

    console.log(`[Manager] Python script started with PID: ${pythonProcess.pid}`)
    broadcast({ type: 'python_status', data: { running: true, pid: pythonProcess.pid, ip: currentThermalIp } })
    
    return { status: true, pid: pythonProcess.pid }
    
  } catch (error) {
    console.error('[Manager] Error starting Python script:', error)
    return { status: false, error: error.message }
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected')

  // Send current connection status
  ws.send(JSON.stringify({ 
    type: 'connection_status',
    data: {
        connected: true,
        hasPythonProcess: pythonProcess !== null,
        currentIp: currentThermalIp
    }
  }))

  // Handle incoming messages from client
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message)
      if (msg.type === 'configure_thermal') {
        const newIp = msg.data.host
        if (newIp) {
            // Always restart if IP is sent, to be sure we are using the right one
            // or if the user wants to force reconnect
            if (newIp !== currentThermalIp || !pythonProcess) {
                console.log(`[WS] Reconfiguring thermal camera IP to: ${newIp}`)
                startPythonScript(newIp)
            } else {
                console.log(`[WS] IP ${newIp} is already active. Ignoring.`)
            }
        }
      }
    } catch (e) {
      console.error('Error parsing message:', e)
    }
  })

  // Send current frame if available
  if (frameBuffer) {
    ws.send(JSON.stringify({
      type: 'video_frame',
      data: {
        frame: frameBuffer.frame,
        timestamp: frameBuffer.timestamp,
        temperature_range: frameBuffer.temperature_range,
        center_temp: frameBuffer.center_temp,
        max_temp: frameBuffer.max_temp,
        temps: frameBuffer.temps,
        width: frameBuffer.width,
        height: frameBuffer.height
      }
    }))
  }

  ws.on('close', () => {
    console.log('Client disconnected')
  })
})

// Start server
const PORT = 3002
server.listen(PORT, () => {
  console.log(`Thermal Bridge Server running on port ${PORT}`)
  console.log(`WebSocket server ready for connections`)
  
  // DO NOT auto-start Python script on server start.
  // Wait for the frontend to connect and provide the IP.
  console.log('Waiting for client to provide ESP32 IP configuration...')
})
