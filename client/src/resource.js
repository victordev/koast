/* global angular, _ */

angular.module('koast-resource', ['koast-user'])

// A "private" service providing a constructor for resources.
.factory('_KoastResource', ['$q', '$http', '$log',
  function ($q, $http, $log) {
    'use strict';
    // A client side representation of a saveable RESTful resource instance.
    function Resource(endpoint, result) {
      var resource = this;
      _.keys(result.data).forEach(function (key) {
        resource[key] = result.data[key];
      });

      Object.defineProperty(this, 'can', {
        get: function () {
          return result.meta.can;
        }
      });

      Object.defineProperty(this, '_endpoint', {
        get: function () {
          return endpoint;
        }
      });

      return this;
    }

    // A method for saving the resource
    Resource.prototype.save = function () {
      $log.debug('The endpoint: ', this._endpoint);
      var url = this._endpoint.makeGetUrl(this);
      $log.debug('url:', url);
      $log.debug('body:', this);
      return $http.put(url, this);
    };

    return Resource;
  }
])

// A "private" service providing a constructor for endpoints.
.factory('_KoastEndpoint', [

  function () {
    'use strict';

    // The constructor.
    function Endpoint(prefix, handle, template) {
      var endpoint = this;
      endpoint.prefix = prefix;
      endpoint.handle = handle;
      endpoint.template = template;
    }

    // A method to generate the post url - that is, a URL that does not
    // identify a specific resource.
    Endpoint.prototype.makePostUrl = function () {
      return this.prefix + this.handle;
    };

    // An auxiliary function to generate the part of the URL that identifies
    // the specific resource.
    function makeResourceIdentifier(template, params) {
      if (!params) {
        return '';
      } else {
        return template.replace(/:([a-zA-Z]*)/g, function (_, paramName) {
          var param = params[paramName];
          if (!param) {
            throw new Error('Missing parameter: ' + paramName);
          }
          return params[paramName];
        });
      }
    }

    // A method to generate a URL for get, put or delete - that is, a URL that
    // identies a particular resource. This URL would not include the query
    // string, since $http will attach that for us.
    Endpoint.prototype.makeGetUrl = function (params) {
      return this.makePostUrl() + '/' + makeResourceIdentifier(this.template,
        params);
    };

    // The service instance is actually going to be a constructor function.
    return Endpoint;
  }
])

// A service that offers high level methods for interacting with resources.
.factory('_koastResourceGetter', ['_koastUser', '_KoastResource',
  '_KoastEndpoint', '$http', '$q', '$log',
  function (user, KoastResource, KoastEndpoint, $http, $q, $log) {
    'use strict';
    var service = {};
    var prefix;
    var endpoints = {};

    // An auxiliary function that actually gets the resource. This should work
    // for either a request to get a single item or a query for multiple.
    function get(endpointHandle, params, query, options) {
      var deferred = $q.defer();
      var endpoint = endpoints[endpointHandle];
      var headers = {};

      options = options || {};

      if (!endpoint) {
        throw new Error('Unknown endpoint: ' + endpointHandle);
      }

      console.log('Token:', user.meta.authToken);

      if (user.isSignedIn) {
        headers['koast-auth-token'] = user.meta.authToken;
        headers['koast-auth-token-timestamp'] = user.meta.timestamp;
        headers['koast-user'] = angular.toJson(user.data);
      }
      console.log('Headers:', headers);
      $http.get(endpoint.makeGetUrl(params), {
        params: query,
        headers: headers
      })
        .success(function (result) {
          var resources = [];
          result.forEach(function (result) {
            var resource = new KoastResource(endpoint, result);
            resources.push(resource);
          });

          if (options.singular) {
            if (resources.length === 0) {
              return null;
            } else if (resources.length > 1) {
              $log.warn('Expected a singular resource, got ' + resources.length);
            }
            deferred.resolve(resources[0]);
          } else {
            deferred.resolve(resources);
          }
        })
        .error(function (error) {
          deferred.reject(error);
        });
      return deferred.promise;
    }

    // Sets the prefix for API URLs. For now we can only set one.
    service.setApiUriPrefix = function (newPrefix) {
      prefix = newPrefix;
    };

    /**
     * Gets a single resource. This should be used when we want to retrieve
     * a specific resource.
     *
     * @param  {String} endpointHandle    A string identifying the endpoint.
     * @param  {Object} params            An object identifying a specific
     *                                    resource.
     * @return {promise}                  A $q promise that resolves to
     *                                    specific resource (or null if not
     *                                    found).
     */
    service.getResource = function (endpointHandle, params) {
      return get(endpointHandle, params, null, {
        singular: true
      });
    };

    /**
     * Queries for resource. This should be used when we want to get a list of
     * resources that satisfy some criteria.
     *
     * @param  {String} endpointHandle    A string identifying the endpoint.
     * @param  {Object} query             A query object.
     * @return {promise}                  A $q promise that resolves to a list
     *                                    of resources.
     */
    service.queryForResources = function (endpointHandle, query) {
      return get(endpointHandle, null, query);
    };

    service.addEndpoint = function (handle, template) {
      var endpoint = new KoastEndpoint(prefix, handle, template);
      if (endpoints[handle]) {
        throw new Error('An endpoint with this handle was already defined: ' +
          handle);
      }
      endpoints[handle] = endpoint;
    };

    return service;
  }
]);