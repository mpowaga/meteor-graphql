import './index';
import { graphql } from 'graphql';
import {
  makeExecutableSchema,
  SchemaDirectiveVisitor
} from 'graphql-tools';

class CursorDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve } = field;

    field.resolve = (...args) => {
      const cursor = resolve(...args);
      const { subscription } = args[2];
      const collectionName = cursor._cursorDescription.collectionName;
      const result = [];

      cursor.observeChanges({
        added(id, fields) {
          result.push({ _id: id, ...fields });
          subscription.added(collectionName, id, fields);
        },
        changed(id, fields) {
          subscription.changed(collectionName, id, fields);
        },
        removed(id) {
          subscription.removed(collectionName, id);
        },
      });

      return result;
    };
  }
}

export class MeteorGraphQLServer {
  constructor(options = {}) {
    const schema = this._schema = makeExecutableSchema({
      ...options,
      typeDefs: [
        'directive @cursor on FIELD_DEFINITION',
        ...(
          Array.isArray(options.typeDefs)
            ? options.typeDefs
            : [options.typeDefs]
        ),
      ],
      schemaDirectives: {
        ...(options.schemaDirectovies || {}),
        cursor: CursorDirective,
      },
    });

    Meteor.publish('/graphql', function ({ query, variables }) {
      graphql(schema, query, variables, this).then(() => {
        this.ready();
      });
    });

    Meteor.methods({
      async '/graphql'({ query, variables }) {
        return await graphql(schema, query, variables);
      },
    });
  }
}