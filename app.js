const express = require("express");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const cors = require("cors");
const os = require("os");
const ip = require("ip");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());

let foundTV = null;
let tvToken = null;
let globalWs = null; // Thêm biến để lưu WebSocket connection

// 1️⃣ Lấy dải mạng LAN hiện tại (ví dụ: 192.168.1.xxx)
function getLocalSubnet() {
    const localIp = ip.address();
    const subnet = localIp.substring(0, localIp.lastIndexOf(".") + 1); // Lấy phần "192.168.1."
    return subnet;
}

// 2️⃣ Quét tất cả địa chỉ IP trong mạng LAN để tìm TV
async function scanNetworkForSamsungTV() {
    const subnet = getLocalSubnet();
    console.log(`Scanning network: ${subnet}0/24`);

    for (let i = 5; i <= 10; i++) {
    const testIp = `${subnet}${i}`;
    if (await checkSamsungTV(testIp)) {
        foundTV = testIp;
        console.log(`✅ Samsung TV found at: ${foundTV}`);
        return foundTV;
    }
    }
    console.log("❌ Không tìm thấy TV Samsung!");
    return null;
}

// 3️⃣ Kiểm tra xem 1 địa chỉ IP có phải TV Samsung không (thử kết nối WebSocket)
function checkSamsungTV(ip) {
    return new Promise((resolve) => {
        axios.get(`http://${ip}:8001/api/v2/`, {
            timeout: 3000 // Timeout sau 3 giây
        })
        .then(response => {
            if (response.data && response.data.device) {
                console.log(`✅ Tìm thấy TV Samsung: ${response.data.device.name}`);
                resolve(true);
            } else {
                console.log(`❌ Không phải TV Samsung tại ${ip}`);
                resolve(false);
            }
        })
        .catch(error => {
            console.log(`⚠️ Lỗi kết nối đến ${ip}:`, error.message);
            resolve(false);
        });
    });
}

// Hàm khởi tạo kết nối WebSocket và duy trì nó
function initializeWebSocket() {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
        return;
    }

    globalWs = new WebSocket(`wss://${foundTV}:8002/api/v2/channels/samsung.remote.control`, {
        rejectUnauthorized: false,
    });

    globalWs.on("open", () => {
        console.log("🔗 Kết nối WebSocket đã được thiết lập");
        
        // Chỉ gửi yêu cầu ghép nối khi chưa có token
        if (!tvToken) {
            const pairingMessage = {
                method: "ms.channel.connect",
                params: {
                    "name": "RemoteControl",
                    "token": null, // Không gửi token trong lần đầu ghép nối
                    "appId": "12345"
                }
            };
            console.log("CONNECT", pairingMessage);
            
            globalWs.send(JSON.stringify(pairingMessage));
        }
    });

    globalWs.on("message", (data) => {
        const response = JSON.parse(data.toString());
        console.log("📨 Phản hồi từ TV:", response);
        if (response.data && response.data.token) {
            tvToken = response.data.token;
            console.log("✅ Đã nhận token từ TV");
        }
    });

    globalWs.on("close", () => {
        console.log("WebSocket đã đóng, sẽ thử kết nối lại...");
        setTimeout(initializeWebSocket, 1000); // Thử kết nối lại sau 1 giây
    });

    globalWs.on("error", (err) => {
        console.log("⚠️ Lỗi WebSocket:", err);
    });
}

// 4️⃣ Gửi lệnh điều khiển đến TV qua WebSocket
async function sendKeyCommand(command) {
    if (!foundTV) {
        console.log("Không tìm thấy TV. Vui lòng chạy tìm kiếm trước!");
        return;
    }

    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
        console.log("Đang thiết lập lại kết nối WebSocket...");
        initializeWebSocket();
        // Đợi một chút để kết nối được thiết lập
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const msg = {
        method: "ms.remote.control",
        params: {
            Cmd: "Click",
            DataOfCmd: command,
            Option: "false",
            TypeOfRemote: "SendRemoteKey",
            // token: `${tvToken}1`
        },
    };
    console.log("SEND COMMAND", msg);
    globalWs.send(JSON.stringify(msg));
    console.log(`📡 Gửi lệnh: ${command}`);
}

// 5️⃣ API tìm TV
app.get("/find-tv", async (req, res) => {
    const ip = await scanNetworkForSamsungTV();
    if (ip) {
        initializeWebSocket(); // Khởi tạo WebSocket connection
        res.json({ message: "Tìm thấy TV!", ip });
    } else {
        res.status(500).json({ message: "Không tìm thấy TV!" });
    }
});

// 6️⃣ API gửi lệnh điều khiển
app.post("/send-command", async (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ message: "Thiếu lệnh điều khiển!" });
    }

    await sendKeyCommand(command);
    res.json({ message: `Đã gửi lệnh: ${command}` });
});

// Chạy server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});