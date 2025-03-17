const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Tạo self-signed certificate cho HTTPS/WSS

const httpsServer = https.createServer(app);
const wss = new WebSocket.Server({ server: httpsServer });

// Trạng thái TV
const tvState = {
    power: true,
    volume: 30,
    muted: false,
    currentChannel: 7,
    currentSource: 'HDMI 1',
    channels: Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        name: `Channel ${i + 1}`
    })),
    apps: [
        { id: 'org.tizen.netflix-app', name: 'Netflix' },
        { id: 'youtube.leanback.v4', name: 'YouTube' },
        { id: 'amazon', name: 'Prime Video' }
    ],
    currentApp: null
};

// Cấu hình mô phỏng
const config = {
    networkDelay: {
        min: 50,
        max: 200
    },
    errorRate: 0.05,
    deviceInfo: {
        name: "Fake Samsung TV",
        id: "uuid:fake-samsung-tv-2024",
        deviceType: "Samsung SmartTV",
        modelName: "FAKE-TV-2024",
        modelDescription: "Samsung Fake TV 2024",
        friendlyName: "Living Room TV",
        manufacturer: "Samsung Electronics",
        manufacturerURL: "http://www.samsung.com",
        modelURL: "http://www.samsung.com",
        modelNumber: "UN65FAKE2024",
        serialNumber: "FAKESERIAL2024",
        UDN: "uuid:fake-samsung-tv-2024"
    }
};

// API endpoints
app.get('/api/v2/', (req, res) => {
    simulateNetworkDelay(() => {
        res.json({
            name: config.deviceInfo.name,
            version: "2.0.0",
            device: config.deviceInfo
        });
    });
});

// WebSocket server cho Samsung TV (port 8002)
wss.on('connection', (ws) => {
    console.log('🔌 Client kết nối tới Samsung TV');
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
                handleSamsungCommand(ws, data);
            });
        } catch (error) {
            console.error('⚠️ Lỗi xử lý message:', error);
        }
    });

    ws.on('close', () => {
        console.log('🔌 Client ngắt kết nối');
    });
});

function handleSamsungCommand(ws, data) {
    console.log(`📺 Samsung TV nhận lệnh:`, data);

    if (data.method === "ms.channel.connect") {
        // Xử lý yêu cầu kết nối
        ws.send(JSON.stringify({
            event: "ms.channel.connect",
            data: { token: "FAKE_TOKEN_" + Date.now() }
        }));
        return;
    }

    if (data.method === "ms.remote.control") {
        const command = data.params.DataOfCmd;
        let response = {
            event: "ms.remote.control",
            data: { successful: true }
        };

        // Xử lý các lệnh cụ thể
        switch (command) {
            case "KEY_VOLUP":
                tvState.volume = Math.min(100, tvState.volume + 1);
                break;
            case "KEY_VOLDOWN":
                tvState.volume = Math.max(0, tvState.volume - 1);
                break;
            case "KEY_MUTE":
                tvState.muted = !tvState.muted;
                break;
            case "KEY_POWER":
                tvState.power = !tvState.power;
                break;
            case "KEY_CHUP":
                tvState.currentChannel = (tvState.currentChannel % 100) + 1;
                break;
            case "KEY_CHDOWN":
                tvState.currentChannel = tvState.currentChannel > 1 ? tvState.currentChannel - 1 : 100;
                break;
            case "KEY_HOME":
                tvState.currentApp = null;
                break;
            case "KEY_RETURN":
                // Simulate return action
                break;
            case "KEY_ENTER":
                // Simulate enter action
                break;
            default:
                if (command.startsWith("KEY_")) {
                    console.log(`Nhận được lệnh: ${command}`);
                }
                break;
        }

        ws.send(JSON.stringify(response));
        logTVState();
    }
}

function handleError(ws, data) {
    const errors = [
        { code: "401", message: "Invalid token" },
        { code: "404", message: "Command not supported" },
        { code: "500", message: "Internal TV error" }
    ];

    const error = errors[Math.floor(Math.random() * errors.length)];

    ws.send(JSON.stringify({
        error: true,
        code: error.code,
        message: error.message
    }));
}

function simulateNetworkDelay(callback) {
    const delay = Math.random() * (config.networkDelay.max - config.networkDelay.min) + config.networkDelay.min;
    setTimeout(callback, delay);
}

function shouldSimulateError() {
    return Math.random() < config.errorRate;
}

function logTVState() {
    console.log('\n📺 Samsung TV State:');
    console.log(`Power: ${tvState.power ? 'On 🟢' : 'Off 🔴'}`);
    console.log(`Volume: ${tvState.volume}${tvState.muted ? ' (Muted 🔇)' : ' 🔊'}`);
    console.log(`Channel: ${tvState.currentChannel}`);
    console.log(`Source: ${tvState.currentSource}`);
    console.log(`Current App: ${tvState.currentApp || 'None'}\n`);
}

// Khởi động server
const TV_PORT = 8002;
httpsServer.listen(TV_PORT, () => {
    console.log(`🚀 Fake Samsung TV đang chạy tại https://localhost:${TV_PORT}`);
    logTVState();
});

// API server thường
const API_PORT = 8001;
server.listen(API_PORT, () => {
    console.log(`🚀 Fake Samsung TV API đang chạy tại http://localhost:${API_PORT}`);
}); 