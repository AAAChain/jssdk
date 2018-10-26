# AAAJS

General purpose library for AAA blockchains.

注：aaajs这个库fork自eosjs，并在其基础上增加了三个函数以提供一个支付系统。

### Usage

* Install with: `npm install aaajs`

### 实例

```js
AAA = require('aaajs')

config = {
  keyProvider: ['yourPrivateKey'], // WIF string or array of keys..
  keyPrefix: 'AAA',
  chainId: '1c6ae7719a2a3b4ecb19584a30ff510ba1b6ded86e1fd8b8fc22f1179c622a32',
  httpEndpoint: 'http://47.98.107.96:10180',
  expireInSeconds: 60
}

aaa = AAA(config)

const buyer = 'buyer1';    // 请修改为链上真实存在的账号名
const seller = 'seller1';    // 请修改为链上真实存在的账号名
const price = '2.0000 AAA'
const id = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // 随机Id

// 授权合约从买家帐号扣款（仅需授权一次）
aaa.authPermission(buyer).
  then(value => {console.log('authPermission OK. txid: ' + value.transaction_id)}).
  catch(e => {console.log("authPermission failed: " + e)});

// 买家预付款
aaa.payForGood(id, buyer, seller, price).
  then(value => {console.log('payForGood OK. txid: ' + value.transaction_id)}).
  catch(e => {console.log("payForGood failed: " + e)});

// 买家确认付款
aaa.confirmPayment(buyer, id).
  then(value => {console.log('confirmPayment OK. txid: ' + value.transaction_id)}).
  catch(e => {console.log("confirmPayment failed: " + e)});

```
