require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const forecastRouter = require("./routes/forecast");
const historyRouter = require("./routes/history");
const locationRouter = require("./routes/location");
const db = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] 错误:`, {
        method: req.method,
        url: req.originalUrl,
        error: err.message,
        stack: err.stack,
        body: req.body,
        files: req.files,
    });

    if (err instanceof multer.MulterError) {
        return res
            .status(400)
            .json({ error: "文件上传错误", details: err.message });
    }

    // 添加文件删除错误的处理
    if (err.code === "ENOENT") {
        return res
            .status(404)
            .json({ error: "文件不存在", details: err.message });
    }

    res.status(500).json({
        error: "服务器内部错误",
        details: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
});
// 路由
app.use("/api/forecast", forecastRouter);
app.use("/api/history", historyRouter);
app.use("/api/locationtree", locationRouter);

// 健康检查
app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err instanceof multer.MulterError) {
        return res
            .status(400)
            .json({ error: "文件上传错误", details: err.message });
    }

    res.status(500).json({ error: "服务器内部错误", details: err.message });
});

// 数据库连接测试
db.getConnection()
    .then((connection) => {
        console.log("成功连接到MySQL数据库");
        connection.release();

        // 启动服务器
        app.listen(PORT, () => {
            console.log(`服务器运行在 http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("数据库连接失败:", err);
        process.exit(1);
    });

module.exports = app;
