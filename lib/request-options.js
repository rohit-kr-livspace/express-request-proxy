var parseUrl = require('url').parse;
var formatUrl = require('url').format;
var _ = require('lodash');
var querystring = require('querystring');
var pathToRegexp = require('path-to-regexp');

var nonPassThroughHeaders = ['host', 'cookie'];
var nonPassThroughHeadersWhenCached = ['if-none-match', 'if-modified-since'];

// Returns an options object that can be fed to the request module.
module.exports = function(req, options, limits) {
  var requestOptions = _.pick(options, 'method', 'timeout', 'maxRedirects');

  // Ensure that passed in options for timeout and maxRedirects cannot exceed
  // the platform imposed limits (if defined).
  if (_.isObject(limits) === true) {
    if (_.isNumber(limits.timeout)) {
      if (_.isNumber(options.timeout) === false || options.timeout > limits.timeout)
        requestOptions.timeout = limits.timeout;
    }
    if (_.isNumber(limits.maxRedirects)) {
      if (_.isNumber(options.maxRedirects) === false || options.maxRedirects > limits.maxRedirects)
        requestOptions.maxRedirects = limits.maxRedirects;
    }
  }

  // Extend the incoming query with any additional parameters specified in the options
  if (_.isObject(options.query))
    _.extend(req.query, options.query);

  var parsedUrl = parseUrl(options.url);

  // Compile the path expression of the originUrl
  var compiledPath = pathToRegexp.compile(parsedUrl.path);

  // Substitute the actual values using both those from the incoming
  // params as well as those configured in the options. Values in the
  // options take precedence.
  requestOptions.url = formatUrl({
    protocol: parsedUrl.protocol,
    host: parsedUrl.host,
    pathname: compiledPath(_.extend({}, req.params, options.params))
  });

  requestOptions.qs = _.extend({}, querystring.parse(parsedUrl.query), req.query, options.query);
  requestOptions.headers = {};

  // Passthrough headers
  _.each(req.headers, function(value, key) {
    if (shouldPassthroughHeader(key))
      requestOptions.headers[key] = value;
  });

  // Forward the IP of the originating request. This is de-facto proxy behavior.
  if (req.ip)
    requestOptions.headers['X-Forwarded-For'] = req.ip;

  // Inject additional headers from the options
  if (_.isObject(options.headers))
    _.extend(requestOptions.headers, options.headers);

  // If there is a JSON body, substitute any placeholders
  if (_.isObject(req.body)) {
    if (_.isObject(options.body))
      _.extend(req.body, options.body);

    if (req.get('Content-Type') === 'application/json')
      requestOptions.json = JSON.stringify(req.body);
    else
      requestOptions.form = req.body;
  }

  // Override the user-agent
  if (options.userAgent)
    requestOptions.headers['user-agent'] = options.userAgent;

  return requestOptions;

  function shouldPassthroughHeader(header) {
    if (_.contains(nonPassThroughHeaders, header) === true)
      return false;
    if (options.cache && _.contains(nonPassThroughHeadersWhenCached, header) === true)
      return false;

    return true;
  }
};