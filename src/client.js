import { Meteor } from 'meteor/meteor';
import { graphql } from 'graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';
import { makeExecutableSchema } from './index';

class CursorDirective extends SchemaDirectiveVisitor {
  // eslint-disable-next-line class-methods-use-this
  visitFieldDefinition() {}
}

class Subscription {
  constructor({ schema, query, variables }) {
    this._schema = schema;
    this._query = query;
    this._variables = variables;
    this._subscription = Meteor.subscribe('/graphql', { query, variables });
  }

  ready() {
    return this._subscription.ready();
  }

  stop() {
    return this._subscription.stop();
  }

  async result() {
    return graphql(
      this._schema,
      this._query,
      undefined, // rootValue
      undefined, // contextValue
      this._variables,
    );
  }
}

export default class MeteorGraphQLClient {
  constructor(options) {
    this._schema = makeExecutableSchema(options, CursorDirective);
  }

  subscribe(query, variables) {
    return new Subscription({
      schema: this._schema,
      query,
      variables,
    });
  }

  query = (query, variables) => new Promise((resolve, reject) =>
    Meteor.call('/graphql', { query, variables }, (err, result) => {
      if (err) {
        return reject(err);
      }
      return resolve(result);
    }))
}
