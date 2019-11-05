import './index';
import { Meteor } from 'meteor/meteor';
import { graphql } from 'graphql';
import { makeExecutableSchema } from 'graphql-tools';

class Subscription {
  constructor({ schema, query, variables }) {
    this._schema = schema;
    this._query = query;
    this._variables = variables;
    this._subscription = Meteor.subscribe('/graphql', { query });
  }

  ready() {
    return this._subscription.ready();
  }

  stop() {
    return this._subscription.stop();
  }

  async result() {
    return graphql(this._schema, this._query);
  }
}

export class MeteorGraphQLClient {
  constructor(options) {
    this._schema = makeExecutableSchema(options);
  }

  subscribe(query) {
    return new Subscription({
      schema: this._schema,
      query,
    });
  }

  mutate(query, variables) {
    return new Promise((resolve, reject) => {
      Meteor.call('/graphql', { query, variables }, (err, result) => {
        return err ? reject(err) : resolve(result);
      });
    });
  }
}