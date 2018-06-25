var ddatabase = require('../..')
var dwRem = require('@dwcore/rem')

module.exports = function create (key, opts) {
  return ddatabase(dwRem, key, opts)
}
