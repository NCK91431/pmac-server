const axios = require("axios");

class AlgorithmService {
    static async predict(payload, loadData) {
        console.log("AlgorithmService payload:", payload);
        const customer_types_MAP = {
            hospital: "医院",
            mall: "商超",
            discrete: "离散工业",
            continuous: "连续工业",
        };
        let requestData; //先声明
        try {
            // 准备请求数据
            requestData = {
                formData: {
                    userId: payload.userId,
                    recordId: payload.recordId,
                    rootId: payload.rootId,
                    pvConfig: payload.pv_config
                        ? payload.pv_config == "yes"
                            ? "有"
                            : "无"
                        : "不确定",
                    pvCapacity: payload.pv_capacity,
                    location: payload.location, // 直接使用数组，不再字符串化
                    forecastRange:
                        payload.forecast_range === "4days" ? "D-4" : "D-1",
                    customerType: customer_types_MAP[payload.customer_type],
                },
                loadData,
            };
            // 调用算法部门接口
            const response = await axios.post(
                `http://125.88.36.152:15010/loadForecast/V1`,
                requestData,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
            console.log("算法接口返回的响应数据", response.data);
            // 转换数据格式
            const result = {
                dates: [response.data.date], // 将单个日期转为数组
                values: [response.data.predictionData], // 将预测数据转为二维数组
            };
            return result;
        } catch (error) {
            console.error("调用算法接口失败:", {
                message: error.message,
                url: `http://125.88.36.152:15010/loadForecast/V1`,
            });
        }
    }
}

module.exports = AlgorithmService;
