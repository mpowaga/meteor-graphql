import { MeteorGraphQLServer } from 'meteor/mpowaga:graphql';
import {
  Fruits,
  typeDefs,
  resolvers,
} from './index';

Meteor.methods({
  'test.resetDatabase': () => {
    [
      Fruits,
    ].forEach(collection => collection.remove({}));
  }
});

new MeteorGraphQLServer({
  typeDefs,
  resolvers,
});