const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const ExcelService = require("../services/excel");
const ElecController = require("../controllers/elec");
const path = require("path");
const fs = require("fs");
const { addDays, isAfter, parseISO, formatISO } = require("date-fns");

/* 上传文件并返回信息 */
router.post("/", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        const isContinue = req.body.isContinue == "1";

        /* 1.文件存在？ */
        if (!file) {
            return res.status(400).json({
                success: false,
                error: "未上传文件",
                errorCode: "NO_FILE",
            });
        }

        /* 2.解析文件 */
        const rootDir = process.cwd();
        const filePath = path.join(rootDir, "uploads", file.filename);
        let loadData;

        try {
            loadData = ExcelService.parse(filePath);

            // 过滤末尾空行
            while (loadData.length > 0) {
                const lastRow = loadData[loadData.length - 1];
                if (
                    lastRow.length === 0 ||
                    lastRow.every(
                        (cell) =>
                            cell === null || cell === undefined || cell === ""
                    )
                ) {
                    loadData.pop();
                } else {
                    break;
                }
            }
        } catch (parseError) {
            return res.status(400).json({
                success: false,
                error: "文件解析失败",
                errorCode: "PARSE_ERROR",
                details: parseError.message,
            });
        }
        /* 3.检查文件格式是否正确 */
        // (3-1)基础验证（行数、列数）
        const base_result = ElecController.baseValidate(loadData);
        if (!base_result.valid) {
            return res.status(400).json({
                success: false,
                error: "Excel文件格式不正确",
                errorCode: "INVALID_FORMAT",
                details: base_result.message,
            });
        }
        // (3-2)表格体数据验证（每行行首、每行数据类型）
        const rows_result = ElecController.validateExcel(loadData, isContinue);
        if (!rows_result.valid) {
            return res.status(400).json({
                success: false,
                error: "Excel文件格式不正确",
                errorCode: "INVALID_FORMAT",
                details: rows_result.message,
            });
        }

        /* 3.提取信息 */
        const dateRange = ElecController.extractDateRange(loadData);
        const stats = ElecController.calculateExcelStats(loadData, isContinue);
        const name = Buffer.from(file.originalname, "binary").toString("utf8");
        const excelInfo = {
            name,
            size: Math.round(file.size / 1024), // 转换为KB
            uploadTime: new Date().toISOString(),
            stats,
            dateRange,
        };

        /* 4.删除临时文件 */
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error("删除临时文件失败:", err);
        }
        /* 5.返回请求信息 */
        res.json({
            success: true,
            excelInfo,
        });
    } catch (error) {
        console.error("获取文件信息失败:", error);
        res.status(500).json({
            success: false,
            error: "服务器内部错误",
            errorCode: "INTERNAL_ERROR",
            details: error.message,
        });
    }
});

module.exports = router;
