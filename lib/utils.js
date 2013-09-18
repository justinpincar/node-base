var crypto = require('crypto');

exports.randomString = function randomString(Random, length) {
  chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var result = '';
  for (var i=length; i>0; --i) {
    result += chars[Math.round(Random() * (chars.length - 1))];
  }
  return result;
}

var sha256 = function (data) {
  return new Buffer(crypto.createHash('sha256').update(data).digest('binary'), 'binary');
};

exports.hexSha256 = function(data) {
  var buf = sha256(data);
  return buf.toString("hex", 0, buf.length);
};

