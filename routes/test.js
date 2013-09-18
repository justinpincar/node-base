module.exports = function(App) {
  return {
    asyncError: function(req, res, next) {
      setTimeout(function() {
        return next(new Error("This is an async test error."));
      }, 100);
    },
    error: function(req, res, next) {
      return next(new Error("This is a test error."));
    },
    error404: function(req, res, next) {
      return res.render('error/404');
    },
    error500: function(req, res, next) {
      return res.render('error/500');
    },
    healthcheck: function(req, res, next) {
      return res.send("OK");
    },
    console: function(req, res, next) {
      return res.render('test/console');
    }
  }
}


