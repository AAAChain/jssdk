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
  chainId: '038f4b0fc8ff18a4f0842a8f0564611f6e96e8535901dd45e43ac8691a1c4dca',
  httpEndpoint: 'http://jungle.cryptolions.io:18888',  // 目前在eos测试网上，以后会迁移到AAA链上
  expireInSeconds: 60
}

aaa = AAA(config)

const buyer = 'buyer1';    // 请修改为链上真实存在的账号名
const seller = 'seller1';    // 请修改为链上真实存在的账号名
const price = '2.0000 EOS'
const id = Math.floor(Math.random() * Math.floor(Number.MAX_SAFE_INTEGER)); // 随机Id

// 授权合约从买家帐号扣款（仅需授权一次）
aaa.authPermisson(buyer).
  then(value => {console.log('authPermisson OK. txid: ' + value.transaction_id)}).
  catch(e => {console.log("authPermisson failed: " + e)});

// 买家预付款
aaa.payForGood(id, buyer, seller, price).
  then(value => {console.log('payForGood OK. txid: ' + value.transaction_id)}).
  catch(e => {console.log("payForGood failed: " + e)});

// 买家确认付款
aaa.confirmPayment(buyer, id).
  then(value => {console.log('confirmPayment OK. txid: ' + value.transaction_id)}).
  catch(e => {console.log("confirmPayment failed: " + e)});

```
