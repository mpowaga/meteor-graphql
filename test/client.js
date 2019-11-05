import { expect } from 'chai';
import { MeteorGraphQLClient } from 'meteor/mpowaga:graphql';
import { typeDefs, resolvers } from './index';

describe('MeteorGraphQLClient', function () {
  const client = new MeteorGraphQLClient({
    typeDefs,
    resolvers,
  });

  it('can run simple query', async () => {
    const result = await client.subscribe('{ hello }').result();
    expect(result).to.eql({ data: { hello: 'Hello' } });
  });
});

