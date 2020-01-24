/* global Package */

Package.describe({
  name: 'meteorengineer:graphql',
  version: '0.0.1',
  summary: 'Realtime GraphQL Server for Meteor.JS',
  git: 'https://github.com/meteorengineer/meteor-graphql',
  documentation: 'README.md',
});

Package.onUse(function(api) {
  api.versionsFrom('1.8.1');
  api.use('ecmascript');
  api.use('tracker');
  api.use('reactive-var');
  api.use('ejson');
  api.use('tmeasday:check-npm-versions@0.3.2');
  api.addFiles('src/checkNpmVersions.js');
  api.mainModule('src/client.js', 'client');
  api.mainModule('src/server.js', 'server');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('meteortesting:mocha');
  api.use('mongo');
  api.use('insecure');
  api.use('jquery');
  api.use('underscore');
  api.use('meteorengineer:graphql');
  api.mainModule('test/client.js', 'client');
  api.mainModule('test/server.js', 'server');
});
