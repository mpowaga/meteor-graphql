import { Meteor } from 'meteor/meteor';
import MeteorGraphQLServer from 'meteor/meteorengineer:graphql';
import {
  Fruits,
  Users,
  Entries,
  typeDefs,
  resolvers,
} from './index';

Meteor.methods({
  'test.resetDatabase': () => {
    [
      Fruits,
      Users,
      Entries,
    ].forEach((collection) => collection.remove({}));
  },
});

// eslint-disable-next-line no-new
new MeteorGraphQLServer({
  typeDefs,
  resolvers,
});
