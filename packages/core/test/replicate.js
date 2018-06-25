var create = require('./helpers/create')
var replicate = require('./helpers/replicate')
var tape = require('tape')
var bufferFrom = require('buffer-from')

tape('dDatabase Core Tests: replicate', function (t) {
  t.plan(10)

  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    fork.get(0, same(t, 'a'))
    fork.get(1, same(t, 'b'))
    fork.get(2, same(t, 'c'))
    fork.get(3, same(t, 'd'))
    fork.get(4, same(t, 'e'))

    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: replicate twice', function (t) {
  t.plan(20)

  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    fork.get(0, same(t, 'a'))
    fork.get(1, same(t, 'b'))
    fork.get(2, same(t, 'c'))
    fork.get(3, same(t, 'd'))
    fork.get(4, same(t, 'e'))

    replicate(ddb, fork).on('end', function () {
      ddb.append(['f', 'g', 'h', 'i', 'j'], function () {
        replicate(ddb, fork).on('end', function () {
          fork.get(5, same(t, 'f'))
          fork.get(6, same(t, 'g'))
          fork.get(7, same(t, 'h'))
          fork.get(8, same(t, 'i'))
          fork.get(9, same(t, 'j'))
        })
      })
    })
  })
})

tape('dDatabase Core Tests: replicate live', function (t) {
  t.plan(6)

  var ddb = create()

  ddb.ready(function () {
    var fork = create(ddb.key)

    replicate(ddb, fork, {live: true})

    ddb.append('a')
    ddb.append('b')
    ddb.append('c')

    fork.get(0, same(t, 'a'))
    fork.get(1, same(t, 'b'))
    fork.get(2, same(t, 'c'))
  })
})

tape('dDatabase Core Tests: download while get', function (t) {
  t.plan(10)

  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    // add 5 so this never finished
    fork.download({start: 0, end: 6}, function () {
      t.fail('should never happen')
    })

    fork.get(0, same(t, 'a'))
    fork.get(1, same(t, 'b'))
    fork.get(2, same(t, 'c'))
    fork.get(3, same(t, 'd'))
    fork.get(4, same(t, 'e'))

    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: non live', function (t) {
  t.plan(10)

  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    replicate(fork, ddb).on('end', function () {
      fork.get(0, same(t, 'a'))
      fork.get(1, same(t, 'b'))
      fork.get(2, same(t, 'c'))
      fork.get(3, same(t, 'd'))
      fork.get(4, same(t, 'e'))
    })
  })
})

tape('dDatabase Core Tests: non live, two way', function (t) {
  t.plan(20)

  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    replicate(fork, ddb).on('end', function () {
      fork.get(0, same(t, 'a'))
      fork.get(1, same(t, 'b'))
      fork.get(2, same(t, 'c'))
      fork.get(3, same(t, 'd'))
      fork.get(4, same(t, 'e'))

      var fork2 = create(ddb.key)

      replicate(fork, fork2).on('end', function () {
        fork2.get(0, same(t, 'a'))
        fork2.get(1, same(t, 'b'))
        fork2.get(2, same(t, 'c'))
        fork2.get(3, same(t, 'd'))
        fork2.get(4, same(t, 'e'))
      })
    })
  })
})

tape('dDatabase Core Tests: non-live empty', function (t) {
  var ddb = create()

  ddb.ready(function () {
    var fork = create(ddb.key)

    replicate(ddb, fork).on('end', function () {
      t.same(fork.length, 0)
      t.end()
    })
  })
})

tape('dDatabase Core Tests: basic 3-way replication', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork1 = create(ddb.key)
    var fork2 = create(ddb.key)

    replicate(ddb, fork1, {live: true})
    replicate(fork1, fork2, {live: true})

    fork1.get(0, function (err, data) {
      t.error(err, 'no error')
      t.same(data, bufferFrom('a'))

      fork2.get(0, function (err) {
        t.error(err, 'no error')
        t.same(data, bufferFrom('a'))
        t.end()
      })
    })
  })
})

tape('dDatabase Core Tests: extra data + factor of two', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], function () {
    var fork1 = create(ddb.key)

    replicate(ddb, fork1, {live: true})

    fork1.get(1, function (err, data) {
      t.error(err, 'no error')
      t.same(data, bufferFrom('b'))
      t.end()
    })
  })
})

tape('dDatabase Core Tests: 3-way another index', function (t) {
  var ddb = create()

  ddb.append(['a', 'b'], function () {
    var fork1 = create(ddb.key)
    var fork2 = create(ddb.key)

    replicate(ddb, fork1, {live: true})
    replicate(fork1, fork2, {live: true})

    fork1.get(1, function (err, data) {
      t.error(err, 'no error')
      t.same(data, bufferFrom('b'))

      fork2.get(1, function (err) {
        t.error(err, 'no error')
        t.same(data, bufferFrom('b'))
        t.end()
      })
    })
  })
})

tape('dDatabase Core Tests: 3-way another index + extra data', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork1 = create(ddb.key)
    var fork2 = create(ddb.key)

    replicate(ddb, fork1, {live: true})
    replicate(fork1, fork2, {live: true})

    fork1.get(1, function (err, data) {
      t.error(err, 'no error')
      t.same(data, bufferFrom('b'))

      fork2.get(1, function (err) {
        t.error(err, 'no error')
        t.same(data, bufferFrom('b'))
        t.end()
      })
    })
  })
})

tape('dDatabase Core Tests: 3-way another index + extra data + factor of two', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], function () {
    var fork1 = create(ddb.key)
    var fork2 = create(ddb.key)

    replicate(ddb, fork1, {live: true})
    replicate(fork1, fork2, {live: true})

    fork1.get(1, function (err, data) {
      t.error(err, 'no error')
      t.same(data, bufferFrom('b'))

      fork2.get(1, function (err) {
        t.error(err, 'no error')
        t.same(data, bufferFrom('b'))
        t.end()
      })
    })
  })
})

tape('dDatabase Core Tests: 3-way another index + extra data + factor of two + static', function (t) {
  var ddb = create({live: false})

  ddb.append(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], function () {
    ddb.finalize(function () {
      var fork1 = create(ddb.key)
      var fork2 = create(ddb.key)

      replicate(ddb, fork1, {live: true})
      replicate(fork1, fork2, {live: true})

      fork1.get(1, function (err, data) {
        t.error(err, 'no error')
        t.same(data, bufferFrom('b'))

        fork2.get(1, function (err) {
          t.error(err, 'no error')
          t.same(data, bufferFrom('b'))
          t.end()
        })
      })
    })
  })
})

tape('dDatabase Core Tests: seek while replicating', function (t) {
  t.plan(6)

  var ddb = create()

  ddb.ready(function () {
    var fork = create(ddb.key)

    fork.seek(9, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 2)
      t.same(offset, 1)
    })

    fork.seek(16, function (err, index, offset) {
      t.error(err, 'no error')
      t.same(index, 4)
      t.same(offset, 2)
    })

    ddb.append(['hello'], function () {
      ddb.append(['how', 'are', 'you', 'doing', '?'], function () {
        replicate(ddb, fork, {live: true})
      })
    })
  })
})

tape('dDatabase Core Tests: non spare live replication', function (t) {
  var ddb = create()

  ddb.on('ready', function () {
    ddb.append(['a', 'b', 'c'], function () {
      var fork = create(ddb.key)

      fork.get(0, function () {
        fork.get(1, function () {
          fork.get(2, function () {
            fork.once('download', function () {
              t.pass('downloaded new block')
              t.end()
            })

            ddb.append('a')
          })
        })
      })

      replicate(ddb, fork, {live: true})
    })
  })
})

tape('dDatabase Core Tests: can wait for updates', function (t) {
  var ddb = create()

  ddb.on('ready', function () {
    var fork = create(ddb.key)

    fork.update(function (err) {
      t.error(err, 'no error')
      t.same(fork.length, 3)
      t.end()
    })

    replicate(ddb, fork, {live: true}).on('handshake', function () {
      ddb.append(['a', 'b', 'c'])
    })
  })
})

tape('dDatabase Core Tests: replicate while clearing', function (t) {
  var ddb = create()

  ddb.on('ready', function () {
    var fork = create(ddb.key, {thin: true})

    fork.get(1, function (err) {
      t.error(err, 'no error')
      ddb.clear(2, function (err) {
        t.error(err, 'no error')
        fork.get(2, {timeout: 50}, function (err) {
          t.ok(err, 'had timeout error')
          t.end()
        })
      })
    })

    replicate(ddb, fork, {live: true}).on('handshake', function () {
      ddb.append(['a', 'b', 'c'])
    })
  })
})

tape('dDatabase Core Tests: replicate while cancelling', function (t) {
  t.plan(2)

  var ddb = create()

  ddb.on('ready', function () {
    var fork = create(ddb.key, {thin: true})

    fork.on('download', function () {
      t.fail('should not download')
    })

    ddb.on('upload', function () {
      t.pass('should upload')
      fork.cancel(0)
    })

    fork.get(0, function (err) {
      t.ok(err, 'expected error')
    })

    ddb.append(['a', 'b', 'c'])

    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: allow push', function (t) {
  t.plan(3)

  var ddb = create()

  ddb.on('ready', function () {
    var fork = create(ddb.key, {thin: true, allowPush: true})

    fork.on('download', function () {
      t.pass('push allowed')
    })

    ddb.on('upload', function () {
      t.pass('should upload')
      fork.cancel(0)
    })

    fork.get(0, function (err) {
      t.ok(err, 'expected error')
    })

    ddb.append(['a', 'b', 'c'])

    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: shared stream, non live', function (t) {
  var a = create()
  var b = create()

  a.append(['a', 'b'], function () {
    b.append(['c', 'd'], function () {
      var a1 = create(a.key)
      var b1 = create(b.key)

      a1.ready(function () {
        var s = a.replicate({expectedDdbs: 2})
        b1.replicate({stream: s})

        var s1 = a1.replicate({expectedDdbs: 2})
        b.replicate({stream: s1})

        s.pipe(s1).pipe(s)

        s.on('end', function () {
          t.ok(a1.has(0))
          t.ok(a1.has(1))
          t.ok(b1.has(0))
          t.ok(b1.has(1))
          t.end()
        })
      })
    })
  })
})

tape('dDatabase Core Tests: get total downloaded chunks', function (t) {
  var ddb = create()
  ddb.append(['a', 'b', 'c', 'e'])
  ddb.on('ready', function () {
    var fork = create(ddb.key, {thin: true})
    fork.get(1, function (err) {
      t.error(err, 'no error')
      t.same(fork.downloaded(), 1)
      t.same(fork.downloaded(0), 1)
      t.same(fork.downloaded(2), 0)
      t.same(fork.downloaded(0, 1), 0)
      t.same(fork.downloaded(2, 4), 0)
      fork.get(3, function (err) {
        t.error(err, 'no error')
        t.same(fork.downloaded(), 2)
        t.same(fork.downloaded(0), 2)
        t.same(fork.downloaded(2), 1)
        t.same(fork.downloaded(0, 3), 1)
        t.same(fork.downloaded(2, 4), 1)
        t.end()
      })
    })
    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: ddb has a range of chuncks', function (t) {
  var ddb = create()
  ddb.append(['a', 'b', 'c', 'e'])
  ddb.on('ready', function () {
    var fork = create(ddb.key, {thin: true})
    fork.get(0, function (err) {
      t.error(err, 'no error')
      fork.get(1, function (err) {
        t.error(err, 'no error')
        fork.get(2, function (err) {
          t.error(err, 'no error')
          t.ok(fork.has(1))
          t.notOk(fork.has(3))
          t.ok(fork.has(0, fork.length - 1))
          t.notOk(fork.has(0, fork.length))
          t.ok(fork.has(1, 3))
          t.notOk(fork.has(3, 4))
          t.end()
        })
      })
    })
    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: ddb has a large range', function (t) {
  var ddb = create()
  ddb.append(['a', 'b', 'c', 'e', 'd', 'e', 'f', 'g'])
  ddb.append(['a', 'b', 'c', 'e', 'd', 'e', 'f', 'g'])
  ddb.append(['a', 'b', 'c', 'e', 'd', 'e', 'f', 'g'])
  ddb.on('ready', function () {
    var fork = create(ddb.key, {thin: true})
    var count = 20
    var gotten = 20
    function got () {
      gotten--
      if (gotten === 0) {
        t.same(fork.downloaded(), 20)
        t.notOk(fork.has(5, 24))
        t.notOk(fork.has(12, 24))
        t.notOk(fork.has(20, 24))
        t.ok(fork.has(0, 20))
        t.ok(fork.has(3, 20))
        t.ok(fork.has(8, 20))
        t.ok(fork.has(19, 20))
        t.ok(fork.has(0, 16))
        t.ok(fork.has(3, 16))
        t.ok(fork.has(8, 16))
        t.end()
      }
    }
    for (var i = 0; i < count; i++) {
      fork.get(i, got)
    }
    replicate(ddb, fork, {live: true})
  })
})

tape('dDatabase Core Tests: replicate no download', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    fork.get(0, function () {
      t.fail('Data was received')
    })

    var stream = ddb.replicate({live: true})
    stream.pipe(fork.replicate({live: true, download: false})).pipe(stream)

    setTimeout(function () {
      t.pass('No data was received')
      t.end()
    }, 300)
  })
})

tape('dDatabase Core Tests: thin mode, two downloads', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key, {thin: true})

    replicate(ddb, fork)
    fork.update(function () {
      fork.download({start: 0, end: 4}, function (err) {
        t.error(err, 'no error')
        // next tick so selection is cleared
        process.nextTick(function () {
          fork.download(4, function (err) {
            t.error(err, 'no error')
            t.end()
          })
        })
      })
    })
  })
})

tape('dDatabase Core Tests: peer-add and peer-remove are emitted', function (t) {
  t.plan(4)

  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var fork = create(ddb.key)

    ddb.on('peer-add', function (peer) {
      t.pass('peer-add1')
    })
    fork.on('peer-add', function (peer) {
      t.pass('peer-add2')
    })
    ddb.on('peer-remove', function (peer) {
      t.pass('peer-remove1')
    })
    fork.on('peer-remove', function (peer) {
      t.pass('peer-remove2')
    })

    replicate(fork, ddb)
  })
})

tape('dDatabase Core Tests: replicate with onwrite', function (t) {
  var ddb = create()

  ddb.append(['a', 'b', 'c', 'd', 'e'], function () {
    var expected = ['a', 'b', 'c', 'd', 'e']

    var fork = create(ddb.key, {
      onwrite: function (index, data, peer, cb) {
        t.ok(peer, 'has peer')
        t.same(expected[index], data.toString())
        expected[index] = null
        cb()
      }
    })

    fork.on('sync', function () {
      t.same(expected, [null, null, null, null, null])
      t.end()
    })

    replicate(ddb, fork, {live: true})
  })
})

function same (t, val) {
  return function (err, data) {
    t.error(err, 'no error')
    t.same(data.toString(), val)
  }
}
