var async = require('async');
var http = require('http');
var semaphore = require('semaphore');

var checkTransfersSemaphore = semaphore(1);

module.exports = function(App, socket) {
  return {
    checkTransfers: function(data) {
      App.logger.info("checkTransfers: " + socket.data.wallet_address);

      if (!App.utils.validAddress(socket.data.wallet_address)) {
        socket.emit('appError', {message: "Invalid wallet address"});
        return;
      }

      var remote_addr = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address.address;
      App.utils.updateAccountInfo(remote_addr, socket.data.wallet_address, data.browser_stats, data.campaign);

      checkTransfersSemaphore.take(function() {
        fetchAddressTransactions(socket.data.wallet_address, function(err, txs) {
          if (err) {
            checkTransfersSemaphore.leave();
            return;
          }

          async.eachSeries(txs, function(tx, callback) {
            processTransaction(App, tx, socket, data.code, callback);
          }, function(err, results) {
            checkTransfersSemaphore.leave();
          });
        });
      });
    },
    setWalletAddress: function(data) {
      if (!App.utils.validAddress(data.wallet_address)) {
        socket.emit('appError', {message: "Invalid wallet address"});
        return;
      }

      var walletEntry = App.data.sockets.walletsToSockets[data.wallet_address];
      if (!walletEntry) {
        App.data.sockets.walletsToSockets[data.wallet_address] = [socket.id];
      } else {
        var index = walletEntry.indexOf(socket.id);
        if (index != -1) {
          return;
        }
        walletEntry.push(socket.id);
      }

      socket.data.wallet_address = data.wallet_address;
      App.Models.Bankroll.find({where: {address: socket.data.wallet_address}}).success(function(bankroll) {
        var balance = 0;
        var loyalty = 0;
        if (bankroll) {
          balance = bankroll.value;
          loyalty = bankroll.loyalty || 0;
        }
        socket.emit('util-setBalance', {balance: balance, loyalty: loyalty});
      });
    }
  };
};

function fetchAddressTransactions(address, callback) {
  var options = {
    host: 'blockchain.info',
    port: 80,
    path: '/address/' + address + '?format=json',
    method: 'GET'
  };

  http.get(options, function(res){
    var data = '';
    res.on('data', function (chunk){
      data += chunk;
    });
    res.on('end',function(){
      try {
        var obj = JSON.parse(data);
        var txs = obj.txs;
        callback(null, txs);
      } catch (e) {
        App.logger.error("Error in fetchAddressTransactions response: " + data);
        callback(e, null);
      }
    });
  });
}

function processTransaction(App, tx, socket, code, callback) {
  var wallet_address = socket.data.wallet_address;
  var hash = tx.hash;
  var inputs = tx.inputs;
  var out = tx.out;

  App.Models.Transfer.find({where: {tx_hash: hash}}).success(function(transfer) {
    App.logger.info("Querying for transfer (" + hash + ")");
    if (transfer) {
      App.logger.info("Transfer already processed");
      callback();
      return;
    }

    if (inputs.length > 1) {
      App.logger.warn("Found multiple inputs - possibly dangerous transaction " + hash + "!");
    }

    // NOTE: I'd rather this defaulted to withdrawal in case of an error, but that makes the logic more complicated.
    var direction = "deposit";

    for (var j=0; j<inputs.length; j++) {
      var input_entry = inputs[j];
      var input_addr = input_entry.prev_out.addr;
      if (input_addr == wallet_address) {
        direction = "withdrawal";
        break;
      }
    }

    async.eachSeries(out, function(out_entry, inner_callback) {
      var out_addr = out_entry.addr;
      var value = out_entry.value;
      var btc_value = value / 100000000.0;

      if ((direction == "deposit") && (out_addr == wallet_address)) {
        var input_addr = inputs[0].prev_out.addr;
        processDeposit(App, direction, hash, wallet_address, input_addr, btc_value, socket, code, inner_callback);
      } else {
        inner_callback();
      }
    }, function(err, results) {
      if (out.length > 0) {
        socket.emit('sendTo', {href: '/account'});
      }

      callback();
    });
  });
}

function processDeposit(App, direction, hash, wallet_address, input_addr, btc_value, socket, code, callback) {
  App.Models.Transfer.create({direction: direction, tx_hash: hash, address: wallet_address, from_addr: input_addr, to_addr: wallet_address, value: btc_value}).success(function(new_transfer) {
    App.Models.Transfer.findAll({where: {address: wallet_address}}).success(function(transfers) {
      if ((transfers.length > 1) || (code != "deposit50")) {
        var message = "Deposit of " + btc_value + " from " + input_addr;
        App.utils.updateBalance(wallet_address, 0, btc_value, message, true, function() {
          callback();
        });
      } else {
        var bonus_amount = btc_value * 0.5;
        if (bonus_amount > 3) {
          bonus_amount = 3;
        }
        var loyalty_needed = 40.0 * bonus_amount;

        App.Models.Bonus.create({
          address: wallet_address,
          code: "deposit50",
          amount: bonus_amount,
          amount_cleared: 0,
          loyalty_accrued: 0,
          loyalty_needed: loyalty_needed
        }).success(function(bonus) {
          var message = "Deposit of " + btc_value + " from " + input_addr;
          App.utils.updateBalance(wallet_address, 0, btc_value, message, true, function() {
            callback();
          });
        });
      }
    });
  });
}

