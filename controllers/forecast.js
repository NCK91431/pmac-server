/* 预测逻辑控制器 */
const ExcelService = require("../services/excel");
const AlgorithmService = require("../services/algorithm");
const Record = require("../models/Record");
const path = require("path");
const fs = require("fs");

class ForecastController {
    static async processForecast(req, res) {
        try {
            const formData = req.body;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ error: "未上传文件" });
            }

            // 解析Excel文件
            const rootDir = process.cwd();
            const filePath = path.join(rootDir, "uploads", file.filename);
            const loadData = ExcelService.parse(filePath);

            console.log("Excel数据解析成功，行数:", loadData.length);

            // 验证Excel格式 - 使用类名直接调用静态方法
            if (!ForecastController.validateExcel(loadData)) {
                return res.status(400).json({ error: "Excel文件格式不正确" });
            }

            // 解析location字段（前端发送的是JSON字符串）
            let location = [];
            try {
                location = JSON.parse(formData.location);
            } catch (e) {
                console.error("解析location字段失败:", e);
                return res.status(400).json({ error: "地点数据格式不正确" });
            }

            // 调用算法服务进行预测
            const predictionData = await AlgorithmService.predict(
                formData,
                loadData
            );

            // 生成结果Excel文件
            const result = ExcelService.generate(predictionData);

            // 保存到数据库
            const record = {
                customerType: formData.customerType,
                pvConfig: formData.pvConfig,
                province: location[0] || "",
                city: location[1] || "",
                district: location[2] || "",
                forecastRange: formData.forecastRange,
                uploadFilePath: file.path,
                resultFilePath: result.filePath,
                predictionData,
            };

            const recordId = await Record.create(record);

            console.log("预测记录保存成功，ID:", recordId);

            // 准备Excel文件信息
            const excelInfo = {
                name: file.originalname,
                size: Math.round(file.size / 1024), // 转换为KB
                uploadTime: new Date().toISOString().split("T")[0],
                url: `/api/history/${recordId}/download/upload`,
                stats: ForecastController.calculateExcelStats(loadData),
            };

            // 准备表单信息
            const formInfo = {
                customer_type: formData.customerType,
                pv_config: formData.pvConfig,
                area: {
                    province: formData.location[0],
                    city: formData.location[1],
                    district: formData.location[2],
                },
                forecast_range: formData.forecastRange,
            };

            // 返回响应
            res.json({
                success: true,
                recordId,
                predictionData,
                resultFileName: result.fileName,
                excelInfo, // 新增Excel文件信息
                formInfo, // 新增表单信息
            });
        } catch (error) {
            console.error("预测处理失败:", error);
            res.status(500).json({
                error: "预测处理失败",
                details: error.message,
                stack:
                    process.env.NODE_ENV === "development"
                        ? error.stack
                        : undefined,
            });
        }
    }

    // 验证Excel格式
    static validateExcel(data) {
        // 1. 基本验证
        if (!data || !Array.isArray(data) || data.length < 2) {
            console.error("Excel数据行数不足或格式错误");
            return false;
        }

        // 2. 表头验证
        const header = data[0];
        if (!header || header.length < 25) {
            console.error("表头列数不足，应为25列（日期+24小时）");
            return false;
        }

        // 检查时间列
        for (let i = 1; i < 25; i++) {
            const hour = header[i].toString().trim();

            // 支持的格式:
            // 1. 纯数字: 0, 1, 2, ... 23
            // 2. 时间格式: 0:00, 1:00, ... 23:00
            // 3. 带后缀格式: 0时, 1时, ... 23时
            // 尝试解析为数字
            const hourNum = parseInt(hour);
            // 检查是否是有效的24小时制小时
            if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
                // 如果不是数字，检查时间格式
                const timeMatch = hour.match(/^(\d{1,2}):00$/);
                const hourSuffixMatch = hour.match(/^(\d{1,2})时$/);

                if (!timeMatch && !hourSuffixMatch) {
                    console.error(
                        `时间列格式错误: ${hour}，应为 0-23 的数字或 '0:00' 格式`
                    );
                    return false;
                }
            }
        }

        // 4. 数据行验证
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        for (let i = 1; i < data.length; i++) {
            const row = data[i];

            // 检查行长度
            if (row.length !== 25) {
                console.error(`第${i + 1}行列数不正确，应为25列`);
                return false;
            }

            // 检查日期格式
            if (!dateRegex.test(row[0])) {
                console.error(`第${i + 1}行日期格式错误: ${row[0]}`);
                return false;
            }

            // 检查负荷值
            for (let j = 1; j < 25; j++) {
                const value = row[j];
                if (typeof value !== "number" || isNaN(value) || value < 0) {
                    console.error(
                        `第${i + 1}行第${j + 1}列负荷值无效: ${value}`
                    );
                    return false;
                }
            }
        }

        console.log("Excel格式验证通过");
        return true;
    }

    // 新增方法：计算Excel统计信息
    static calculateExcelStats(data) {
        // 确保数据有效
        if (!data || data.length === 0) {
            return {
                days: 0,
                timeGranularity: 0,
                dataPoints: 0,
                status: "无效数据",
            };
        }
        // 数据行数（减去表头）
        const days = data.length - 1;
        // 每行数据点（减去日期列）
        const pointsPerDay = data[0].length - 1;
        // 添加额外验证逻辑（可选）
        let status = "已验证";
        if (days < 90) {
            status = `已验证（警告：数据天数不足90天）`;
        } else if (pointsPerDay !== 24) {
            status = `已验证（警告：时间粒度不是24小时）`;
        }
        return {
            days,
            timeGranularity: 24,
            dataPoints: days * pointsPerDay,
            status,
        };
    }
}

module.exports = ForecastController;
