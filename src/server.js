import { Meteor } from 'meteor/meteor';
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
        const { meteorSubscription } = args[2] || {};

        if (cursor) {
          const { collectionName } = cursor._cursorDescription;
          const doc = cursor.fetch()[0];
          if (doc && meteorSubscription) {
            // TODO: resolve fields
            meteorSubscription.added(collectionName, doc._id, doc);
          }
          return doc;
        }
      };
      return field;
    }

    // eslint-disable-next-line no-param-reassign
    field.resolve = (...args) => {
      const cursor = resolve(...args);
      const { meteorSubscription } = args[2] || {};

      if (cursor == null || typeof cursor.fetch !== 'function') {
        return cursor;
      }

      if (!meteorSubscription) {
        return cursor.fetch();
      }

      const { collectionName } = cursor._cursorDescription;
      const result = [];

      cursor.observeChanges({
        added(id, fields) {
          const value = { _id: id, ...fields };

          result.push(value);
          meteorSubscription.added(collectionName, id, fields);

          if (!field.type.ofType || !field.type.ofType._fields) {
            return;
          }

          Object.values(field.type.ofType._fields)
            .filter((f) =>
              typeof f.resolve === 'function'
              && Array.isArray(f.astNode.directives)
              && f.astNode.directives.some(({ name }) => name.value === 'cursor'))
            .forEach((f) => f.resolve(value, ...args.slice(1)));
        },
        changed(id, fields) {
          meteorSubscription.changed(collectionName, id, fields);
        },
        removed(id) {
          meteorSubscription.removed(collectionName, id);
        },
      });

      return result;
    };
  }
}

export default class MeteorGraphQLServer {
  constructor(options = {}) {
    const schema = makeExecutableSchema(options, CursorDirective);

    Meteor.publish('/graphql', function ({ query, variables }) {
      graphql(
        schema,
        query,
        undefined, // rootValue
        { meteorSubscription: this },
        variables,
      ).then(() => {
        this.ready();
      });
    });

    Meteor.methods({
      async '/graphql'({ query, variables }) {
        // eslint-disable-next-line no-return-await
        return await graphql(
          schema,
          query,
          undefined, // rootValue
          undefined, // contextValue
          variables,
        );
      },
    });
  }
}
