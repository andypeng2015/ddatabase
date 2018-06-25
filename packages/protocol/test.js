var tape = require('tape')
var choppa = require('choppa')
var protocol = require('./')
var bufferFrom = require('buffer-from')

var KEY = bufferFrom('01234567890123456789012345678901')
var OTHER_KEY = bufferFrom('12345678901234567890123456789012')

tape('dDatabase Protocol Tests: Basic', function (t) {
  t.plan(2)

  var a = protocol()
  var b = protocol()

  a.ddb(KEY)
  b.ddb(KEY)

  a.once('handshake', function () {
    t.pass('a got handshake')
  })

  b.once('handshake', function () {
    t.pass('b got handshake')
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: basic with handshake options', function (t) {
  t.plan(16)

  var data = [
    'eeaa62fbb11ba521cce58cf3fae42deb15d94a0436fc7fa0cbba8f130e7c0499',
    '8c797667bf307d82c51a8308fe477b781a13708e0ec1f2cc7f497392574e2464'
  ]

  var a = protocol({id: bufferFrom('a'), live: true, userData: bufferFrom(data)})
  var b = protocol({id: bufferFrom('b'), live: false, ack: true})

  a.ddb(KEY)
  b.ddb(KEY)

  a.once('handshake', function () {
    t.same(a.id, bufferFrom('a'))
    t.same(a.live, true)
    t.same(a.ack, false)
    t.same(a.userData, bufferFrom(data))
    t.same(a.remoteId, bufferFrom('b'))
    t.same(a.remoteLive, false)
    t.same(a.remoteUserData, null)
    t.same(a.remoteAck, true)
  })

  b.once('handshake', function () {
    t.same(b.id, bufferFrom('b'))
    t.same(b.live, false)
    t.same(b.ack, true)
    t.same(b.userData, null)
    t.same(b.remoteId, bufferFrom('a'))
    t.same(b.remoteLive, true)
    t.same(b.remoteUserData, bufferFrom(data))
    t.same(b.remoteAck, false)
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: send messages', function (t) {
  t.plan(10)

  var a = protocol()
  var b = protocol()

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)

  b.on('ddb', function (revelationKey) {
    t.same(revelationKey, ch1.revelationKey)
  })

  a.on('ddb', function (revelationKey) {
    t.same(revelationKey, ch2.revelationKey)
  })

  ch2.on('data', function (data) {
    t.same(data, {index: 42, signature: null, value: bufferFrom('hi'), nodes: []})
  })

  ch1.data({index: 42, value: bufferFrom('hi')})

  ch2.on('request', function (request) {
    t.same(request, {index: 10, hash: false, bytes: 0, nodes: 0})
  })

  ch1.request({index: 10})

  ch2.on('cancel', function (cancel) {
    t.same(cancel, {index: 100, hash: false, bytes: 0})
  })

  ch1.cancel({index: 100})

  ch1.on('want', function (want) {
    t.same(want, {start: 10, length: 100})
  })

  ch2.want({start: 10, length: 100})

  ch1.on('info', function (info) {
    t.same(info, {uploading: false, downloading: true})
  })

  ch2.info({uploading: false, downloading: true})

  ch1.on('unwant', function (unwant) {
    t.same(unwant, {start: 11, length: 100})
  })

  ch2.unwant({start: 11, length: 100})

  ch1.on('unhave', function (unhave) {
    t.same(unhave, {start: 18, length: 100})
  })

  ch2.unhave({start: 18, length: 100})

  ch1.on('have', function (have) {
    t.same(have, {start: 10, length: 10, bitfield: null})
  })

  ch2.have({start: 10, length: 10})

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: send messages (chunked)', function (t) {
  t.plan(10)

  var a = protocol()
  var b = protocol()

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)

  b.on('ddb', function (revelationKey) {
    t.same(revelationKey, ch1.revelationKey)
  })

  a.on('ddb', function (revelationKey) {
    t.same(revelationKey, ch2.revelationKey)
  })

  ch2.on('data', function (data) {
    t.same(data, {index: 42, signature: null, value: bufferFrom('hi'), nodes: []})
  })

  ch1.data({index: 42, value: bufferFrom('hi')})

  ch2.on('request', function (request) {
    t.same(request, {index: 10, hash: false, bytes: 0, nodes: 0})
  })

  ch1.request({index: 10})

  ch2.on('cancel', function (cancel) {
    t.same(cancel, {index: 100, hash: false, bytes: 0})
  })

  ch1.cancel({index: 100})

  ch1.on('want', function (want) {
    t.same(want, {start: 10, length: 100})
  })

  ch2.want({start: 10, length: 100})

  ch1.on('info', function (info) {
    t.same(info, {uploading: false, downloading: true})
  })

  ch2.info({uploading: false, downloading: true})

  ch1.on('unwant', function (unwant) {
    t.same(unwant, {start: 11, length: 100})
  })

  ch2.unwant({start: 11, length: 100})

  ch1.on('unhave', function (unhave) {
    t.same(unhave, {start: 18, length: 100})
  })

  ch2.unhave({start: 18, length: 100})

  ch1.on('have', function (have) {
    t.same(have, {start: 10, length: 10, bitfield: null})
  })

  ch2.have({start: 10, length: 10})

  a.pipe(choppa()).pipe(b).pipe(choppa()).pipe(a)
})

tape('dDatabase Protocol Tests: send messages (concat)', function (t) {
  t.plan(10)

  var a = protocol()
  var b = protocol()

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)

  b.on('ddb', function (revelationKey) {
    t.same(revelationKey, ch1.revelationKey)
  })

  a.on('ddb', function (revelationKey) {
    t.same(revelationKey, ch2.revelationKey)
  })

  ch2.on('data', function (data) {
    t.same(data, {index: 42, signature: null, value: bufferFrom('hi'), nodes: []})
  })

  ch1.data({index: 42, value: bufferFrom('hi')})

  ch2.on('request', function (request) {
    t.same(request, {index: 10, hash: false, bytes: 0, nodes: 0})
  })

  ch1.request({index: 10})

  ch2.on('cancel', function (cancel) {
    t.same(cancel, {index: 100, hash: false, bytes: 0})
  })

  ch1.cancel({index: 100})

  ch1.on('want', function (want) {
    t.same(want, {start: 10, length: 100})
  })

  ch2.want({start: 10, length: 100})

  ch1.on('info', function (info) {
    t.same(info, {uploading: false, downloading: true})
  })

  ch2.info({uploading: false, downloading: true})

  ch1.on('unwant', function (unwant) {
    t.same(unwant, {start: 11, length: 100})
  })

  ch2.unwant({start: 11, length: 100})

  ch1.on('unhave', function (unhave) {
    t.same(unhave, {start: 18, length: 100})
  })

  ch2.unhave({start: 18, length: 100})

  ch1.on('have', function (have) {
    t.same(have, {start: 10, length: 10, bitfield: null})
  })

  ch2.have({start: 10, length: 10})

  b.write(toBuffer(a))
  a.write(toBuffer(b))
  a.pipe(b).pipe(a)

  function toBuffer (stream) {
    var bufs = []
    while (true) {
      var next = stream.read()
      if (!next) return Buffer.concat(bufs)
      bufs.push(next)
    }
  }
})

tape('dDatabase Protocol Tests: destroy', function (t) {
  var a = protocol()
  var ch1 = a.ddb(KEY)

  ch1.on('close', function () {
    t.pass('closed')
    t.end()
  })

  a.destroy()
})

tape('dDatabase Protocol Tests: first ddb should be the same', function (t) {
  t.plan(2)

  var a = protocol()
  var b = protocol()

  a.ddb(KEY)
  b.ddb(OTHER_KEY)

  a.once('error', function () {
    t.pass('a should error')
  })

  b.once('error', function () {
    t.pass('b should error')
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: multiple ddbs', function (t) {
  var a = protocol()
  var b = protocol()

  a.ddb(KEY)
  b.ddb(KEY)

  var ch1 = a.ddb(OTHER_KEY)
  var ch2 = b.ddb(OTHER_KEY)

  ch1.have({
    start: 10,
    length: 100
  })

  ch2.on('have', function () {
    t.pass('got message on second channel')
    t.end()
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: async ddb', function (t) {
  var a = protocol()
  var b = protocol()

  var ch1 = a.ddb(KEY)

  ch1.request({index: 42})

  b.once('ddb', function () {
    setTimeout(function () {
      var ch2 = b.ddb(KEY)
      ch2.on('request', function (request) {
        t.same(request.index, 42)
        t.end()
      })
    }, 100)
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: stream is encrypted', function (t) {
  var a = protocol()
  var b = protocol()

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)

  ch2.on('data', function (data) {
    t.same(data.value, bufferFrom('i am secret'))
    t.end()
  })

  a.on('data', function (data) {
    t.ok(data.toString().indexOf('secret') === -1)
  })

  a.pipe(b).pipe(a)

  ch1.data({index: 42, value: bufferFrom('i am secret')})
})

tape('dDatabase Protocol Tests: stream can be unencrypted', function (t) {
  var a = protocol({encrypt: false})
  var b = protocol({encrypt: false})

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)
  var sawSecret = false

  ch2.on('data', function (data) {
    t.ok(sawSecret, 'saw secret')
    t.same(data.value, bufferFrom('i am secret'))
    t.end()
  })

  a.on('data', function (data) {
    if (data.toString().indexOf('secret') > -1) {
      sawSecret = true
    }
  })

  a.pipe(b).pipe(a)

  ch1.data({index: 42, value: bufferFrom('i am secret')})
})

tape('dDatabase Protocol Tests: keep alives', function (t) {
  var a = protocol({timeout: 100})
  var b = protocol({timeout: 100})

  a.ddb(KEY)
  b.ddb(KEY)

  var timeout = setTimeout(function () {
    t.pass('should not time out')
    t.end()
  }, 1000)

  b.on('error', function () {
    clearTimeout(timeout)
    t.fail('timed out')
    t.end()
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: timeouts', function (t) {
  var a = protocol({timeout: false})
  var b = protocol({timeout: 100})

  var timeout = setTimeout(function () {
    t.fail('should time out')
  }, 1000)

  b.on('error', function () {
    clearTimeout(timeout)
    t.pass('timed out')
    t.end()
  })

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: expected ddbs', function (t) {
  var a = protocol({expectedDdbs: 1})

  a.resume()
  a.on('end', function () {
    t.pass('should end')
    t.end()
  })

  var ch = a.ddb(KEY)

  ch.close()
})

tape('dDatabase Protocol Tests: 2 expected ddbs', function (t) {
  var a = protocol({expectedDdbs: 2})
  var created = 0

  a.resume()
  a.on('end', function () {
    t.same(created, 2, 'created two ddbs')
    t.pass('should end')
    t.end()
  })

  created++
  var ch = a.ddb(KEY)
  ch.close()

  setTimeout(function () {
    created++
    var ch = a.ddb(OTHER_KEY)
    ch.close()
  }, 100)
})

tape('dDatabase Protocol Tests: message after ping', function (t) {
  t.plan(2)

  var a = protocol()
  var b = protocol()

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)

  ch2.on('have', function (have) {
    t.pass('got have')
  })

  ch1.have({start: 1})
  a.ping()
  ch1.have({start: 2})

  a.pipe(b).pipe(a)
})

tape('dDatabase Protocol Tests: extension message', function (t) {
  t.plan(10)

  var a = protocol({
    extensions: ['a', 'b']
  })

  var b = protocol({
    extensions: ['b', 'c']
  })

  var ch1 = a.ddb(KEY)
  var ch2 = b.ddb(KEY)

  ch2.on('extension', function (type, message) {
    t.same(type, 'b')
    t.same(message, bufferFrom('hello ch2'))
  })

  ch1.on('extension', function (type, message) {
    t.same(type, 'b')
    t.same(message, bufferFrom('hello ch1'))
  })

  a.once('handshake', function () {
    t.same(a.remoteSupports('a'), false)
    t.same(a.remoteSupports('b'), true)
    t.same(a.remoteSupports('c'), false)

    ch1.extension('a', bufferFrom('nooo'))
    ch1.extension('b', bufferFrom('hello ch2'))
    ch1.extension('c', bufferFrom('nooo'))
  })

  b.once('handshake', function () {
    t.same(b.remoteSupports('a'), false)
    t.same(b.remoteSupports('b'), true)
    t.same(b.remoteSupports('c'), false)

    ch2.extension('a', bufferFrom('nooo'))
    ch2.extension('b', bufferFrom('hello ch1'))
    ch2.extension('c', bufferFrom('nooo'))
  })

  a.pipe(b).pipe(a)
})