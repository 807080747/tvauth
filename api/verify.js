const axios = require('axios');
const crypto = require('crypto');

// 已填好你的信息
const GITHUB_OWNER = "807080747";
const GITHUB_REPO = "tvauth";
const GITHUB_TOKEN = "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";

const SECRET_KEY = "LiveAuth2026TVBox";
const CSV_PATH = "cards.csv";
const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${CSV_PATH}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { card, deviceId, sign } = req.body;
  const checkSign = crypto.createHash('md5').update(card + deviceId + SECRET_KEY).digest('hex');
  if (sign !== checkSign) return res.json({ code: 401, msg: "非法请求" });

  if (!card || !deviceId) return res.json({ code: 400, msg: "参数缺失" });

  try {
    const { data: csvText } = await axios.get(RAW_URL);
    let lines = csvText.trim().split('\n');
    const header = lines[0].split(',');
    const cardIdx = header.indexOf('卡密');
    const devIdx = header.indexOf('设备ID');
    const timeIdx = header.indexOf('到期时间');
    const statusIdx = header.indexOf('状态');

    let auth = false;
    let expire = "";
    let needSave = false;

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const rowCard = row[cardIdx]?.trim();
      const rowDev = row[devIdx]?.trim();
      const rowTime = row[timeIdx]?.trim();
      const rowStatus = row[statusIdx]?.trim();

      // 未使用 → 自动绑定设备
      if (rowCard === card && !rowDev && rowStatus === "未使用") {
        row[devIdx] = deviceId;
        row[statusIdx] = "正常";
        lines[i] = row.join(',');
        auth = true;
        expire = rowTime;
        needSave = true;
        break;
      }

      // 已绑定，校验设备+过期
      if (rowCard === card && rowDev === deviceId && rowStatus === "正常") {
        const now = Date.now();
        const end = new Date(rowTime).getTime();
        if (now < end) {
          auth = true;
          expire = rowTime;
        }
        break;
      }
    }

    // 自动写回 GitHub
    if (needSave) {
      const newCsv = lines.join('\n');
      const fileInfo = await axios.get(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`,
        { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
      );
      const sha = fileInfo.data.sha;

      await axios.put(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`,
        {
          message: `自动绑定设备 ${deviceId}`,
          content: Buffer.from(newCsv).toString('base64'),
          sha
        },
        { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
      );
    }

    if (auth) {
      return res.json({ code: 200, msg: "授权成功", expire, deviceId });
    } else {
      return res.json({ code: 403, msg: "卡密无效/过期/已绑定其他设备" });
    }

  } catch (e) {
    return res.json({ code: 500, msg: "授权服务异常" });
  }
};
