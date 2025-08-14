/* 简易预测控制器 - 仅需一天负荷数据版本 */
const ExcelService = require("../services/excel");
const AlgorithmService = require("../services/algorithm");
const Light = require("../models/Light");
const path = require("path");
const fs = require("fs");
const { parseISO } = require("date-fns");

class LightController {
    static async processForecast(req, res) {
        console.log("eq.body->", req.body);
        try {
            const formData = req.body;
            const file = req.file;

            // 处理文件名编码
            file.originalname = Buffer.from(
                file.originalname,
                "binary"
            ).toString("utf8");

            /* 一、检查文件是否存在 */
            if (!file) {
                return res.status(400).json({
                    success: false,
                    error: "未上传文件",
                    errorCode: "NO_FILE",
                });
            }

            /* 二、解析Excel文件 */
            const rootDir = process.cwd();
            const filePath = path.join(rootDir, "uploads", file.filename);
            let loadData;
            try {
                loadData = ExcelService.parse(filePath);
                console.log("Excel数据解析成功，行数:", loadData.length);

                // 过滤末尾空行
                while (loadData.length > 0) {
                    const lastRow = loadData[loadData.length - 1];
                    if (
                        lastRow.length === 0 ||
                        lastRow.every(
                            (cell) =>
                                cell === null ||
                                cell === undefined ||
                                cell === ""
                        )
                    ) {
                        loadData.pop();
                    } else {
                        break;
                    }
                }
                console.log("过滤空行后行数:", loadData.length);
            } catch (parseError) {
                return res.status(400).json({
                    success: false,
                    error: "文件解析失败",
                    errorCode: "PARSE_ERROR",
                    details: parseError.message,
                });
            }

            // 提取时间范围（仅需一天）
            let dateRange = LightController.extractDateRange(loadData);

            /* 三、文件格式验证 */
            // 1. 基础验证（行数、列数）
            const base_result = LightController.baseValidate(loadData);
            if (!base_result.valid) {
                return res.status(400).json({
                    success: false,
                    error: "Excel文件格式不正确",
                    errorCode: "INVALID_FORMAT",
                    details: base_result.message,
                });
            } else {
                console.log(base_result.message);
            }

            // 2. 首行验证（时间表头）
            const times_result = LightController.timesValidate(loadData);
            if (!times_result.valid) {
                console.log(times_result.message);
                loadData[0] = LightController.convertHeader(loadData[0]);
                console.log("转换后的表头:", loadData[0]);
            } else {
                console.log(times_result.message);
            }

            // 3. 表格体数据验证（只需一天数据）
            const rows_result = LightController.validateExcel(loadData);
            if (!rows_result.valid) {
                return res.status(400).json({
                    success: false,
                    error: "Excel文件格式不正确",
                    errorCode: "INVALID_FORMAT",
                    details: rows_result.message,
                });
            } else {
                console.log(rows_result.message);
            }

            /* 四、调用算法服务进行预测 */
            let resultData;
            try {
                // 提取一天的24小时负荷数据（去掉日期列）
                const dayLoadData = loadData[1].slice(1); // 取第一行数据，跳过日期列

                console.log("fd->", formData);
                resultData = await AlgorithmService.lightPredict(
                    formData,
                    dayLoadData // 只传递24小时的负荷数据
                );
            } catch (algorithmError) {
                return res.status(500).json({
                    success: false,
                    error: "预测处理失败",
                    errorCode: "ALGORITHM_ERROR",
                    details: algorithmError.message,
                });
            }

            // 创建记录
            const record = {
                user_id: formData.user_id ? formData.user_id : null,
                uploadFilePath: file.path,
                uploadDateRange: dateRange,
                storage_cost: formData.storage_cost,
                pv_cost: formData.pv_cost,
            };

            console.log("resultData* ->", resultData);
            // 保存到数据库
            const recordId = await Light.create({
                ...record,
                ...resultData,
            });
            console.log("光储定容记录ID:", recordId);
            // 构建Excel文件信息对象 +++
            const excelInfo = {
                name: file.originalname,
                size: Math.round(file.size / 1024), // 转换为KB
                uploadTime: new Date().toISOString().split("T")[0],
                url: `/api/light_history/${recordId}/download`, // 下载路径
                stats: LightController.calculateExcelStats(loadData), // 统计信息
                dateRange: dateRange, // 日期范围
            };
            // 返回响应
            res.json({
                success: true,
                recordId,
                resultData,
                formData,
                excelInfo,
            });
        } catch (error) {
            console.error("简易预测处理失败:", error);
            res.status(500).json({
                success: false,
                error: "服务器内部错误",
                errorCode: "INTERNAL_ERROR",
                details: error.message,
            });
        }
    }

    /* 基本验证（行数、列数） */
    static baseValidate(data) {
        // 1. 行数 - 只需一天数据（表头+1行数据）
        if (!data || !Array.isArray(data) || data.length < 2) {
            return {
                valid: false,
                message:
                    "文件内容为空或行数不足，需要至少一天数据（表头+1行数据）",
            };
        }

        // 2. 行数 - 不能超过一天数据
        if (data.length > 2) {
            return {
                valid: false,
                message: "只能提供一天的数据，请删除多余行",
            };
        }

        // 3. 列数
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

    /* 首行时间格式验证 */
    static timesValidate(data) {
        const header = data[0];
        for (let i = 1; i < 25; i++) {
            const hour = header[i].toString().trim();
            const hourNum = parseInt(hour);
            if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
                const timeMatch = hour.match(/^(\d{1,2}):00$/);
                const hourSuffixMatch = hour.match(/^(\d{1,2})时$/);
                if (!timeMatch && !hourSuffixMatch) {
                    return {
                        valid: false,
                        message: "首行时间格式验证未通过，将进行转换",
                    };
                }
            }
        }
        return {
            valid: true,
            message: "首行时间格式验证通过",
        };
    }

    static convertHeader(header) {
        return header.map((item, index) => {
            if (index === 0) return "日期";
            const hour = (index - 1).toString().padStart(2, "0");
            return `${hour}:00`;
        });
    }

    /* 表格体数据验证（只需一天数据） */
    static validateExcel(data) {
        // 只需要一天数据（表头+1行数据）
        if (data.length !== 2) {
            return {
                valid: false,
                message: "只能提供一天的数据，请确保只有表头加一行数据",
            };
        }

        // 数据行验证（只需验证第一行数据）
        const row = data[1];
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

        // 检查列数
        if (row.length !== 25) {
            return {
                valid: false,
                message: `数据行列数不正确，应为25列（日期+24小时）`,
            };
        }

        // 检查日期格式
        if (!dateRegex.test(row[0])) {
            return {
                valid: false,
                message: `日期格式错误: ${row[0]}`,
            };
        }

        // 检查负荷值
        for (let j = 1; j < 25; j++) {
            const value = row[j];
            if (typeof value !== "number" || isNaN(value) || value < 0) {
                return {
                    valid: false,
                    message: `第${j}小时负荷值无效: ${value}`,
                };
            }
        }

        return {
            valid: true,
            message: "表格体数据验证通过",
        };
    }

    // 计算Excel统计信息（简化版）
    static calculateExcelStats(loadData) {
        if (!loadData || loadData.length < 2) {
            return {
                days: 0,
                timeGranularity: 0,
                dataPoints: 0,
                status: "无效数据",
            };
        }

        const days = 1; // 固定一天
        const pointsPerDay = 24; // 固定24小时
        const dataPoints = days * pointsPerDay;

        // 验证状态
        let status = "已验证";
        if (loadData.length !== 2) {
            status = "警告：数据行数异常";
        } else if (loadData[0].length < 25) {
            status = "警告：时间点不足24小时";
        }

        return {
            days,
            timeGranularity: pointsPerDay,
            dataPoints,
            status,
        };
    }

    // 提取日期范围（简化版，只需一天）
    static extractDateRange(data) {
        if (data.length < 2) return [];
        const date = data[1][0];
        return [date, date]; // 开始日期和结束日期相同
    }
}

module.exports = LightController;
