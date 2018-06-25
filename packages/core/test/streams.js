var tape = require('tape')
var collect = require('@dwcore/dwsc')
var create = require('./helpers/create')
var bufferFrom = require('buffer-from')

tape('dDatabase Core Tests: createReadStream to createWriteStream', function (t) {
  var ddb1 = create()
  var ddb2 = create()

  ddb1.append(['hello', 'world'], function () {
    var r = ddb1.createReadStream()
    var w = ddb2.createWriteStream()

    r.pipe(w).on('finish', function () {
      collect(ddb2.createReadStream(), function (err, data) {
        t.error(err, 'no error')
        t.same(data, [bufferFrom('hello'), bufferFrom('world')])
        t.end()
      })
    })
  })
})

tape('dDatabase Core Tests: createReadStream with start, end', function (t) {
  var ddb = create({valueEncoding: 'utf-8'})

  ddb.append(['hello', 'multiple', 'worlds'], function () {
    collect(ddb.createReadStream({start: 1, end: 2}), function (err, data) {
      t.error(err, 'no error')
      t.same(data, ['multiple'])
      t.end()
    })
  })
})

tape('dDatabase Core Tests: createReadStream with start, no end', function (t) {
  var ddb = create({valueEncoding: 'utf-8'})

  ddb.append(['hello', 'multiple', 'worlds'], function () {
    collect(ddb.createReadStream({start: 1}), function (err, data) {
      t.error(err, 'no error')
      t.same(data, ['multiple', 'worlds'])
      t.end()
    })
  })
})

tape('dDatabase Core Tests: createReadStream with no start, end', function (t) {
  var ddb = create({valueEncoding: 'utf-8'})

  ddb.append(['hello', 'multiple', 'worlds'], function () {
    collect(ddb.createReadStream({end: 2}), function (err, data) {
      t.error(err, 'no error')
      t.same(data, ['hello', 'multiple'])
      t.end()
    })
  })
})

tape('dDatabase Core Tests: createReadStream with live: true', function (t) {
  var ddb = create({valueEncoding: 'utf-8'})
  var expected = ['a', 'b', 'c', 'd', 'e']

  t.plan(expected.length)

  var rs = ddb.createReadStream({live: true})

  rs.on('data', function (data) {
    t.same(data, expected.shift())
  })

  rs.on('end', function () {
    t.fail('should never end')
  })

  ddb.append('a', function () {
    ddb.append('b', function () {
      ddb.append(['c', 'd', 'e'])
    })
  })
})

tape('dDatabase Core Tests: createReadStream with live: true after append', function (t) {
  var ddb = create({valueEncoding: 'utf-8'})
  var expected = ['a', 'b', 'c', 'd', 'e']

  t.plan(expected.length)

  ddb.append(['a', 'b'], function () {
    var rs = ddb.createReadStream({live: true})

    rs.on('data', function (data) {
      t.same(data, expected.shift())
    })

    rs.on('end', function () {
      t.fail('should never end')
    })

    ddb.append(['c', 'd', 'e'])
  })
})

tape('dDatabase Core Tests: createReadStream with live: true and tail: true', function (t) {
  var ddb = create({valueEncoding: 'utf-8'})
  var expected = ['c', 'd', 'e']

  t.plan(expected.length)

  ddb.append(['a', 'b'], function () {
    var rs = ddb.createReadStream({live: true, tail: true})

    rs.on('data', function (data) {
      t.same(data, expected.shift())
    })

    rs.on('end', function () {
      t.fail('should never end')
    })

    ddb.append(['c', 'd', 'e'])
  })
})
