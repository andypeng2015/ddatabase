var path = require('path')
var dweb-netspeed = require('@dwcore/netspeed')
var ddatabase = require('../../')

module.exports = function (dir, proof) {
  var speed = dweb-netspeed()
  var ddb = ddatabase(path.join(__dirname, '../cores', dir))

  ddb.ready(function () {
    for (var i = 0; i < 16; i++) read()

    function read (err, data) {
      if (speed() > 10000000) return setTimeout(read, 250)
      if (err) throw err
      if (data) speed(data.length)

      var next = Math.floor(Math.random() * ddb.length)
      ddb.get(next, read)
      if (proof) ddb.proof(next, noop)
    }
  })

  process.title = 'ddatabase-read-10mb'
  console.log('Reading data at ~10mb/s. Pid is %d', process.pid)
}

function noop () {}

