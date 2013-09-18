var utils = require('../lib/utils');

var Sequelize = require('sequelize');
exports.User = function(sequelize) {
  var User = sequelize.define('User', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    email: {type: Sequelize.STRING, unique: true},
    password: Sequelize.STRING,
    salt: Sequelize.STRING,
    is_admin: Sequelize.BOOLEAN
  }, {
    instanceMethods: {
      verifyPassword: function(attemptedPassword) {
        var hashedPassword = utils.hexSha256(this.salt + attemptedPassword);
        if (hashedPassword == this.password) {
          return true;
        } else {
          return false;
        }
      }
    }
  });
  User.sync();
  return User;
};

