const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Trạng thái của TV
const tvState = {
    power: true,
    volume: 30,
    muted: false,
    currentChannel: 7,
    channels: Array.from({length: 100}, (_, i) => ({
        number: i + 1,
        name: `Channel ${i + 1}`
    })),
    currentInput: 'HDMI_1',
    inputs: ['TV', 'HDMI_1', 'HDMI_2', 'HDMI_3'],
    apps: [
        { id: 'netflix', name: 'Netflix' },
        { id: 'youtube.leanback.v4', name: 'YouTube' },
        { id: 'amazon', name: 'Amazon Prime' }
    ],
    currentApp: null
};

// Cấu hình mô phỏng
const config = {
    networkDelay: {
        min: 50,  // Độ trễ tối thiểu (ms)
        max: 200  // Độ trễ tối đa (ms)
    },
    errorRate: 0.05,  // Tỷ lệ lỗi (5%)
    autoAcceptPairing: true,  // Tự động chấp nhận ghép nối
    pairingDelay: 2000  // Thời gian chờ ghép nối (ms)
};

// Lưu trữ các client đã được ghép nối
const pairedClients = new Set();

// API endpoints
app.get('/api/v2/', (req, res) => {
    simulateNetworkDelay(() => {
        res.json({
            device: {
                name: "Fake LG TV",
                model: "FAKE-TV-2024",
                version: "1.0.0",
                manufacturer: "FakeLG",
                networkType: "wireless",
                status: tvState.power ? "on" : "off"
            }
        });
    });
});

// WebSocket server
wss.on('connection', (ws) => {
    console.log('🔌 Client kết nối');
    logTVState();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📩 Nhận được message:', data);

            if (shouldSimulateError()) {
                handleError(ws, data);
                return;
            }

            simulateNetworkDelay(() => {
                switch (data.type) {
                    case 'register':
                        handleRegister(ws, data);
                        break;
                    case 'request':
                        handleRequest(ws, data);
                        break;
                    default:
                        console.log('❓ Unknown message type:', data.type);
                }
            });
        } catch (error) {
            console.error('⚠️ Lỗi xử lý message:', error);
        }
    });

    ws.on('close', () => {
        console.log('🔌 Client ngắt kết nối');
    });
});

// Xử lý các yêu cầu điều khiển
function handleRequest(ws, data) {
    console.log(`📺 TV nhận lệnh: ${data.uri}`);
    
    const uri = data.uri;
    let response = {
        type: "response",
        id: data.id || "default_id",
        payload: {
            returnValue: true,
            subscribed: false
        }
    };

    // Xử lý các lệnh cụ thể
    if (uri.includes('audio/volumeUp')) {
        tvState.volume = Math.min(100, tvState.volume + 1);
        response.payload.volume = tvState.volume;
    }
    else if (uri.includes('audio/volumeDown')) {
        tvState.volume = Math.max(0, tvState.volume - 1);
        response.payload.volume = tvState.volume;
    }
    else if (uri.includes('audio/setMute')) {
        tvState.muted = !tvState.muted;
        response.payload.muted = tvState.muted;
    }
    else if (uri.includes('system/turnOff')) {
        tvState.power = false;
        response.payload.power = tvState.power;
    }
    else if (uri.includes('tv/channelUp')) {
        tvState.currentChannel = (tvState.currentChannel % 100) + 1;
        response.payload.channelNumber = tvState.currentChannel;
    }
    else if (uri.includes('tv/channelDown')) {
        tvState.currentChannel = tvState.currentChannel > 1 ? tvState.currentChannel - 1 : 100;
        response.payload.channelNumber = tvState.currentChannel;
    }
    else if (uri.includes('switchInput')) {
        const input = uri.split('/').pop();
        if (tvState.inputs.includes(input)) {
            tvState.currentInput = input;
            response.payload.input = input;
        }
    }
    else if (uri.includes('system.launcher/launch')) {
        const appId = uri.split('/').pop();
        const app = tvState.apps.find(a => a.id === appId);
        if (app) {
            tvState.currentApp = app.id;
            response.payload.appId = app.id;
        }
    }

    ws.send(JSON.stringify(response));
    logTVState();
}

// Xử lý lỗi
function handleError(ws, data) {
    const errors = [
        { code: 401, message: "Insufficient permissions" },
        { code: 404, message: "Command not found" },
        { code: 500, message: "Internal TV error" },
        { code: 503, message: "TV is busy" }
    ];
    
    const error = errors[Math.floor(Math.random() * errors.length)];
    
    ws.send(JSON.stringify({
        type: "error",
        id: data.id,
        error: `${error.code} ${error.message}`,
        payload: {}
    }));
}

// Tiện ích
function simulateNetworkDelay(callback) {
    const delay = Math.random() * (config.networkDelay.max - config.networkDelay.min) + config.networkDelay.min;
    setTimeout(callback, delay);
}

function shouldSimulateError() {
    return Math.random() < config.errorRate;
}

function logTVState() {
    console.log('\n📺 TV State:');
    console.log(`Power: ${tvState.power ? 'On 🟢' : 'Off 🔴'}`);
    console.log(`Volume: ${tvState.volume}${tvState.muted ? ' (Muted 🔇)' : ' 🔊'}`);
    console.log(`Channel: ${tvState.currentChannel}`);
    console.log(`Input: ${tvState.currentInput}`);
    console.log(`Current App: ${tvState.currentApp || 'None'}\n`);
}

function generateClientKey() {
    return 'fake_client_key_' + Math.random().toString(36).substr(2, 9);
}

// Xử lý đăng ký giữ nguyên như cũ
function handleRegister(ws, data) {
    const clientKey = generateClientKey();
    
    if (data.payload["client-key"] && pairedClients.has(data.payload["client-key"])) {
        ws.send(JSON.stringify({
            type: "registered",
            id: data.id,
            payload: {
                "client-key": data.payload["client-key"]
            }
        }));
        return;
    }

    console.log('📺 TV hiển thị: "Bạn có muốn cho phép kết nối?"');
    
    setTimeout(() => {
        if (config.autoAcceptPairing) {
            pairedClients.add(clientKey);
            
            ws.send(JSON.stringify({
                type: "response",
                id: data.id,
                payload: {
                    "client-key": clientKey,
                    "pairingType": "PROMPT",
                    "returnValue": true
                }
            }));

            ws.send(JSON.stringify({
                type: "registered",
                id: data.id,
                payload: {
                    "client-key": clientKey
                }
            }));
        }
    }, config.pairingDelay);
}

// Khởi động server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Fake TV đang chạy tại http://localhost:${PORT}`);
    logTVState();
}); 