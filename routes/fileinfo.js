const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const ExcelService = require("../services/excel");
const path = require("path");
const fs = require("fs");
const { addDays, isAfter, parseISO, formatISO } = require("date-fns");

// 提取时间范围
function extractDateRange(data) {
    if (data.length < 2) return [];
    const firstDate = data[1][0];
    const lastDate = data[data.length - 1][0];
    return [firstDate, lastDate];
}
// 计算Excel统计信息
function calculateExcelStats(loadData) {
    if (!loadData || loadData.length === 0) {
        return {
            days: 0,
            timeGranularity: 0,
            dataPoints: 0,
            status: "无效数据",
        };
    }

    const days = loadData.length - 1;
    const pointsPerDay = loadData[0].length - 1;

    let status = "已验证";
    if (days < 365) {
        status = "已验证（警告：数据天数少于一年，将影响节假日预测效果）";
        if (days < 90) {
            status = "已验证（警告：数据天数少于90天，影响预测效果）";
        }
    } else if (pointsPerDay !== 24) {
        status = "已验证（警告：时间粒度不是24小时）";
    }

    return {
        days,
        timeGranularity: 24,
        dataPoints: days * pointsPerDay,
        status,
    };
}
// 验证日期连续性和顺序
function validateDateContinuity(dates) {
    // 检查日期是否按时间顺序排列且连续
    for (let i = 1; i < dates.length; i++) {
        const prevDate = dates[i - 1];
        const currentDate = dates[i];

        // 检查日期是否乱序
        if (isAfter(prevDate, currentDate)) {
            return {
                valid: false,
                message: `日期顺序错误：${formatISO(prevDate, { representation: "date" })} 不应在 ${formatISO(currentDate, { representation: "date" })} 之后`,
            };
        }

        // 检查日期是否连续（当前日期应为前一天的后一天）
        const expectedNextDate = addDays(prevDate, 1);
        if (
            formatISO(currentDate, { representation: "date" }) !==
            formatISO(expectedNextDate, { representation: "date" })
        ) {
            return {
                valid: false,
                message: `日期不连续：${formatISO(prevDate, { representation: "date" })} 和 ${formatISO(currentDate, { representation: "date" })} 之间存在间隔`,
            };
        }
    }
    return {
        valid: true,
        message: "日期连续性验证通过",
    };
}
/* 表格体数据验证（每行行首、每行数据类型） */
function validateExcel(data, isContinuePredict = false) {
    const minDays = isContinuePredict ? 1 : 30; // 根据是否为继续预测，设置不同的最小天数要求
    const minRows = minDays + 1; // 加上表头行（第1行）
    if (data.length < minRows) {
        return {
            valid: false,
            message: `数据不足导致无法预测，请提供至少${minDays}天的数据`,
        };
    }
    // 4. 数据行验证
    const dates = []; // 收集所有日期并验证格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // 检查某行是否有24个数据
        if (row.length !== 25) {
            return {
                valid: false,
                message: `第${i + 1}行列数不正确，应为25列`,
            };
        }
        // 检查某行行首日期格式
        if (!dateRegex.test(row[0])) {
            return {
                valid: false,
                message: `第${i + 1}行行首日期格式错误: ${row[0]}`,
            };
        }
        // 检查负荷值
        for (let j = 1; j < 25; j++) {
            const value = row[j];
            if (typeof value !== "number" || isNaN(value) || value < 0) {
                return {
                    valid: false,
                    message: `第${i + 1}行第${j + 1}列负荷值无效: ${value}`,
                };
            }
        }
        dates.push(parseISO(row[0])); // 收集日期（已通过格式验证）
    }

    // 5.验证日期连续性
    const dateContinuityResult = validateDateContinuity(dates);
    if (!dateContinuityResult.valid) {
        return {
            valid: false,
            message: dateContinuityResult.message,
        };
    }

    return {
        valid: true,
        message: "表格体数据验证通过",
    };
}

// 基本验证（行数、列数
function baseValidate(data) {
    // 1. 行数
    if (!data || !Array.isArray(data) || data.length < 2) {
        return {
            valid: false,
            message: "文件内容为空或行数不足",
        };
    }
    // 2. 列数
    const header = data[0];
    if (!header || header.length < 25) {
        console.error("表头列数不足，应为25列（日期+24小时）");
        return {
            valid: false,
            message: "列数不正确（应为25列：日期+24小时）",
        };
    }
    return {
        valid: true,
        message: "基本验证通过",
    };
}
/* 上传文件并返回信息 */
router.post("/", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        const isContinue = req.body.isContinue == "1";
        file.originalname = Buffer.from(file.originalname, "binary").toString(
            "utf8"
        );
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
        const base_result = baseValidate(loadData);
        if (!base_result.valid) {
            return res.status(400).json({
                success: false,
                error: "Excel文件格式不正确",
                errorCode: "INVALID_FORMAT",
                details: base_result.message,
            });
        }
        // (3-2)表格体数据验证（每行行首、每行数据类型）
        const rows_result = validateExcel(loadData, isContinue);
        if (!rows_result.valid) {
            return res.status(400).json({
                success: false,
                error: "Excel文件格式不正确",
                errorCode: "INVALID_FORMAT",
                details: rows_result.message,
            });
        }

        /* 3.提取信息 */
        const dateRange = extractDateRange(loadData);
        const stats = calculateExcelStats(loadData);
        const excelInfo = {
            name: file.originalname,
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
