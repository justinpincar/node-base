var ejs = require('ejs');
var express = require('express');
var path = require('path');
var passport = require('passport');
var sm = require('sitemap');
var LocalStrategy = require('passport-local').Strategy;
var MongoStore = require('connect-mongo')(express);

var Sequelize = require('sequelize-postgres').sequelize;
var postgres  = require('sequelize-postgres').postgres;

var winston = require('winston');
var logger = new (winston.Logger)({
  transports: [ new winston.transports.Console({
    colorize: true
  }),
  new (winston.transports.File)({
    filename: 'logs/output.log',
    json: false,
    colorize: false
  })]
});

if(!String.prototype.chomp) {
  String.prototype.chomp = function() {
    return this.replace(/(\n|\r)+$/, '');
  }
};

var loggerStream = {
  write: function(message, encoding){
    logger.info(message.chomp());
  }
};

var sequelize = new Sequelize('irally', 'irally', 'w1nn1ngtr3k', {
  host: '127.0.0.1',
  port: '5432',
  dialect: 'postgres',
  omitNull: true,
  define: {
    underscored: false,
    syncOnAssociation: true,
    charset: 'utf8',
    collate: 'utf8_general_ci',
    timestamps: true
  }
});

var localStrategyOptions = { usernameField: 'email', passwordField: 'password' };
passport.use(new LocalStrategy(localStrategyOptions, function(email, password, done) {
  User.find({where: {email: email}}).success(function(user) {
    if (user && user.verifyPassword(password)) {
      return done(null, user);
    } else {
      return done(null, false);
    }
  });
}));
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.find(id).success(function(user) {
    return done(null, user);
  });
});

var App = {};
App.data = {};
App.data.sockets = {};
App.logger = logger;
App.sequelize = sequelize;
App.Models = {};
App.Models.User = User = require('./models/user').User(sequelize);

// TODO: Change sendgrid credentials
var email   = require("emailjs/email");
App.email_server = email.server.connect({
  user:    "tigerlily",
  password:"p4r4tr00p1ng",
  host:    "smtp.sendgrid.net"
});

var setSessionMiddleware = function(req, res, next) {
  if (!req.session) {
    req.session = {};
  }
  res.locals.session = req.session;
  res.locals.user = req.user;
  if (!req.session.messages) {
    req.session.messages = [];
  }
  req.flash = function(type, message) {
    req.session.messages.push({type: type, text: message})
  }
  next();
};

var app = express();
App.app = app;
var sockets = require("./sockets")(App);

app.configure(function() {
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  if (process.env.NODE_ENV === "production") {
    express.logger.token('x-forwarded-for', function(req, res) {
      return req.header('x-forwarded-for');
    });
    app.use(express.logger({
      format: ':remote-addr - :x-forwarded-for - [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
      stream: loggerStream
    }));
  } else {
    app.use(express.logger({
      format: 'dev',
      stream: loggerStream
    }));
  }

  app.use(express.favicon(__dirname + '/public/favicon.ico'));
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({
    cookie: {
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000
    },
    secret: "4achEgupafumbgefreh84u5r7tru5eya",
    store: new MongoStore({
      db: "irally",
      auto_reconnect: true
    })
  }));
  if (process.env.NODE_ENV !== "production") {
    app.use(require('stylus').middleware(__dirname + '/public'));
  }
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(setSessionMiddleware);
  app.use(app.router);
  app.use(function(err, req, res, next) {
    var xForwardedFor = req.header('x-forwarded-for');

    var submitDate = new Date();

    var emailText = "An error occurred:\n\n";
    emailText += err.toString() + "\n";
    emailText += err.message + "\n";

    emailText += "\n-------------------------------\n";
    emailText += "Request:\n";
    emailText += "-------------------------------\n\n";

    var port = app.get('port');
    var fullUrl = req.protocol + '://' + req.host  + (port == 80 || port == 443 ? '' : ':' + port) + req.url;

    emailText += "* URL: " + fullUrl + "\n";
    emailText += "* IP address: " + req.connection.remoteAddress + "\n";
    emailText += "* X-Forwarded-For: " + xForwardedFor + "\n";

    emailText += "* Query: " + JSON.stringify(req.query) + "\n";
    emailText += "* Body: " + JSON.stringify(req.body) + "\n";
    emailText += "* nodejs root: " + __dirname + "\n";
    emailText += "* Timestamp: " + submitDate.toString() + "\n";

    emailText += "\n-------------------------------\n";
    emailText += "Session:\n";
    emailText += "-------------------------------\n\n";

    emailText += "* session id: \"" + req.sessionID + "\"\n";
    emailText += "* data: " + JSON.stringify(req.session) + "\n";

    emailText += "\n-------------------------------\n";
    emailText += "Headers:\n";
    emailText += "-------------------------------\n\n";

    for (var header in req.headers) {
      emailText += "* " + header + ": " + req.headers[header] + "\n";
    }

    emailText += "\n-------------------------------\n";
    emailText += "Stack:\n";
    emailText += "-------------------------------\n\n";

    emailText += err.stack + "\n";

    App.logger.error("ERROR", {error: err, message: err.message, description: err.description, stack: err.stack, details: emailText});

    if (!xForwardedFor) {
      return res.render('error/error', {error: err});
    }

    App.email_server.send({
      text:     emailText,
      from:    "iRally Notifications <notifications+irally@tigerli.ly>",
      to:      "Justin Pincar <justin+irally@gmail.com>",
      subject: "[Error] " + err.toString()
    }, function(err, message) {
      if (err) {
        App.logger.error("Error sending email", err);
      }
    });

    res.status(500);
    return res.render('error/500');
  });
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

var routes = require('./routes')(App);

app.get('/', routes.root);
app.get('/healthcheck', routes.test.healthcheck);
app.get('/test/async-error', routes.test.asyncError);
app.get('/test/console', routes.test.console);
app.all('/test/error', routes.test.error);
app.all('/test/404', routes.test.error404);
app.all('/test/500', routes.test.error500);

app.get('*', function(req, res){
  res.status(404);
  return res.render('error/404');
});

App.data.port = app.get('port');

sockets.httpServer.listen(App.data.port);
logger.info("Server listening for HTTP on port " + App.data.port + " in " + app.get('env') + " mode");

