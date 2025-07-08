/* 文件上传中间件 */
const multer = require("multer");
const path = require("path");
const fs = require("fs");
// 使用项目根目录创建上传目录
const rootDir = process.cwd();
const uploadDir = path.join(rootDir, "uploads");
// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // 使用绝对路径
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        // 保留原始文件名前缀
        const originalName = path.basename(file.originalname, ext);
        cb(null, `${originalName}-${uniqueSuffix}${ext}`);
    },
});

// 文件过滤器，限制只允许上传Excel文件
const fileFilter = (req, file, cb) => {
    if (
        file.mimetype === "application/vnd.ms-excel" ||
        file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
        cb(null, true);
    } else {
        cb(new Error("只支持Excel文件上传"), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
});

module.exports = upload;
