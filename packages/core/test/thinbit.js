var tape = require('tape')
var thinBit = require('../lib/thinbit')

tape('dDatabase Core Tests: set and get', function (t) {
  var b = thinBit()

  t.same(b.get(0), false)
  t.same(b.set(0, true), true)
  t.same(b.set(0, true), false)
  t.same(b.get(0), true)

  t.same(b.get(1424244), false)
  t.same(b.set(1424244, true), true)
  t.same(b.set(1424244, true), false)
  t.same(b.get(1424244), true)

  t.end()
})

tape('dDatabase Core Tests: set and get (tree)', function (t) {
  var b = thinBit()
  var tree = b.tree

  t.same(tree.get(0), false)
  t.same(tree.set(0, true), true)
  t.same(tree.set(0, true), false)
  t.same(tree.get(0), true)

  t.same(tree.get(1424244), false)
  t.same(tree.set(1424244, true), true)
  t.same(tree.set(1424244, true), false)
  t.same(tree.get(1424244), true)

  t.same(b.get(0), false)
  t.same(b.get(1424244), false)

  t.end()
})

tape('dDatabase Core Tests: set and index', function (t) {
  var b = thinBit()
  var ite = b.iterator(0, 100000000)
  var i = 0

  t.same(ite.next(), 0)

  b.set(0, true)
  t.same(ite.seek(0).next(), 1)

  b.set(479, true)
  t.same(ite.seek(478).next(), 478)
  t.same(ite.next(), 480)

  b.set(1, true)
  t.same(ite.seek(0).next(), 2)

  b.set(2, true)
  t.same(ite.seek(0).next(), 3)

  b.set(3, true)
  t.same(ite.seek(0).next(), 4)

  for (i = 0; i < b.length; i++) {
    b.set(i, true)
  }

  t.same(ite.seek(0).next(), b.length)

  for (i = 0; i < b.length; i++) {
    b.set(i, false)
  }

  t.same(ite.seek(0).next(), 0)
  t.end()
})

tape('dDatabase Core Tests: set and index (random)', function (t) {
  var b = thinBit()

  for (var i = 0; i < 100; i++) {
    t.ok(check(), 'index validates')
    set(Math.round(Math.random() * 2000), Math.round(Math.random() * 8))
  }

  t.ok(check(), 'index validates')
  t.end()

  function check () {
    var all = []
    var ite = b.iterator()
    var i = 0

    for (i = 0; i < b.length; i++) {
      all[i] = true
    }

    i = ite.next()

    while (i > -1) {
      all[i] = false
      i = ite.next()
    }

    for (i = 0; i < b.length; i++) {
      if (b.get(i) !== all[i]) {
        return false
      }
    }

    return true
  }

  function set (i, n) {
    while (n--) {
      b.set(i++, true)
    }
  }
})

tape('dDatabase Core Tests: get total positive bits', function (t) {
  var b = thinBit()

  t.same(b.set(1, true), true)
  t.same(b.set(2, true), true)
  t.same(b.set(4, true), true)
  t.same(b.set(5, true), true)
  t.same(b.set(39, true), true)

  t.same(b.total(0, 4), 2)
  t.same(b.total(3, 4), 0)
  t.same(b.total(3, 5), 1)
  t.same(b.total(3, 40), 3)
  t.same(b.total(), 5)
  t.same(b.total(7), 1)

  t.end()
})
