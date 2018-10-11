const ecc = require('eosjs-ecc')
const Fcbuffer = require('fcbuffer')
const EosApi = require('eosjs-api')
const assert = require('assert')

const Structs = require('./structs')
const AbiCache = require('./abi-cache')
const writeApiGen = require('./write-api')
const format = require('./format')
const schema = require('./schema')

const token = require('./schema/eosio.token.abi.json')
const system = require('./schema/eosio.system.abi.json')
const eosio_null = require('./schema/eosio.null.abi.json')

const Eos = (config = {}) => {
  const configDefaults = {
    httpEndpoint: 'http://127.0.0.1:8888',
    keyPrefix: 'AAA',
    paymentUser: 'aaatrust1111',
    debug: false,
    verbose: false,
    broadcast: true,
    logger: {
      log: (...args) => config.verbose ? console.log(...args) : null,
      error: (...args) => config.verbose ? console.error(...args) : null
    },
    sign: true
  }

  function applyDefaults(target, defaults) {
    Object.keys(defaults).forEach(key => {
      if(target[key] === undefined) {
        target[key] = defaults[key]
      }
    })
  }

  applyDefaults(config, configDefaults)
  applyDefaults(config.logger, configDefaults.logger)
  return createEos(config)
}

module.exports = Eos

Object.assign(
  Eos,
  {
    version: '16.0.0',
    modules: {
      format,
      api: EosApi,
      ecc,
      json: {
        api: EosApi.api,
        schema
      },
      Fcbuffer
    },

    /** @deprecated */
    Testnet: function (config) {
      console.error('deprecated, change Eos.Testnet(..) to just Eos(..)')
      return Eos(config)
    },

    /** @deprecated */
    Localnet: function (config) {
      console.error('deprecated, change Eos.Localnet(..) to just Eos(..)')
      return Eos(config)
    }
  }
)

// 这个函数的功能：授权合约从买家帐号扣款。
//
// 参数说明：
// buyer: 买家账号
//
// 注：
// 1. 调用函数payForGood前，必须先进行授权。
// 2. 授权信息记录在链上，对于同一个买家来说，这个函数只需要调用一次。
async function authPermisson(buyer) {
  let accountInfo = await this.getAccount(buyer);
  let activeAuth = {};
  let needAddPermission = true;
  for (let perm of accountInfo.permissions) {
    // Example of accountInfo.permissions:
    //   "permissions": [
    //     {
    //         "perm_name": "active",
    //         "parent": "owner",
    //         "required_auth": {
    //             "threshold": 1,
    //             "keys": [
    //                 {
    //                     "key": "XXX",
    //                     "weight": 1
    //                 }
    //             ],
    //             "accounts": [
    //                 {
    //                     "permission": {
    //                         "actor": "aaatrust1111",
    //                         "permission": "eosio.code"
    //                     },
    //                     "weight": 1
    //                 }
    //             ],
    //             "waits": []
    //         }
    //     },
    if (perm.perm_name === "active") {
      activeAuth = perm.required_auth;
      let accounts = activeAuth.accounts;
      for (let account of accounts) {
        if (account.permission.actor === this.config.paymentUser &&
            account.permission.permission === "eosio.code") {
          // already add this permission, don't need add it again.
          needAddPermission = false;
          throw "the permission already existing, do nothing."
        }
      }

      if (needAddPermission === true) {
        accounts.push(
          {permission: {actor: this.config.paymentUser,
                        permission: "eosio.code"},
           weight: 1}
        );
      }
    }
  }

  let op_data = {
    account: buyer,
    permission: 'active',
    parent: 'owner',
    auth: activeAuth
  };

  return this.updateauth(op_data)
}

// 这个函数的功能为：买家预付款。
//
// 参数说明：
// id: 用于唯一标识这笔预付款，它的类型必须为uint64，且不能重复
// buyer: 买家账号，必须是链上存在的用户
// seller: 卖家账号，必须是链上存在的用户
// price: 商品价格，比如 "3.0000 EOS"
//
// 注：
// 1. 它不会直接打钱给卖家，而是暂时打款到中间帐号，当买家确定收到商品后，
// 应该调用 confirmPayment 来确认付款。
// 2. 调用本函数前，请确保已授权合约从buyer扣款；如果没有，请调用authPermisson
async function payForGood(id, buyer, seller, price) {
  const options = { authorization: [ `${buyer}@active` ] };
  let contract = await this.contract(this.config.paymentUser);
  return contract.prepay(id, buyer, seller, price, options);
}

// 这个函数的功能为：买家确认付款，预付款时的钱将打到卖家帐号。
//
// 参数说明：
// id: 预付款id
async function confirmPayment(buyer, id) {
  const options = { authorization: [ `${buyer}@active` ] };
  let contract = await this.contract(this.config.paymentUser);
  return contract.confirm(id, options);
}

function createEos(config) {
  const network = config.httpEndpoint != null ? EosApi(config) : null
  config.network = network

  const abis = []
  const abiCache = AbiCache(network, config)
  abis.push(abiCache.abi('eosio.null', eosio_null))
  abis.push(abiCache.abi('eosio.token', token))
  abis.push(abiCache.abi('eosio', system))

  if(!config.chainId) {
    config.chainId = 'cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f'
  }

  if(network) {
    checkChainId(network, config.chainId, config.logger)
  }

  if(config.mockTransactions != null) {
    if(typeof config.mockTransactions === 'string') {
      const mock = config.mockTransactions
      config.mockTransactions = () => mock
    }
    assert.equal(typeof config.mockTransactions, 'function', 'config.mockTransactions')
  }
  const {structs, types, fromBuffer, toBuffer} = Structs(config)
  const eos = mergeWriteFunctions(config, EosApi, structs, abis)

  Object.assign(eos, {
    config: safeConfig(config),
    fc: {
      structs,
      types,
      fromBuffer,
      toBuffer,
      abiCache
    },
    authPermisson: authPermisson,
    payForGood: payForGood,
    confirmPayment: confirmPayment,
    // Repeat of static Eos.modules, help apps that use dependency injection
    modules: {
      format
    }
  })

  if(!config.signProvider) {
    config.signProvider = defaultSignProvider(eos, config)
  }

  return eos
}

/**
  Set each property as read-only, read-write, no-access.  This is shallow
  in that it applies only to the root object and does not limit access
  to properties under a given object.
*/
function safeConfig(config) {
  // access control is shallow references only
  const readOnly = new Set(['httpEndpoint', 'abiCache', 'chainId', 'expireInSeconds', 'paymentUser'])
  const readWrite = new Set(['verbose', 'debug', 'broadcast', 'logger', 'sign'])
  const protectedConfig = {}

  Object.keys(config).forEach(key => {
    Object.defineProperty(protectedConfig, key, {
      set: function(value) {
        if(readWrite.has(key)) {
          config[key] = value
          return
        }
        throw new Error('Access denied')
      },

      get: function() {
        if(readOnly.has(key) || readWrite.has(key)) {
          return config[key]
        }
        throw new Error('Access denied')
      }
    })
  })
  return protectedConfig
}

/**
  Merge in write functions (operations).  Tested against existing methods for
  name conflicts.

  @arg {object} config.network - read-only api calls
  @arg {object} EosApi - api[EosApi] read-only api calls
  @return {object} - read and write method calls (create and sign transactions)
  @throw {TypeError} if a funciton name conflicts
*/
function mergeWriteFunctions(config, EosApi, structs, abis) {
  const {network} = config

  const merge = Object.assign({}, network)

  const writeApi = writeApiGen(EosApi, network, structs, config, abis)
  throwOnDuplicate(merge, writeApi, 'Conflicting methods in EosApi and Transaction Api')
  Object.assign(merge, writeApi)

  return merge
}

function throwOnDuplicate(o1, o2, msg) {
  for(const key in o1) {
    if(o2[key]) {
      throw new TypeError(msg + ': ' + key)
    }
  }
}

/**
  The default sign provider is designed to interact with the available public
  keys (maybe just one), the transaction, and the blockchain to figure out
  the minimum set of signing keys.

  If only one key is available, the blockchain API calls are skipped and that
  key is used to sign the transaction.
*/
const defaultSignProvider = (eos, config) => async function({
  sign, buf, transaction, optionsKeyProvider
}) {
  // optionsKeyProvider is a per-action key: await eos.someAction('user2' .., {keyProvider: privateKey2})
  const keyProvider = optionsKeyProvider ? optionsKeyProvider : config.keyProvider

  if(!keyProvider) {
    throw new TypeError('This transaction requires a keyProvider for signing')
  }

  let keys = keyProvider
  if(typeof keyProvider === 'function') {
    keys = keyProvider({transaction})
  }

  // keyProvider may return keys or Promise<keys>
  keys = await Promise.resolve(keys)

  if(!Array.isArray(keys)) {
    keys = [keys]
  }

  keys = keys.map(key => {
    try {
      // normalize format (WIF => PVT_K1_base58privateKey)
      return {private: ecc.PrivateKey(key).toString()}
    } catch(e) {
      // normalize format (EOSKey => PUB_K1_base58publicKey)
      return {public: ecc.PublicKey(key, config.keyPrefix).toString(config.keyPrefix)}
    }
    assert(false, 'expecting public or private keys from keyProvider')
  })

  if(!keys.length) {
    throw new Error('missing key, check your keyProvider')
  }

  // simplify default signing #17
  if(keys.length === 1 && keys[0].private) {
    const pvt = keys[0].private
    return sign(buf, pvt)
  }

  // offline signing assumes all keys provided need to sign
  if(config.httpEndpoint == null) {
    const sigs = []
    for(const key of keys) {
      sigs.push(sign(buf, key.private))
    }
    return sigs
  }

  const keyMap = new Map()

  // keys are either public or private keys
  for(const key of keys) {
    const isPrivate = key.private != null
    const isPublic = key.public != null

    if(isPrivate) {
      keyMap.set(ecc.privateToPublic(key.private, config.keyPrefix), key.private)
    } else {
      keyMap.set(key.public, null)
    }
  }

  const pubkeys = Array.from(keyMap.keys())

  return eos.getRequiredKeys(transaction, pubkeys).then(({required_keys}) => {
    if(!required_keys.length) {
      throw new Error('missing required keys for ' + JSON.stringify(transaction))
    }

    const pvts = [], missingKeys = []

    for(let requiredKey of required_keys) {
      // normalize (EOSKey.. => PUB_K1_Key..)
      requiredKey = ecc.PublicKey(requiredKey, config.keyPrefix).toString(config.keyPrefix)

      const wif = keyMap.get(requiredKey)
      if(wif) {
        pvts.push(wif)
      } else {
        missingKeys.push(requiredKey)
      }
    }

    if(missingKeys.length !== 0) {
      assert(typeof keyProvider === 'function',
        'keyProvider function is needed for private key lookup')

      // const pubkeys = missingKeys.map(key => ecc.PublicKey(key).toStringLegacy())
      keyProvider({pubkeys: missingKeys})
        .forEach(pvt => { pvts.push(pvt) })
    }

    const sigs = []
    for(const pvt of pvts) {
      sigs.push(sign(buf, pvt))
    }

    return sigs
  })
}

function checkChainId(network, chainId, logger) {
  network.getInfo({}).then(info => {
    if(info.chain_id !== chainId) {
      if(logger.log) {
        logger.log(
          'chainId mismatch, signatures will not match transaction authority. ' +
          `expected ${chainId} !== actual ${info.chain_id}`
        )
      }
    }
  }).catch(error => {
    if(logger.error) {
      logger.error('Warning, unable to validate chainId: ' + error.message)
    }
  })
}
