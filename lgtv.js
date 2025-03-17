const express = require("express");
const axios = require("axios");
const WebSocket = require("ws");

const app = express();
const PORT = 3001;

app.use(express.json());

let globalWs = null;
let globalClientKey = null;
let connectedIP = null;

// Hàm khởi tạo kết nối WebSocket
function initializeWebSocket(ip) {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
        return; // Nếu đã có kết nối và đang mở thì không cần tạo mới
    }

    globalWs = new WebSocket(`ws://${ip}:3000`);
    connectedIP = ip;

    globalWs.on("open", () => {
        console.log(`🔗 Kết nối đến TV ${ip} thành công!`);
    });

    globalWs.on("message", (data) => {
        const message = JSON.parse(data);
        console.log("📩 Phản hồi từ TV:", message);

        if (message.type === "registered" && message.payload?.["client-key"]) {
            globalClientKey = message.payload["client-key"];
            console.log("✅ Đã nhận client-key:", globalClientKey);
        }
    });

    globalWs.on("error", (err) => {
        console.error("⚠️ Lỗi kết nối TV:", err.message);
    });

    globalWs.on("close", () => {
        console.log(`🔌 Kết nối đã đóng`);
        globalWs = null;
        // Có thể thêm logic tự động kết nối lại ở đây nếu cần
    });
}

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
        res.json({ tvs: [ip] });
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

    initializeWebSocket(ip);

    // Đợi kết nối được thiết lập
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!globalWs || globalWs.readyState !== WebSocket.OPEN) {
        return res.status(500).json({ error: "Không thể kết nối đến TV" });
    }

    const pairingRequest = {
        type: "register",
        id: "register_0",
        payload: {
            forcePairing: false,
            manifest: {
                appVersion: "1.0",
                permissions: [
                    "CONTROL_CHANNEL", // 🔥 Thêm quyền đổi kênh
                    "CONTROL_INPUT_TEXT",
                    "CONTROL_AUDIO",         // Điều khiển âm thanh (tăng/giảm âm lượng, tắt tiếng)
                    "CONTROL_POWER",         // Tắt TV
                    "CONTROL_INPUT_TV",      // Chuyển đổi nguồn đầu vào
                    "CONTROL_INPUT_MEDIA_PLAYBACK", // Điều khiển phát video (Play/Pause/Stop)
                    "READ_INSTALLED_APPS",   // Đọc danh sách ứng dụng đã cài
                    "LAUNCH",                // Khởi chạy ứng dụng
                    "LAUNCH_WEBAPP",         // Khởi chạy ứng dụng web
                    "APP_TO_APP",            // Chuyển đổi giữa các ứng dụng
                    "CONTROL_CAMERA",        // Điều khiển camera
                    "CONTROL_RECORDING",     // Điều khiển ghi hình
                    "CONTROL_TV_SCREEN",     // Điều khiển màn hình TV (Bật/tắt hiển thị)
                    "CONTROL_REMOTE",        // Điều khiển từ xa (giả lập bấm nút trên remote)
                    "READ_CHANNEL_INFO",     // Đọc thông tin kênh TV
                    "READ_CURRENT_CHANNEL",  // Đọc kênh hiện tại
                    "WRITE_NOTIFICATION_TOAST", // Hiển thị thông báo trên TV
                    "READ_INPUT_DEVICE_LIST", // Đọc danh sách thiết bị đầu vào
                    "READ_NETWORK_STATE",    // Đọc trạng thái mạng
                    "READ_TV_INFO",          // Đọc thông tin TV
                    "READ_POWER_STATE",      // Đọc trạng thái bật/tắt của TV
                    "READ_SOUND_OUTPUT",     // Đọc đầu ra âm thanh
                    "READ_SYSTEM_INFO",      // Đọc thông tin hệ thống
                    "WRITE_SCREEN",          // Điều khiển hiển thị màn hình
                    "CONTROL_MOUSE_AND_KEYBOARD", // Điều khiển chuột và bàn phím
                    "CONTROL_PLAYBACK"
                ],
                appId: "com.yourcompany.remote"
            }
        }
    };

    let responseSent = false;

    const messageHandler = (data) => {
        const message = JSON.parse(data);
        if (message.type === "response" && message.payload?.["client-key"] && !responseSent) {
            responseSent = true;
            res.json({
                message: "✅ Ghép nối thành công",
                clientKey: message.payload["client-key"]
            });
            globalWs.removeListener("message", messageHandler);
        }
    };

    globalWs.on("message", messageHandler);
    globalWs.send(JSON.stringify(pairingRequest));

    // Timeout
    setTimeout(() => {
        if (!responseSent) {
            res.status(500).json({ error: "TV không phản hồi" });
            globalWs.removeListener("message", messageHandler);
        }
    }, 20000);
});

// API 3: Điều khiển TV
app.post("/control-tv", async (req, res) => {
    const { ip, command, payload = {} } = req.body;
    if (!ip || !command) return res.status(400).json({ error: "Thiếu IP hoặc command" });

    // Kiểm tra xem có đang kết nối đến đúng TV không
    if (ip !== connectedIP || !globalWs || globalWs.readyState !== WebSocket.OPEN) {
        initializeWebSocket(ip);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!globalClientKey) {
        return res.status(400).json({ error: "TV chưa được ghép nối" });
    }

    // const commands = {
    //     powerOff: 'ssap://system/turnOff', // Tắt TV
    //     volumeUp: 'ssap://audio/volumeUp', // Tăng âm lượng
    //     volumeDown: 'ssap://audio/volumeDown', // Giảm âm lượng
    //     mute: 'ssap://audio/setMute', // Tắt tiếng
    //     channelUp: 'ssap://tv/channelUp', // Chuyển kênh lên
    //     channelDown: 'ssap://tv/channelDown', // Chuyển kênh xuống
    //     home: 'ssap://com.webos.service.ime/sendEnterKey', // Về màn hình chính
    //     back: 'ssap://com.webos.service.ime/sendBackKey', // Quay lại
    //     enter: 'ssap://com.webos.service.ime/sendEnterKey', // Chọn
    //     arrowUp: 'ssap://com.webos.service.ime/sendKeyInput', // Phím mũi tên lên
    //     arrowDown: 'ssap://com.webos.service.ime/sendKeyInput', // Phím mũi tên xuống
    //     arrowLeft: 'ssap://com.webos.service.ime/sendKeyInput', // Phím mũi tên trái
    //     arrowRight: 'ssap://com.webos.service.ime/sendKeyInput', // Phím mũi tên phải
    //     play: 'ssap://media.controls/play', // Phát
    //     pause: 'ssap://media.controls/pause', // Tạm dừng
    //     stop: 'ssap://media.controls/stop', // Dừng phát
    //     next: 'ssap://media.controls/next', // Chuyển bài tiếp theo
    //     previous: 'ssap://media.controls/previous', // Quay lại bài trước
    //     openYouTube: 'ssap://system.launcher/launch', // Mở YouTube
    //     openNetflix: 'ssap://system.launcher/launch', // Mở Netflix
    //     openBrowser: 'ssap://system.launcher/open', // Mở trình duyệt web
    // };

    // if (!commands[command]) {
    //     return res.status(400).json({ error: "Lệnh không hợp lệ" });
    // }

    const commands = [
        "ssap://api/getServiceList",
        "ssap://audio/getMute",
        "ssap://audio/getStatus",
        "ssap://audio/getVolume",
        "ssap://audio/setMute",
        "ssap://audio/setVolume",
        "ssap://audio/volumeDown",
        "ssap://audio/volumeUp",
        "ssap://com.webos.applicationManager/getForegroundAppInfo",
        "ssap://com.webos.applicationManager/listApps",
        "ssap://com.webos.applicationManager/listLaunchPoints",
        "ssap://com.webos.service.appstatus/getAppStatus",
        "ssap://com.webos.service.ime/deleteCharacters",
        "ssap://com.webos.service.ime/insertText",
        "ssap://com.webos.service.ime/registerRemoteKeyboard",
        "ssap://com.webos.service.ime/sendEnterKey",
        "ssap://com.webos.service.networkinput/getPointerInputSocket",
        "ssap://com.webos.service.secondscreen.gateway/test/secure",
        "ssap://com.webos.service.tv.display/get3DStatus",
        "ssap://com.webos.service.tv.display/set3DOff",
        "ssap://com.webos.service.tv.display/set3DOn",
        "ssap://media.controls/fastForward",
        "ssap://media.controls/pause",
        "ssap://media.controls/play",
        "ssap://media.controls/rewind",
        "ssap://media.controls/stop",
        "ssap://media.viewer/close",
        "ssap://media.viewer/open",
        "ssap://pairing/setPin",
        "ssap://system.launcher/close",
        "ssap://system.launcher/getAppState",
        "ssap://system.launcher/launch",
        "ssap://system.launcher/open",
        "ssap://system/getSystemInfo",
        "ssap://system/turnOff",
        "ssap://tv/channelDown",
        "ssap://tv/channelUp",
        "ssap://tv/getACRAuthToken",
        "ssap://tv/getChannelCurrentProgramInfo",
        "ssap://tv/getChannelList",
        "ssap://tv/getChannelProgramInfo",
        "ssap://tv/getCurrentChannel",
        "ssap://tv/getExternalInputList",
        "ssap://tv/openChannel",
        "ssap://tv/switchInput",
        "ssap://webapp/closeWebApp",
        "ssap://webapp/connectToApp",
        "ssap://webapp/isWebAppPinned",
        "ssap://webapp/launchWebApp",
        "ssap://webapp/pinWebApp",
        "ssap://webapp/removePinnedWebApp",
    ]

    const controlRequest = {
        type: "request",
        uri: command,
        payload: payload,
        clientKey: globalClientKey
    };

    globalWs.send(JSON.stringify(controlRequest));
    res.json({ message: "Lệnh đã gửi", command });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
});
