var create = require('./helpers/create')
var tape = require('tape')

tape('dDatabase Core Tests: cancel', function (t) {
  t.plan(2)

  var ddb = create()

  ddb.get(0, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.get(0, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.cancel(0)
})

tape('dDatabase Core Tests: cancel range', function (t) {
  t.plan(2)

  var ddb = create()

  ddb.get(0, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.get(1, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.get(2, function () {
    t.fail('should not error')
  })

  ddb.cancel(0, 2)
})

tape('dDatabase Core Tests: get after cancel', function (t) {
  t.plan(1)

  var ddb = create()

  ddb.get(0, function (err) {
    t.ok(err, 'expected error')
    ddb.get(0, function () {
      t.fail('should not error')
    })
  })

  ddb.cancel(0)
})

tape('dDatabase Core Tests: cancel download', function (t) {
  var ddb = create()

  ddb.download({start: 0, end: 10}, function (err) {
    t.ok(err, 'expected error')
    t.end()
  })

  ddb.cancel(0, 10)
})

tape('dDatabase Core Tests: cancel download and get', function (t) {
  t.plan(3)

  var ddb = create()

  ddb.download({start: 1, end: 9}, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.get(5, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.get(7, function (err) {
    t.ok(err, 'expected error')
  })

  ddb.cancel(0, 10)
})

tape('dDatabase Core Tests: cancel seek', function (t) {
  var ddb = create()

  ddb.seek(10, {start: 0, end: 10}, function (err) {
    t.ok(err, 'expected error')
    t.end()
  })

  ddb.cancel(0, 10)
})
