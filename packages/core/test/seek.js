var create = require('./helpers/create')
var tape = require('tape')

tape('dDatabase Core Tests: seek to byte offset', function (t) {
  var ddb = create()

  ddb.append(['hello', 'how', 'are', 'you', 'doing', '?'])

  ddb.flush(function () {
    ddb.seek(9, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 2)
      t.same(offset, 1)
      t.end()
    })
  })
})

tape('dDatabase Core Tests: seek twice', function (t) {
  t.plan(6)

  var ddb = create()

  ddb.append(['hello', 'how', 'are', 'you', 'doing', '?'])

  ddb.flush(function () {
    ddb.seek(9, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 2)
      t.same(offset, 1)
    })

    ddb.seek(16, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 4)
      t.same(offset, 2)
    })
  })
})

tape('dDatabase Core Tests: seek many times', function (t) {
  t.plan(12)

  var ddb = create()

  ddb.append(['foo', 'b', 'ar', 'baz'], function () {
    ddb.seek(0, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 0)
      t.same(offset, 0)
    })

    ddb.seek(2, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 0)
      t.same(offset, 2)
    })

    ddb.seek(4, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 2)
      t.same(offset, 0)
    })

    ddb.seek(5, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 2)
      t.same(offset, 1)
    })
  })
})

tape('dDatabase Core Tests: seek waits', function (t) {
  t.plan(6)

  var ddb = create()

  ddb.seek(9, function (err, index, offset) {
    t.error(err, 'no error')
    t.same(index, 2)
    t.same(offset, 1)
  })

  ddb.seek(16, function (err, index, offset) {
    t.error(err, 'no error')
    t.same(index, 4)
    t.same(offset, 2)
  })

  ddb.append(['hello'], function () {
    ddb.append(['how', 'are', 'you', 'doing', '?'])
  })
})
