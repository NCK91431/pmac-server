/* 预测逻辑控制器 */
const ExcelService = require("../services/excel");
const AlgorithmService = require("../services/algorithm");
const Record = require("../models/Record");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");

class ForecastController {
    static async processForecast(req, res) {
        if (req.body.location && typeof req.body.location == "string") {
            const location_str = req.body.location;
            req.body.location = JSON.parse(location_str); //"广东省,珠海市,香洲区" -> ['广东省','珠海市','香洲区']
        }
        try {
            const formData = req.body;
            const file = req.file;
            /* 一、文件存在？ */
            if (!file)
                res.status(400).json({
                    success: false,
                    error: "未上传文件",
                    errorCode: "NO_FILE",
                });

            /* 二、解析Excel文件 */
            const rootDir = process.cwd();
            const filePath = path.join(rootDir, "uploads", file.filename);
            let loadData;
            try {
                loadData = ExcelService.parse(filePath);
                console.log("Excel数据解析成功，行数:", loadData.length);
            } catch (parseError) {
                return res.status(400).json({
                    success: false,
                    error: "文件解析失败",
                    errorCode: "PARSE_ERROR",
                    details: parseError.message,
                });
            }

            /* 三、文件格式正确？ */
            // 1.基础验证（行数、列数）
            const base_result = ForecastController.baseValidate(loadData);
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
            // 2.首行验证（时间表头）
            const times_result = ForecastController.timesValidate(loadData);
            if (!times_result.valid) {
                console.log(times_result.message);
                loadData[0] = ForecastController.convertHeader(loadData[0]); // 转换首行
                console.log("转换后的表头:", loadData[0]);
            } else {
                console.log(times_result.message);
            }
            // 3.表格体数据验证（每行行首、每行数据类型）
            const rows_result = ForecastController.validateExcel(loadData);
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
            let predictionData;
            try {
                predictionData = await AlgorithmService.predict(
                    formData,
                    loadData
                );
            } catch (algorithmError) {
                return res.status(500).json({
                    success: false,
                    error: "预测处理失败",
                    errorCode: "ALGORITHM_ERROR",
                    details: algorithmError.message,
                });
            }

            /* 五、生成结果Excel文件 */
            let result;
            try {
                result = ExcelService.generate(predictionData);
            } catch (generateError) {
                return res.status(500).json({
                    success: false,
                    error: "结果生成失败",
                    errorCode: "RESULT_GENERATION_ERROR",
                    details: generateError.message,
                });
            }

            // 处理用户ID - 新逻辑
            if (formData.user_id) {
                const user = await User.findById(formData.user_id); // 验证用户ID是否存在
                if (!user) {
                    console.warn(`用户ID ${formData.user_id} 在数据库中不存在`);
                }
            }
            // 提取时间范围
            const dateRange = ForecastController.extractDateRange(loadData);
            // 保存到数据库
            const record = {
                user_id: formData.user_id ? formData.user_id : null,
                customer_type: formData.customer_type,
                pv_config: formData.pv_config,
                province: formData.location[0] || "",
                city: formData.location[1] || "",
                district: formData.location[2] || "",
                forecast_range: formData.forecast_range,
                uploadFilePath: file.path,
                resultFilePath: result.filePath,
                predictionData,
                uploadDateRange: dateRange, // 时间范围
                uploadData: loadData, // 解析后的数据
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
                dateRange, // 返回给前端
            };
            // 返回响应
            res.json({
                success: true,
                recordId,
                predictionData,
                resultFileName: result.fileName,
                excelInfo, // 新增Excel文件信息
                formData, // 原表单信息
            });
        } catch (error) {
            console.error("预测处理失败:", error);
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
    /* 首行时间格式验证
       支持的格式:
        1. 纯数字: 0, 1, 2, ... 23
        2. 时间格式: 0:00, 1:00, ... 23:00
        3. 带后缀格式: 0时, 1时, ... 23时
	*/
    static timesValidate(data) {
        const header = data[0];
        // 检查时间列
        for (let i = 1; i < 25; i++) {
            const hour = header[i].toString().trim();
            // 尝试解析为数字
            const hourNum = parseInt(hour);
            // 检查是否是有效的24小时制小时
            if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
                // 如果不是数字，检查时间格式
                const timeMatch = hour.match(/^(\d{1,2}):00$/);
                const hourSuffixMatch = hour.match(/^(\d{1,2})时$/);
                if (!timeMatch && !hourSuffixMatch) {
                    // 如果都不是，那就仅仅只提示
                    return {
                        valid: false,
                        message: "首行时间格式验证未通过，将进行转换",
                    }; //转换
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
            if (index === 0) return "日期"; // 保留首元素
            const hour = (index - 1).toString().padStart(2, "0"); // 计算小时并补零
            return `${hour}:00`; // 格式化为 HH:00
        });
    }
    /* 表格体数据验证（每行行首、每行数据类型） */
    static validateExcel(data) {
        if (data.length < 31) {
            return {
                valid: false,
                message: `数据不足导致无法预测，请提供至少30天的数据`,
            };
        }
        // 4. 数据行验证
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
        }
        return {
            valid: true,
            message: "表格体数据验证通过",
        };
    }

    // 新增方法：计算Excel统计信息
    static calculateExcelStats(loadData) {
        // 确保数据有效
        if (!loadData || loadData.length === 0) {
            return {
                days: 0,
                timeGranularity: 0,
                dataPoints: 0,
                status: "无效数据",
            };
        }
        // 数据行数（减去表头）
        const days = loadData.length - 1;
        // 每行数据点（减去日期列）
        const pointsPerDay = loadData[0].length - 1;
        // 添加额外验证逻辑（可选）
        let status = "已验证";
        if (days < 365) {
            status = `已验证（警告：数据天数少于一年，将影响节假日预测效果）`;
            if (days < 90) {
                status = `已验证（警告：数据天数少于90天，影响预测效果）`;
            }
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
    // 计算用户上传的excel的时间范围
    static extractDateRange(data) {
        if (data.length < 2) return [];

        // 第一行数据是表头，所以实际数据从第二行开始
        const firstDate = data[1][0]; // 第一行第一列是日期
        const lastDate = data[data.length - 1][0]; // 最后一行第一列是日期

        return [firstDate, lastDate];
    }
}

module.exports = ForecastController;
