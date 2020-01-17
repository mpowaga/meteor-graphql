import { Meteor } from 'meteor/meteor';
import { graphql } from 'graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';
import { makeExecutableSchema } from './index';

function getTypeFields(type) {
  if (type.ofType) {
    return getTypeFields(type.ofType);
  }
  return type._fields;
}

function resolveFields(field, args, value) {
  Object.values(getTypeFields(field.type))
    .filter((f) =>
      typeof f.resolve === 'function'
      && Array.isArray(f.astNode.directives)
      && f.astNode.directives.some(({ name }) => name.value === 'cursor'))
    .forEach((f) => f.resolve(value, ...args.slice(1)));
}

function singleObjectResolver(resolve, field) {
  return (...args) => {
    const cursor = resolve(...args);
    const { meteorSubscription } = args[2] || {};
    if (cursor) {
      const { collectionName } = cursor._cursorDescription;
      const doc = cursor.fetch()[0];
      if (doc && meteorSubscription) {
        meteorSubscription.added(collectionName, doc._id, doc);
        resolveFields(field, args, doc);
      }
      return doc;
    }
    return cursor;
  };
}

function listOfObjectsResolver(resolve, field) {
  return (...args) => {
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
        resolveFields(field, args, value);
      },
      changed(id, fields) {
        const value = { _id: id, ...fields };
        meteorSubscription.changed(collectionName, id, fields);
        resolveFields(field, args, value);
      },
      removed(id) {
        meteorSubscription.removed(collectionName, id);
      },
    });

    // TODO: remove result array after it is returned
    return result;
  };
}

function isObjectType(type) {
  return type && type.astNode && type.astNode.kind === 'ObjectTypeDefinition';
}

/*
 * Returns true for following GraphQL types:
 *
 *   - NamedType
 *   - NamedType!
 *
 * where `NamedType` is object type.
 */
function isSingleObject(schema, type) {
  if (type.kind === 'NonNullType') {
    return isSingleObject(schema, type.type);
  }
  return type.kind === 'NamedType' && isObjectType(schema.getType(type.name.value));
}

/*
 * Returns true for following GraphQL types:
 *
 *   - [NamedType]
 *   - [NamedType]!
 *   - [NamedType!]
 *   - [NamedType!]!
 *
 * where `NamedType` is object type.
 */
function isListOfObjects(schema, type) {
  if (type.kind === 'NonNullType') {
    return isListOfObjects(schema, type.type);
  }
  return type.kind === 'ListType' && isSingleObject(schema, type.type);
}

class CursorDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    const { resolve, astNode: { type } } = field;

    if (isSingleObject(this.schema, type)) {
      // eslint-disable-next-line no-param-reassign
      field.resolve = singleObjectResolver(resolve, field);
    } else if (isListOfObjects(this.schema, type)) {
      // eslint-disable-next-line no-param-reassign
      field.resolve = listOfObjectsResolver(resolve, field);
    } else {
      throw new Error(`@cursor directive only works with object types but got ${field.type}`);
    }
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
