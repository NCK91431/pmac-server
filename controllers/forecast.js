/* 预测逻辑控制器 */
const ExcelService = require("../services/excel");
const AlgorithmService = require("../services/algorithm");
const Record = require("../models/Record");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const { addDays, isAfter, parseISO, formatISO } = require("date-fns");

class ForecastController {
    static async processForecast(req, res) {
        if (req.body.location && typeof req.body.location == "string") {
            const location_str = req.body.location;
            req.body.location = JSON.parse(location_str); //"广东省,珠海市,香洲区" -> ['广东省','珠海市','香洲区']
        }
        try {
            const formData = req.body;
            const file = req.file;
            file.originalname = Buffer.from(
                file.originalname,
                "binary"
            ).toString("utf8");

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
                // +++ 新增：过滤末尾空行 +++
                while (loadData.length > 0) {
                    const lastRow = loadData[loadData.length - 1];
                    // 检查行是否为空：长度为0 或 所有单元格都是空值
                    if (
                        lastRow.length === 0 ||
                        lastRow.every(
                            (cell) =>
                                cell === null ||
                                cell === undefined ||
                                cell === ""
                        )
                    ) {
                        loadData.pop(); // 移除空行
                    } else {
                        break; // 遇到非空行停止
                    }
                }
                console.log("过滤空行后行数:", loadData.length);
                // +++ 过滤结束 +++
                console.log("最后一行数据:", loadData[loadData.length - 1]);
            } catch (parseError) {
                return res.status(400).json({
                    success: false,
                    error: "文件解析失败",
                    errorCode: "PARSE_ERROR",
                    details: parseError.message,
                });
            }

            // 提取时间范围
            let dateRange = ForecastController.extractDateRange(loadData);

            /* 三、文件格式正确？---------------------------------------------------------- */
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
            const F_isContinuePredict = !!formData.previous_record_id;
            const rows_result = ForecastController.validateExcel(
                loadData,
                F_isContinuePredict
            );
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

            /* 四、如果是基于历史数据的继续预测 ---------------------------------------------------------- */

            let mergeData = null; // 合并的数据
            let root_id = null; // 继续预测时需找到根记录id作为参数传给算法
            if (F_isContinuePredict) {
                const continueResult =
                    await ForecastController.handleContinuePrediction(
                        formData.previous_record_id,
                        loadData
                    );

                if (!continueResult.success) {
                    return res.status(continueResult.statusCode || 500).json({
                        success: false,
                        error: continueResult.error,
                        errorCode: continueResult.errorCode,
                        details: continueResult.details,
                    });
                }

                mergeData = continueResult.mergeData;
                root_id = continueResult.rootId;
                console.log(
                    `数据合并成功，历史记录天数: ${continueResult.historyDays}, 新数据天数: ${loadData.length - 1}, 总天数: ${mergeData.length - 1}, 根记录ID: ${root_id}`
                );
            }

            // 提前创建pending状态记录
            const record = {
                user_id: formData.user_id ? formData.user_id : null,
                mode: formData.mode,
                customer_type: formData.customer_type || null,
                pv_config: formData.pv_config || null,
                pv_capacity: formData.pv_capacity || null,
                province: formData.location[0] || "",
                city: formData.location[1] || "",
                district: formData.location[2] || "",
                forecast_range: formData.forecast_range,
                uploadFilePath: file.path,
                uploadDateRange: dateRange, // 时间范围
                uploadData: loadData, // 解析后的数据
                previous_record_id: F_isContinuePredict // 如果用户是基于历史数据继续预测的则要保存父链接
                    ? formData.previous_record_id
                    : null,
                resultFilePath: null, //成功后会补上result.filePath
                predictionData: null, //成功后会补上predictionData
            };
            console.log("创建预测记录，模式:", record.mode);
            const recordId = await Record.create(record); // 生成暂存记录id

            console.log("暂存预测记录ID:", recordId);

            /* 五、调用算法服务进行预测 --------------------------------------------------------------------------------------------------------------------------------- */
            const payload = {
                ...formData,
                userId: formData.user_id ? formData.user_id : null,
                recordId,
                rootId: F_isContinuePredict ? root_id : null,
            };
            let predictionData;
            try {
                let finalLoadData = F_isContinuePredict ? mergeData : loadData; // 用户上传的负荷数据：如果不是继续预测，就是loadData本身没变，如果是继续预测，则为合并后的数据
                predictionData = await AlgorithmService.predict(
                    payload,
                    finalLoadData
                );
            } catch (algorithmError) {
                await Record.deleteById(recordId); // 算法失败 -> 删除暂存记录
                console.log("算法失败,删除记录:", recordId);
                return res.status(500).json({
                    success: false,
                    error: "预测处理失败",
                    errorCode: "ALGORITHM_ERROR",
                    details: algorithmError.message,
                });
            }

            /* 六、生成结果Excel文件 ---------------------------------------------------------------------------------------------------------------------------------  */
            let resultExcel;
            try {
                resultExcel = ExcelService.generate(predictionData);
            } catch (generateError) {
                await Record.deleteById(recordId); // Excel生成失败 -> 删除记录
                console.log("Excel生成失败,删除记录:", recordId);
                return res.status(500).json({
                    success: false,
                    error: "结果生成失败",
                    errorCode: "RESULT_GENERATION_ERROR",
                    details: generateError.message,
                });
            }

            // 算法调用与生成Excel成功：暂存记录 -> 正式记录
            await Record.update(recordId, {
                predictionData,
                resultFilePath: resultExcel.filePath,
            });
            console.log("正式存入预测记录:", recordId);

            // 返回给前端的关于Excel文件的信息
            const excelInfo = {
                name: file.originalname,
                size: Math.round(file.size / 1024), // 转换为KB
                uploadTime: new Date().toISOString().split("T")[0],
                url: `/api/history/${recordId}/download/upload`,
                stats: ForecastController.calculateExcelStats(
                    loadData,
                    F_isContinuePredict
                ),
                dateRange,
            };

            // 返回响应
            res.json({
                success: true,
                recordId,
                predictionData,
                resultFileName: resultExcel.fileName,
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
    static validateExcel(data, isContinuePredict = false) {
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

        // 新增：验证日期连续性
        const dateContinuityResult =
            ForecastController.validateDateContinuity(dates);
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

    /**
     * 验证日期连续性和顺序
     * @param {Date[]} dates - 日期对象数组
     * @returns {object} 验证结果
     */
    static validateDateContinuity(dates) {
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
    // 新增方法：计算Excel统计信息
    static calculateExcelStats(loadData, isContinuePredict = false) {
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
        if (!isContinuePredict) {
            if (days < 365) {
                status = `已验证（警告：数据天数少于一年，将影响节假日预测效果）`;
                if (days < 90) {
                    status = `已验证（警告：数据天数少于90天，影响预测效果）`;
                }
            } else if (pointsPerDay !== 24) {
                status = `已验证（警告：时间粒度不是24小时）`;
            }
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
    /* 处理继续预测逻辑 */
    static async handleContinuePrediction(previousRecordId, loadData) {
        try {
            // 1. 获取历史数据的最后日期
            const lastHistoryDate = await Record.getLastDate(previousRecordId);
            const historyEnd = parseISO(lastHistoryDate);

            // 2. 计算要求的开始日期（历史结束日期的下一天）
            const requiredStartDate = addDays(historyEnd, 1);

            // 3. 获取新上传文件的开始日期
            const newStartDate = loadData[1][0]; // 第一行数据是日期
            const newStart = parseISO(newStartDate);

            // 4. 验证日期连续性
            if (
                formatISO(newStart, { representation: "date" }) !==
                formatISO(requiredStartDate, { representation: "date" })
            ) {
                return {
                    success: false,
                    statusCode: 400,
                    error: "日期不连续",
                    errorCode: "DATE_CONTINUITY_ERROR",
                    details: `继续预测要求数据从 ${formatISO(requiredStartDate, { representation: "date" })} 开始，但上传的数据从 ${newStartDate} 开始`,
                };
            }

            // 5. 获取完整的历史数据（包括所有祖先记录）
            const historyData = await Record.getMergedData(previousRecordId);

            // 6. 合并数据：历史数据 + 新数据（去掉表头）
            const mergedData = [
                ...historyData, // 历史数据（包含表头）
                ...loadData.slice(1), // 新数据（去掉表头）
            ];

            // 7. 计算历史天数（数据行数，不包括表头）
            const historyDays = historyData.length - 1;

            // 8. 查找根记录ID +++
            let currentRecordId = previousRecordId; // 从previousRecordId开始找
            let rootId = null;
            while (currentRecordId) {
                // 沿着previous_record_id链向上追溯
                const record = await Record.findById(currentRecordId);
                if (!record) {
                    throw new Error(`记录 ${currentRecordId} 不存在`); // 记录不存在，抛出错误
                }
                // 如果当前记录没有父记录，则它就是根记录
                if (!record.previous_record_id) {
                    rootId = record.id; // 确保转换为字符串
                    break;
                }
                // 继续向上追溯
                currentRecordId = record.previous_record_id;
            }
            if (!rootId) {
                throw new Error(
                    `无法找到根记录，起始记录ID: ${previousRecordId}`
                ); // 没找到根记录，抛出错误
            }
            console.log(`找到根记录ID: ${rootId}`);

            return {
                success: true,
                mergeData: mergedData,
                historyDays,
                rootId,
            };
        } catch (error) {
            console.error("继续预测处理失败:", error);
            return {
                success: false,
                statusCode: 500,
                error: "历史数据合并失败",
                errorCode: "DATA_MERGE_ERROR",
                details: error.message,
            };
        }
    }
}

module.exports = ForecastController;
