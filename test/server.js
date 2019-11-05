import { MeteorGraphQLServer } from 'meteor/mpowaga:graphql';
import { typeDefs, resolvers } from './index';

new MeteorGraphQLServer({
  typeDefs,
  resolvers,
});