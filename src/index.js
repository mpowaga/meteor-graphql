import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions({
  graphql: '14.5.x',
  'graphql-tools': '4.0.x',
}, 'mpowaga:graphql');