const common = require('../utils/common');
const fs = require('fs');
const path = require('path');

let confInfo = {};
try {
  confInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../conf.json'), 'utf-8'),
  );
} catch (e) {
  common.log('读取配置文件失败: ' + e.message);
}

function getOpenApiBaseUrl() {
  const base = confInfo['apiHost'] || confInfo['ctlHost'].replace('/login', '');
  return base + '/open-api/v1';
}

async function getUserData(page) {
  try {
    const userData = await page.evaluate(() => {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    });
    if (userData && userData.sessionKey) return userData;
  } catch (e) {
    common.log('从页面获取 sessionKey 失败: ' + e.message);
  }

  try {
    const authPath = path.join(__dirname, '../auth.json');
    if (fs.existsSync(authPath)) {
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      if (authData.origins && authData.origins.length > 0) {
        const localStorageItems = authData.origins[0].localStorage || [];
        const userItem = localStorageItems.find((item) => item.name === 'user');
        if (userItem && userItem.value) {
          const userData = JSON.parse(userItem.value);
          if (userData && userData.sessionKey) {
            common.log('从 auth.json 成功读取 sessionKey');
            return userData;
          }
        }
      }
    }
  } catch (e) {
    common.log('从 auth.json 读取失败: ' + e.message);
  }

  throw new Error('无法获取 session_key');
}

function authHeaders(sessionKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Session ' + sessionKey,
  };
}

async function parseApiResponse(response, label) {
  const body = await response.json();
  common.log(label + ' 响应: ' + JSON.stringify(body));
  if (body.ErrNum !== 200) {
    throw new Error(label + ' 失败: ' + (body.ErrMsg || body.ErrNum));
  }
  return body.Data;
}

async function getCertList(page) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/certificates',
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET certificates');
}

async function getCertDetail(page, certName) {
  const userData = await getUserData(page);
  const response = await page.request.get(
    getOpenApiBaseUrl() + '/certificates/' + certName,
    { headers: authHeaders(userData.sessionKey) },
  );
  return parseApiResponse(response, 'GET certificate detail');
}

async function createCert(page, certData) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.post(
      getOpenApiBaseUrl() + '/certificates',
      {
        data: certData,
        headers: authHeaders(userData.sessionKey),
      },
    );
    const body = await response.json();
    common.log('POST certificates 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('POST certificates 异常: ' + error.message);
    return false;
  }
}

async function deleteCert(page, certName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.delete(
      getOpenApiBaseUrl() + '/certificates/' + certName,
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('DELETE certificate 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('DELETE certificate 异常: ' + error.message);
    return false;
  }
}

async function setDefaultCert(page, certName) {
  try {
    const userData = await getUserData(page);
    const response = await page.request.patch(
      getOpenApiBaseUrl() + '/certificates/' + certName + '/default',
      { headers: authHeaders(userData.sessionKey) },
    );
    const body = await response.json();
    common.log('PATCH certificate default 响应: ' + JSON.stringify(body));
    return body.ErrNum === 200;
  } catch (error) {
    common.log('PATCH certificate default 异常: ' + error.message);
    return false;
  }
}

const TEST_FILES_DIR = path.join(__dirname, '../test-files/cert');

function getCertFilePath(filename) {
  return path.join(TEST_FILES_DIR, filename);
}

function readCertFileContent(filename) {
  const filePath = getCertFilePath(filename);
  return fs.readFileSync(filePath, 'utf-8');
}

function getDefaultCertPayload(certName, description, isDefault) {
  const certFileName = 'qa_auto_test_bfe_i_bfe.crt';
  const keyFileName = 'qa_auto_test_bfe_i_bfe_prv.pem';

  return {
    cert_name: certName,
    description: description,
    is_default: isDefault,
    cert_file_content: readCertFileContent(certFileName),
    key_file_content: readCertFileContent(keyFileName),
  };
}

module.exports = {
  getOpenApiBaseUrl,
  getUserData,
  getCertList,
  getCertDetail,
  createCert,
  deleteCert,
  setDefaultCert,
  getCertFilePath,
  readCertFileContent,
  getDefaultCertPayload,
};
