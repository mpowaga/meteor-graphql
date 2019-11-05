import { graphql } from 'graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';
import { makeExecutableSchema } from './index';

class CursorDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve } = field;

    field.resolve = (...args) => {
      const cursor = resolve(...args);
      const { meteorSubscription } = args[2] || {};

      if (!meteorSubscription) {
        return cursor.fetch();
      }

      const collectionName = cursor._cursorDescription.collectionName;
      const result = [];

      cursor.observeChanges({
        added(id, fields) {
          result.push({ _id: id, ...fields });
          meteorSubscription.added(collectionName, id, fields);
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

export class MeteorGraphQLServer {
  constructor(options = {}) {
    const schema = makeExecutableSchema(options, CursorDirective);

    Meteor.publish('/graphql', function ({ query, variables }) {
      graphql(
        schema,
        query,
        undefined, // rootValue
        { meteorSubscription: this },
        variables
      ).then(() => {
        this.ready();
      });
    });

    Meteor.methods({
      async '/graphql'({ query, variables }) {
        return await graphql(
          schema,
          query,
          undefined, // rootValue
          undefined, // contextValue
          variables
        );
      },
    });
  }
}