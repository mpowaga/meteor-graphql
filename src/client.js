import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { ReactiveVar } from 'meteor/reactive-var';
import { EJSON } from 'meteor/ejson';
import { graphql } from 'graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';
import { makeExecutableSchema } from './index';


class CursorDirective extends SchemaDirectiveVisitor {
  // eslint-disable-next-line class-methods-use-this
  visitFieldDefinition(field) {
    const { resolve, astNode: { type } } = field;

    if (type.kind === 'NamedType'
      || (type.kind === 'NonNullType' && type.type.kind === 'NamedType')) {
      // eslint-disable-next-line no-param-reassign
      field.resolve = (...args) => {
        const cursor = resolve(...args);
        if (cursor) {
          return cursor.fetch()[0];
        }
      };
    }
  }
}

class Subscription {
  constructor({ schema, query, variables }) {
    this._schema = schema;
    this._query = query;
    this._variables = variables;
    this._subscription = Meteor.subscribe('/graphql', { query, variables });
    this._result = new ReactiveVar();
    this._ready = new ReactiveVar(false);

    this._computation = Tracker.autorun(() => {
      if (this._subscription.ready()) {
        graphql(
          this._schema,
          this._query,
          undefined, // rootValue
          undefined, // contextValue
          this._variables,
        ).then((result) => {
          this._result.set(result);
          this._ready.set(true);
        });
      }
    });
  }

  ready() {
    return this._ready.get();
  }

  stop() {
    this._subscription.stop();
    this._computation.stop();
    // TODO: notify client
  }

  result() {
    return this._result.get();
  }
}

export default class MeteorGraphQLClient {
  constructor(options) {
    this._schema = makeExecutableSchema(options, CursorDirective);
    this._subscriptions = [];
  }

  subscribe(query, variables) {
    const params = { query, variables };
    const existing = this._subscriptions.find((sub) =>
      EJSON.equals(sub.params, params));

    if (existing) {
      return existing.handle;
    }

    const handle = Tracker.nonreactive(() =>
      new Subscription({ schema: this._schema, ...params }));
    this._subscriptions.push({ params, handle });

    return handle;
  }

  query = (query, variables) => new Promise((resolve, reject) =>
    Meteor.call('/graphql', { query, variables }, (err, result) => {
      if (err) {
        return reject(err);
      }
      return resolve(result);
    }))
}
