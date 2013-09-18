module.exports = function(App) {
  return {
    root: function(req, res) {
      return res.render('index');
    },
    test: require('./routes/test')(App)
  }
}

