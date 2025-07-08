// services/algorithm.js
class AlgorithmService {
    // 存储最近的实际数据，用于生成连续预测
    static lastActualData = null;

    static async predict(formData, loadData) {
        // 在实际项目中，这里会调用真正的算法API
        // 以下是模拟实现

        // 提取日期列表（假设第一列是日期）
        const dates = loadData.slice(1).map(row => row[0]);

        // 保存最近的实际数据用于后续预测
        const lastDayIndex = loadData.length - 1;
        this.lastActualData = loadData[lastDayIndex].slice(1); // 跳过日期列

        // 预测天数
        const days = formData.forecastRange === '4days' ? 4 : 1;

        // 生成预测日期
        const lastDate = new Date(dates[dates.length - 1]);
        const predictionDates = [];
        for (let i = 1; i <= days; i++) {
            const nextDate = new Date(lastDate);
            nextDate.setDate(lastDate.getDate() + i);
            predictionDates.push(nextDate.toISOString().split('T')[0]);
        }

        // 生成预测值
        const predictionValues = this.generatePredictionValues(days);

        // 模拟API延迟 (0.5-1.5秒)
        const delay = 500 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        return {
            dates: predictionDates,
            values: predictionValues
        };
    }

    static generatePredictionValues(days) {
        const values = [];

        // 生成基准数据（基于最后一天的实际数据）
        let baseData = [...this.lastActualData];

        // 生成每天的预测数据
        for (let day = 0; day < days; day++) {
            const dayValues = [];

            // 生成趋势因子（每天不同）
            const dailyTrend = (Math.random() * 0.3) - 0.15; // -15% 到 +15%

            // 生成随机波动模式（每天不同）
            const pattern = this.generateHourlyPattern();

            for (let hour = 0; hour < 24; hour++) {
                // 基础值（最后一天的实际值）
                let value = baseData[hour];

                // 应用每日趋势
                value *= (1 + dailyTrend);

                // 应用小时波动模式
                value *= (1 + pattern[hour]);

                // 添加随机噪声 (±5%)
                const noise = (Math.random() * 0.1) - 0.05;
                value *= (1 + noise);

                // 确保值在合理范围内
                value = Math.max(value * 0.7, value); // 不低于基准值的70%
                value = Math.min(value * 1.3, value); // 不高于基准值的130%

                dayValues.push(Math.round(value));
            }

            values.push(dayValues);

            // 下一天的基础数据使用今天的预测值
            baseData = [...dayValues];
        }

        return values;
    }

    static generateHourlyPattern() {
        // 生成24小时的波动模式
        const pattern = Array(24).fill(0);

        // 生成几个随机峰值
        const peakCount = 2 + Math.floor(Math.random() * 3); // 2-4个峰值
        for (let i = 0; i < peakCount; i++) {
            const hour = Math.floor(Math.random() * 24);
            const intensity = (Math.random() * 0.15) + 0.05; // 5%-20%的波动
            pattern[hour] = intensity;

            // 影响相邻小时
            if (hour > 0) pattern[hour - 1] = intensity * 0.7;
            if (hour < 23) pattern[hour + 1] = intensity * 0.7;
        }

        // 生成几个随机谷值
        const valleyCount = 1 + Math.floor(Math.random() * 2); // 1-2个谷值
        for (let i = 0; i < valleyCount; i++) {
            const hour = Math.floor(Math.random() * 24);
            const intensity = -(Math.random() * 0.15) - 0.05; // -5%到-20%的波动
            pattern[hour] = intensity;

            // 影响相邻小时
            if (hour > 0) pattern[hour - 1] = intensity * 0.7;
            if (hour < 23) pattern[hour + 1] = intensity * 0.7;
        }

        return pattern;
    }

    // 完全随机生成模式（用于无历史数据时）
    static generateRandomPattern() {
        const pattern = Array(24).fill(0);

        // 模拟典型负荷曲线（早高峰、午低谷、晚高峰）
        pattern[8] = 0.25; // 早高峰
        pattern[9] = 0.3;
        pattern[10] = 0.25;
        pattern[13] = -0.15; // 午低谷
        pattern[14] = -0.1;
        pattern[19] = 0.2; // 晚高峰
        pattern[20] = 0.25;

        // 添加随机波动
        for (let i = 0; i < 24; i++) {
            pattern[i] += (Math.random() * 0.1) - 0.05;
        }

        return pattern;
    }
}

module.exports = AlgorithmService;