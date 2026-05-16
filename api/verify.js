const axios = require('axios');
// 后面替换成你的腾讯文档CSV链接
const SHEET_URL = "https://docs.qq.com/csv/DZGNhSWx2aW5kVnNZ?tab=BB08J2";
const SECRET_KEY = "LiveAuth2026TVBox";

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { card, deviceId, sign } = req.body;
  const checkSign = require('crypto').createHash('md5').update(card + deviceId + SECRET_KEY).digest('hex');
  if(sign !== checkSign) return res.json({code:401,msg:"非法请求"});

  if (!card || !deviceId) return res.json({ code: 400, msg: "参数缺失" });

  try {
    const sheetRes = await axios.get(SHEET_URL);
    const lines = sheetRes.data.trim().split('\n');
    if(lines.length < 2) return res.json({code:500,msg:"卡密库为空"});

    const header = lines[0].split(',');
    const cardIdx = header.indexOf('卡密');
    const devIdx = header.indexOf('设备ID');
    const timeIdx = header.indexOf('到期时间');
    const statusIdx = header.indexOf('状态');

    let auth = false;
    let expire = "";

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const rowCard = row[cardIdx]?.trim();
      const rowDev = row[devIdx]?.trim();
      const rowTime = row[timeIdx]?.trim();
      const rowStatus = row[statusIdx]?.trim();

      if (rowCard === card && !rowDev && rowStatus === "未使用") {
        auth = true;
        expire = rowTime;
        break;
      }
      if (rowCard === card && rowDev === deviceId && rowStatus === "正常") {
        const now = Date.now();
        const end = new Date(rowTime).getTime();
        if(now < end){
          auth = true;
          expire = rowTime;
        }
        break;
      }
    }

    if(auth){
      return res.json({code:200,msg:"授权成功",expire,deviceId});
    }else{
      return res.json({code:403,msg:"卡密无效/过期/已绑定其他设备"});
    }
  } catch (e) {
    return res.json({code:500,msg:"授权服务异常"});
  }
};
