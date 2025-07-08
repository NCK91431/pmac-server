const axios = require("axios");

class AlgorithmService {
    static async predict(form_data, loadData) {
        // console.log("formData原始数据->", form_data);

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
                    pvConfig: form_data.pvConfig
                        ? form_data.pvConfig == "yes"
                            ? "有"
                            : "无"
                        : "不确定",
                    // location: JSON.stringify(form_data.location), // 将数组转为字符串
                    location: JSON.parse(form_data.location), // 直接使用数组，不再字符串化
                    forecastRange:
                        form_data.forecastRange === "4days" ? "D-4" : "D-1",
                    customerType: customer_types_MAP[form_data.customerType],
                },
                loadData,
            };
            // 调用算法部门接口
            const response = await axios.post(
                "http://125.88.36.147:5010/loadForecast/V1",
                requestData,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
            console.log("算法接口返回的响应数据", response.data);
            console.log("response.data.success->", response.data.success);
            console.log(
                "typeof response.data.success->",
                typeof response.data.success
            );
            // 转换数据格式
            const result = {
                dates: [response.data.date], // 将单个日期转为数组
                values: [response.data.predictionData], // 将预测数据转为二维数组
            };
            return result;
        } catch (error) {
            console.error("调用算法接口失败:", {
                message: error.message,
                url: "http://10.0.110.169:5010/loadForecast/V1",
                // requestData: JSON.stringify(requestData), // 记录请求数据
                // stack: error.stack,
            });
            // throw new Error("算法服务不可用: " + error.message);
        }
    }
}

module.exports = AlgorithmService;
