/* 短信服务工具类 */
const Core = require("@alicloud/pop-core");

class SMSService {
    constructor() {
        this.client = new Core({
            accessKeyId: process.env.ALI_SMS_ACCESS_KEY,
            accessKeySecret: process.env.ALI_SMS_ACCESS_SECRET,
            endpoint: "https://dysmsapi.aliyuncs.com",
            apiVersion: "2017-05-25",
        });
    }

    async sendVerificationCode(phone, code) {
        const params = {
            PhoneNumbers: phone,
            SignName: process.env.ALI_SMS_SIGN_NAME,
            TemplateCode: process.env.ALI_SMS_TEMPLATE_CODE,
            TemplateParam: JSON.stringify({ code }),
        };

        const requestOption = {
            method: "POST",
        };

        try {
            const response = await this.client.request(
                "SendSms",
                params,
                requestOption
            );
            return response.Code === "OK";
        } catch (error) {
            console.error("短信发送失败:", error);
            return false;
        }
    }
}

module.exports = new SMSService();
