/* global Package, Npm */

Package.describe({
  name: 'mpowaga:graphql',
  version: '0.0.1',
  summary: '',
  git: '',
  documentation: 'README.md',
});

Package.onUse(function(api) {
  api.versionsFrom('1.8.1');
  api.use('ecmascript');
  api.use('tmeasday:check-npm-versions');
  api.mainModule('src/client.js', 'client');
  api.mainModule('src/server.js', 'server');
});

Package.onTest(function(api) {
  Npm.depends({
    chai: '4.2.0',
    sinon: '7.5.0',
  });
  api.use('ecmascript');
  api.use('meteortesting:mocha');
  api.use('mongo');
  api.use('insecure');
  api.use('jquery');
  api.use('underscore');
  api.use('mpowaga:graphql');
  api.mainModule('test/client.js', 'client');
  api.mainModule('test/server.js', 'server');
});
