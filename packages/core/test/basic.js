var create = require('./helpers/create')
var crypto = require('../lib/crypto')
var tape = require('tape')
var ddatabase = require('../')
var dwRem = require('@dwcore/rem')
var bufferAlloc = require('buffer-alloc-unsafe')

tape('dDatabase Core Tests: append', function (t) {
  t.plan(8)

  var ddb = create({valueEncoding: 'json'})

  ddb.append({
    hello: 'world'
  })

  ddb.append([{
    hello: 'verden'
  }, {
    hello: 'welt'
  }])

  ddb.flush(function () {
    t.same(ddb.length, 3, '3 blocks')
    t.same(ddb.byteLength, 54, '54 bytes')

    ddb.get(0, function (err, value) {
      t.error(err, 'no error')
      t.same(value, {hello: 'world'})
    })

    ddb.get(1, function (err, value) {
      t.error(err, 'no error')
      t.same(value, {hello: 'verden'})
    })

    ddb.get(2, function (err, value) {
      t.error(err, 'no error')
      t.same(value, {hello: 'welt'})
    })
  })
})

tape('dDatabase Core Tests: flush', function (t) {
  var ddb = create()

  ddb.append('hello')

  ddb.flush(function (err) {
    t.error(err, 'no error')
    t.same(ddb.length, 1, '1 block')
    t.end()
  })
})

tape('dDatabase Core Tests: verify', function (t) {
  t.plan(9)

  var ddb = create()
  var evilddb = create(ddb.key, {secretKey: ddb.secretKey})

  ddb.append('test', function (err) {
    t.error(err, 'no error')

    evilddb.append('t\0st', function (err) {
      t.error(err, 'no error')

      ddb.signature(0, function (err, sig) {
        t.error(err, 'no error')
        t.same(sig.index, 0, '0 signed at 0')

        ddb.verify(0, sig.signature, function (err, success) {
          t.error(err, 'no error')
          t.ok(success)
        })

        evilddb.verify(0, sig.signature, function (err, success) {
          t.ok(!!err)
          t.ok(err instanceof Error)
          t.ok(!success, 'fake verify failed')
        })
      })
    })
  })
})

tape('dDatabase Core Tests: rootHashes', function (t) {
  t.plan(9)

  var ddb = create()
  var evilddb = create(ddb.key, {secretKey: ddb.secretKey})

  ddb.append('test', function (err) {
    t.error(err, 'no error')

    evilddb.append('t\0st', function (err) {
      t.error(err, 'no error')

      var result = []

      ddb.rootHashes(0, onroots)
      evilddb.rootHashes(0, onroots)

      function onroots (err, roots) {
        t.error(err, 'no error')
        t.ok(roots instanceof Array)
        result.push(roots)
        if (result.length < 2) return
        t.notEqual(result[0], result[1])
        t.equal(result[0].length, result[1].length)
        t.notEqual(Buffer.compare(result[0][0].hash, result[1][0].hash), 0)
      }
    })
  })
})

tape('dDatabase Core Tests: pass in secret key', function (t) {
  var keyPair = crypto.keyPair()
  var secretKey = keyPair.secretKey
  var key = keyPair.publicKey

  var ddb = create(key, {secretKey: secretKey})

  ddb.on('ready', function () {
    t.same(ddb.key, key)
    t.same(ddb.secretKey, secretKey)
    t.ok(ddb.writable)
    t.end()
  })
})

tape('dDatabase Core Tests: check existing key', function (t) {
  var ddb = ddatabase(storage)

  ddb.append('hi', function () {
    var key = bufferAlloc(32)
    key.fill(0)
    var otherDdb = ddatabase(storage, key)
    otherDdb.on('error', function () {
      t.pass('should error')
      t.end()
    })
  })

  function storage (name) {
    if (storage[name]) return storage[name]
    storage[name] = dwRem()
    return storage[name]
  }
})

tape('dDatabase Core Tests: create from existing keys', function (t) {
  t.plan(3)

  var storage1 = storage.bind(null, '1')
  var storage2 = storage.bind(null, '2')

  var ddb = ddatabase(storage1)

  ddb.append('hi', function () {
    var otherDdb = ddatabase(storage2, ddb.key, { secretKey: ddb.secretKey })
    var store = otherDdb._storage
    otherDdb.close(function () {
      store.open({key: ddb.key}, function (err, data) {
        t.error(err)
        t.equals(data.key.toString('hex'), ddb.key.toString('hex'))
        t.equals(data.secretKey.toString('hex'), ddb.secretKey.toString('hex'))
      })
    })
  })

  function storage (prefix, name) {
    var fullname = prefix + '_' + name
    if (storage[fullname]) return storage[fullname]
    storage[fullname] = dwRem()
    return storage[fullname]
  }
})

tape('dDatabase Core Tests: head', function (t) {
  t.plan(6)

  var ddb = create({valueEncoding: 'json'})

  ddb.head(function (err, head) {
    t.ok(!!err)
    t.ok(err instanceof Error)
    step2()
  })

  function step2 () {
    ddb.append({
      hello: 'world'
    }, function () {
      ddb.head(function (err, head) {
        t.error(err)
        t.same(head, {hello: 'world'})
        step3()
      })
    })
  }

  function step3 () {
    ddb.append([{
      hello: 'verden'
    }, {
      hello: 'welt'
    }], function () {
      ddb.head({}, function (err, head) {
        t.error(err)
        t.same(head, {hello: 'welt'})
      })
    })
  }
})

tape('dDatabase Core Tests: append, no cache', function (t) {
  t.plan(8)

  var ddb = create({valueEncoding: 'json', storageCacheSize: 0})

  ddb.append({
    hello: 'world'
  })

  ddb.append([{
    hello: 'verden'
  }, {
    hello: 'welt'
  }])

  ddb.flush(function () {
    t.same(ddb.length, 3, '3 blocks')
    t.same(ddb.byteLength, 54, '54 bytes')

    ddb.get(0, function (err, value) {
      t.error(err, 'no error')
      t.same(value, {hello: 'world'})
    })

    ddb.get(1, function (err, value) {
      t.error(err, 'no error')
      t.same(value, {hello: 'verden'})
    })

    ddb.get(2, function (err, value) {
      t.error(err, 'no error')
      t.same(value, {hello: 'welt'})
    })
  })
})

tape('dDatabase Core Tests: onwrite', function (t) {
  var expected = [
    {index: 0, data: 'hello', peer: null},
    {index: 1, data: 'world', peer: null}
  ]

  var ddb = create({
    onwrite: function (index, data, peer, cb) {
      t.same({index: index, data: data.toString(), peer: peer}, expected.shift())
      cb()
    }
  })

  ddb.append(['hello', 'world'], function (err) {
    t.error(err, 'no error')
    t.same(expected.length, 0)
    t.end()
  })
})

tape('dDatabase Core Tests: close, emitter and callback', function (t) {
  t.plan(3)
  var ddb = create()

  ddb.on('close', function () {
    t.pass('close emitted')
  })

  ddb.close(function (err) {
    t.error(err, 'closed without error')
    t.pass('callback invoked')
  })

  ddb.close(function () {
    t.end()
  })
})

tape('dDatabase Core Tests: get batch', function (t) {
  t.plan(2 * 3)

  var ddb = create({valueEncoding: 'utf-8'})

  ddb.append(['a', 'be', 'cee', 'd'], function () {
    ddb.getBatch(0, 4, function (err, batch) {
      t.error(err)
      t.same(batch, ['a', 'be', 'cee', 'd'])
    })
    ddb.getBatch(1, 3, function (err, batch) {
      t.error(err)
      t.same(batch, ['be', 'cee'])
    })
    ddb.getBatch(2, 4, function (err, batch) {
      t.error(err)
      t.same(batch, ['cee', 'd'])
    })
  })
})
