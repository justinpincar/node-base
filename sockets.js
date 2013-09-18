var http = require('http');
var fs = require('fs');

module.exports = function(App) {
  var httpServer = http.createServer(App.app);

  if (process.env.NODE_ENV === "production") {
    App.io = require('socket.io').listen(httpServer, { log: false });
  } else {
    App.io = require('socket.io').listen(httpServer);
  }
  App.data.sockets.walletsToSockets = {};

  App.io.sockets.on('connection', function (socket) {
    socket.data = {};

    var socketsAccount = require('./sockets/account')(App, socket);

    // Account
    socket.on('account-checkTransfers', socketsAccount.checkTransfers);
  });
  App.io.sockets.on('disconnect', function (socket) { });

  return {
    httpServer: httpServer
  };
}

