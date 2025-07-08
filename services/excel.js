/* excel处理服务 */
const xlsx = require("node-xlsx");
const fs = require("fs");
const path = require("path");
const excelDateToJs = require("excel-date-to-js");
class ExcelService {
    static parse(filePath) {
        const workSheets = xlsx.parse(filePath);
        const data = workSheets[0].data;
        // 检查是否有数据
        if (!data || data.length === 0) {
            return data;
        }
        // 转换表头的时间列（Excel小数时间 -> 标准小时格式）
        const header = data[0];
        if (header && header.length > 1) {
            // 确保有表头且至少有一列（日期+时间）
            data[0] = header.map((cell, index) => {
                if (index === 0) return cell; // 跳过日期列

                // 尝试解析为数字（Excel时间格式）
                const hourValue = parseFloat(cell);
                if (!isNaN(hourValue)) {
                    // 将Excel时间小数转换为小时（0.041666... -> 1）
                    const hour = Math.round(hourValue * 24);
                    return `${hour}:00`; // 返回标准格式，如 "1:00"
                }
                return cell; // 如果不是数字，保持原样
            });
        }
        // 转换数据行的日期列（Excel序列日期 -> YYYY-MM-DD）
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row && row.length > 0) {
                const excelSerialDate = row[0];

                // 检查是否是数字（Excel序列日期）
                if (typeof excelSerialDate === "number") {
                    // Excel基准日期（1900-01-01）对应的毫秒数
                    const excelBaseDate = new Date(1900, 0, 1);
                    const baseTime = excelBaseDate.getTime();

                    // 计算实际日期（考虑Excel的日期偏移和闰年问题）
                    // Excel的日期序列中，1900-02-29是不存在的，需要调整
                    const days = excelSerialDate - 1; // 减去1天补偿

                    // 计算日期对象
                    const date = new Date(baseTime + days * 86400 * 1000);

                    // 格式化日期为 YYYY-MM-DD
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, "0");
                    const day = String(date.getDate()).padStart(2, "0");

                    row[0] = `${year}-${month}-${day}`;
                }
            }
        }

        return data;
    }

    static generate(predictionData) {
        const { dates, values } = predictionData;

        // 准备Excel数据
        const data = [];

        // 添加表头
        const header = ["日期"].concat(
            Array.from({ length: 24 }, (_, i) => `${i}:00`)
        );
        data.push(header);

        // 添加数据行
        dates.forEach((date, index) => {
            const row = [date].concat(values[index]);
            data.push(row);
        });

        // 构建Excel文件
        const buffer = xlsx.build([{ name: "负荷预测结果", data }]);

        // 使用项目根目录创建结果目录
        const rootDir = process.cwd();
        const resultDir = path.join(rootDir, "results");
        // 确保结果目录存在
        if (!fs.existsSync(resultDir)) {
            fs.mkdirSync(resultDir, { recursive: true });
        }

        // 保存文件
        const fileName = `forecast-result-${Date.now()}.xlsx`;
        const filePath = path.join(resultDir, fileName);
        fs.writeFileSync(filePath, buffer);

        return {
            buffer,
            fileName,
            filePath,
        };
    }
}

module.exports = ExcelService;
