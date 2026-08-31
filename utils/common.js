/**
 * Copyright(c) 2026 The Rainway AI Gateway (壬远AI网关) Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*
 * @Author: sunjian
 * @Date: 2023-10-22 20:22:04
 * @Descripttion: 公共方法
 */
const { browser, test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment/moment');
const { execSync } = require('child_process');

global.filesSffix = '.spec.js';
global.imageSffix = '.png';

/**
 *获取调用链信息
 *@returns {string} 调用链数组
 */
var getStack = function () {
  var orig = Error.prepareStackTrace;
  Error.prepareStackTrace = function (_, stack) {
    return stack;
  };
  var err = new Error;
  var stack = err.stack;
  Error.prepareStackTrace = orig;
  stack.shift();
  return stack;
};

/**
 * 读取配置信息
 * @returns
 */
function getConf() {
  try {
    const confInfo = fs.readFileSync('conf.json', 'utf-8').trim();
    return confInfo.toString();
  } catch {
    console.log("read conf.json file error!");
  }
}

/**
 * 读取配置信息
 * @returns
 */
 function getAuth() {
  try {
    const confInfo = fs.readFileSync('auth.json', 'utf-8').trim();
    return confInfo.toString();
  } catch {
    console.log("read auth.json file error!");
  }
}

/**
 * 截图
 * @param {Page} page 
 * @param {string} name 图片名称
 */
async function screenshot(page, name) {
  var arr = getStack();
  const fileName = path.basename(arr[1].getFileName(), global.filesSffix);
  const time = new Date().getTime();
  const imageName = 'screen-shots/' + fileName + '_' + name + '_' + time + global.imageSffix;
  console.log(imageName);
  await page.screenshot({ path: imageName });
}

/**
 * 设置默认参数
 * @param {*} key 
 * @param {*} value 
 */
function setDefaultParameter(key, value) {
  process.env[key] = value;
}

/**
 * 获取默认参数
 * @param {*} key 
 * @returns
 */
function getDefaultParameter(key) {
  return process.env[key];
}

/**
 * 发送get请求
 * @param {*} url 
 * @param {*} headers
 * @returns
 */
 function sendGetRequest(url, headers = {}) {
  return axios.get(url, {headers}).then(res => {
    return res.data;
  }).catch(err => {
    return err.toString();
  });
}

/**
 * 发送post请求
 * @param {*} url 
 * @param {*} headers 
 * @param {*} params 
 * @returns
 */
function sendPostRequest(url, params = {}, headers = {}) {
  return axios.post(url, params, headers).then(res => {
    return res.data;
  }).catch(err => {
    return err.toString();
  });
}

/**
 * 异步读取文件中的内容
 * @param {*} filePath
 * @returns
 */
 function readFile(filePath){
  fs.readFile(filePath, 'utf-8', function(err, data) {
    if(err) {
      console.log('read file [' + filePath + '] err!', err.message);
	    return '';
    }
    return data.toString();
  });
}

/**
 * 同步读取文件中的内容
 * @param {*} filePath
 * @returns
 */
 function readFileSync(filePath){
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    //console.log('sync read file [' + filePath + '] err!');
	  return '';
  }
}

/**
 * 同步写入数据到文件中
 * @param {*} filePath 
 * @param {*} data
 * @returns
 */
function writeFileSync(filePath, data){
  fs.writeFileSync(filePath, data, 'utf-8', (err) => {
    if(err) {
      return console.log('sync write file [' + filePath + '] err!', err.message);
    }
  });
}

/**
 * 异步写入数据到文件中
 * @param {*} filePath 
 * @param {*} data
 * @returns
 */
 function writeFile(filePath, data){
  fs.writeFile(filePath, data, 'utf-8', (err) => {
    if(err) {
      return console.log('write file [' + filePath + '] err!', err.message);
    }
  });
}

/**
 * 同步追加数据到文件中
 * @param {*} filePath 
 * @param {*} data
 * @returns
 */
 function appendFileSync(filePath, data){
  fs.appendFileSync(filePath, data, 'utf-8', (err) => {
    if(err) {
      return console.log('append file [' + filePath + '] err!', err.message);
    }
  });
}

/**
 * 异步追加数据到文件中
 * @param {*} filePath 
 * @param {*} data
 * @returns
 */
 function appendFile(filePath, data){
  fs.appendFile(filePath, data, 'utf-8', (err) => {
    if(err) {
      return console.log('append file [' + filePath + '] err!', err.message);
    }
  });
}

/**
 * 写入日志
 * @param {*} data 
 */
function writeLog(data){
  console.log(data);
  let logFilePath = './logs/' + moment().format('YYYY-MM-DD_HH') + '.log';
  appendFile(logFilePath, moment().format('YYYY-MM-DD HH:mm:ss') + ' ' + data.toString() + '\n');
}

/**
 * 执行Linux命令
 * @param {*} command 
 * @returns 
 */
 function execCommand(command) {
  try {
    let res = execSync(command).toString();
    return res;
  } catch(err) {
    console.log(err);
    return err.toString();
  }
}

const SERVICE_DOWN_FILE = path.join(__dirname, '../service-down.flag');

async function checkServiceHealth(page, url) {
  if (isServiceDown()) {
    return false;
  }

  try {
    await page.goto(url, {
      timeout: 10000,
      waitUntil: 'domcontentloaded',
    });
    return true;
  } catch (e) {
    if (
      e.message.includes('ERR_CONNECTION_REFUSED') ||
      e.message.includes('ERR_CONNECTION_RESET') ||
      e.message.includes('ERR_NETWORK_CHANGED') ||
      e.message.includes('net::ERR')
    ) {
      setServiceDown(true);
      console.log('❌ 服务不可用: ' + e.message);
      console.log('❌ 将跳过剩余所有测试用例');
      return false;
    }
    throw e;
  }
}

function isServiceDown() {
  try {
    fs.accessSync(SERVICE_DOWN_FILE, fs.constants.F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

function setServiceDown(value) {
  if (value) {
    fs.writeFileSync(SERVICE_DOWN_FILE, '1');
  } else {
    try {
      fs.unlinkSync(SERVICE_DOWN_FILE);
    } catch (e) {
    }
  }
}

module.exports = {
  screenshot: screenshot,
  getConf: getConf,
  getAuth: getAuth,
  setDefaultParameter: setDefaultParameter,
  getDefaultParameter: getDefaultParameter,
  get: sendGetRequest,
  post: sendPostRequest,
  readFile: readFile,
  readFileSync: readFileSync,
  writeFile: writeFile,
  writeFileSync: writeFileSync,
  appendFile: appendFile,
  appendFileSync: appendFileSync,
  log: writeLog,
  exec: execCommand,
  checkServiceHealth: checkServiceHealth,
  isServiceDown: isServiceDown,
  setServiceDown: setServiceDown
};