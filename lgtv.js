const express = require("express");
const axios = require("axios");
const WebSocket = require("ws");

const app = express();
const PORT = 3001;

app.use(express.json());

let connectedTVs = {}; // Lưu trạng thái kết nối TV
const foundTVs = [];
// API 1: Quét TV LG WebOS trong mạng
app.get("/scan-tvs", async (req, res) => {
    console.log("SCAN TV");
    const baseIP = "192.168.1."; // Thay đổi theo mạng của bạn


    // for (let i = 10; i <= 12; i++) {
    const ip = `${baseIP}${12}`;
    try {
        console.log("SCAN TV", ip);
        await axios.get(`http://${ip}:3000`, { timeout: 1000 });
        console.log(`Tìm thấy TV tại: ${ip}`);
        foundTVs.push(ip);
        res.json({ tvs: foundTVs });
    } catch (error) {
        // console.log("SCAN TV", error);
        // Không phản hồi, bỏ qua
    }
    // }


});

// API 2: Ghép nối TV bằng WebSocket
app.post("/pair-tv", async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: "Thiếu IP TV" });

    const ws = new WebSocket(`ws://${ip}:3000`);
    let responseSent = false; // Cờ kiểm soát phản hồi chỉ gửi 1 lần

    ws.on("open", () => {
        console.log(`🔗 Kết nối đến TV ${ip} thành công!`);

        // Gửi yêu cầu ghép nối
        const pairingRequest = JSON.stringify({
            type: "register",
            id: "register_0",
            payload: {
                forcePairing: false,
                manifest: {
                    appVersion: "1.0",
                    permissions: ["CONTROL_POWER", "CONTROL_INPUT_TV"],
                    appId: "com.yourcompany.remote"
                }
            }
        });

        ws.send(pairingRequest);
        console.log(`📡 Đã gửi yêu cầu ghép nối đến TV...`);
    });

    ws.on("message", (data) => {
        const message = JSON.parse(data);
        console.log("📩 Phản hồi từ TV:", message);

        if (message.type === "response" && message.payload?.["client-key"]) {
            connectedTVs[ip] = message.payload["client-key"];

            if (!responseSent) {
                res.json({ message: "✅ Ghép nối thành công", clientKey: message.payload["client-key"] });
                responseSent = true; // Đánh dấu đã gửi phản hồi
            }

            ws.close();
        }
    });

    ws.on("error", (err) => {
        console.error("⚠️ Lỗi kết nối TV:", err.message);

        if (!responseSent) {
            res.status(500).json({ error: "❌ Không thể kết nối TV" });
            responseSent = true;
        }
    });

    ws.on("close", () => {
        console.log(`🔌 Kết nối với TV ${ip} đã đóng.`);
    });

    // Timeout nếu không có phản hồi từ TV sau 10 giây
    setTimeout(() => {
        if (!responseSent) {
            res.status(500).json({ error: "❌ TV không phản hồi" });
            responseSent = true;
            ws.close();
        }
    }, 20000);
});

// API 3: Điều khiển TV
app.post("/control-tv", async (req, res) => {
    const { ip, command, clientKey: requestClientKey } = req.body;
    if (!ip || !command) return res.status(400).json({ error: "Thiếu IP hoặc command" });
    console.log("CONTROL TV", ip, connectedTVs);
    const clientKey = requestClientKey || connectedTVs[ip];
    console.log("CLIENT KEY", clientKey);
    if (!clientKey) return res.status(400).json({ error: "TV chưa được ghép nối" });

    const commands = {
        volumeUp: 'ssap://audio/volumeUp',
        volumeDown: 'ssap://audio/volumeDown',
        powerOff: 'ssap://system/turnOff',
        mute: 'ssap://audio/setMute',
        channelUp: 'ssap://tv/channelUp',
        channelDown: 'ssap://tv/channelDown'
    };

    if (!commands[command]) {
        return res.status(400).json({ error: "Lệnh không hợp lệ" });
    }

    const ws = new WebSocket(`ws://${ip}:3000`);

    ws.on("open", () => {
        ws.send(JSON.stringify({
            type: "request",
            uri: commands[command],
            payload: {},
            clientKey: clientKey
        }));
        res.json({ message: "Lệnh đã gửi", command });
        ws.close();
    });

    ws.on("error", (err) => {
        res.status(500).json({ error: "Không thể gửi lệnh" });
    });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
});
