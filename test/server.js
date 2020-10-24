/* global describe, it */

import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import MeteorGraphQLServer from 'meteor/meteorengineer:graphql';
import { Fruits, Users, Entries, typeDefs, resolvers } from './index';

Meteor.methods({
  'test.resetDatabase': () => {
    [Fruits, Users, Entries].forEach((collection) => collection.remove({}));
  },
});

// eslint-disable-next-line no-new
new MeteorGraphQLServer({
  typeDefs,
  resolvers,
});

describe('MeteorGraphQLServer', () => {
  describe('@cursor directive', () => {
    it('throws if used with scalar type', () => {
      expect(
        () =>
          new MeteorGraphQLServer({
            typeDefs: 'type Foo { field: String @cursor }',
            resolvers: {},
          }),
      ).to.throw();
    });
  });
});
