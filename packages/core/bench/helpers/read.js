var path = require('path')
var ddatabase = require('../../')

module.exports = function (dir, proof) {
  var ddb = ddatabase(path.join(__dirname, '../cores', dir))

  var then = Date.now()
  var size = 0
  var cnt = 0

  ddb.ready(function () {
    var missing = ddb.length
    var reading = 0

    for (var i = 0; i < 16; i++) read(null, null)

    function read (err, data) {
      if (err) throw err

      if (data) {
        reading--
        cnt++
        size += data.length
      }

      if (!missing) {
        if (!reading) {
          console.log(Math.floor(1000 * size / (Date.now() - then)) + ' bytes/s')
          console.log(Math.floor(1000 * cnt / (Date.now() - then)) + ' blocks/s')
        }
        return
      }

      missing--
      reading++

      var block = Math.floor(Math.random() * ddb.length)

      if (proof) ddb.proof(block, onproof)
      else onproof()

      function onproof () {
        ddb.get(block, read)
      }
    }
  })
}
