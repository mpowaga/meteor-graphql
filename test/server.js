import { Meteor } from 'meteor/meteor';
import MeteorGraphQLServer from 'meteor/meteorengineer:graphql';
import {
  Fruits,
  typeDefs,
  resolvers,
} from './index';

Meteor.methods({
  'test.resetDatabase': () => {
    [
      Fruits,
    ].forEach((collection) => collection.remove({}));
  },
});

// eslint-disable-next-line no-new
new MeteorGraphQLServer({
  typeDefs,
  resolvers,
});
