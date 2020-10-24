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

function pick(obj, keys) {
  return keys.reduce((result, key) => {
    // eslint-disable-next-line no-param-reassign
    result[key] = obj[key];
    return result;
  }, {});
}

function findSelection(fieldNodes, field) {
  // eslint-disable-next-line no-restricted-syntax
  for (const node of Array.isArray(fieldNodes) ? fieldNodes : []) {
    // eslint-disable-next-line no-restricted-syntax
    for (const selection of node?.selectionSet?.selections || []) {
      if (selection.name.value === field.name) {
        return selection.selectionSet.selections;
      }
    }
  }
  return fieldNodes;
}

function resolveFields(field, args, value, selectedFields) {
  Object.values(getTypeFields(field.type))
    .filter(
      (f) =>
        f != null &&
        typeof f.resolve === 'function' &&
        Array.isArray(f.astNode.directives) &&
        f.astNode.directives.some(({ name }) => name.value === 'cursor') &&
        selectedFields.includes(f.name),
    )
    .forEach((f) => {
      const resolveArgs = [value].concat(args.slice(1));
      resolveArgs[3].fieldNodes = findSelection(resolveArgs[3].fieldNodes, f);
      f.resolve(...resolveArgs);
    });
}

function createResolver(resolve, field, isSingle) {
  return (...args) => {
    const cursor = resolve(...args);
    const { meteorSubscription } = args[2] || {};

    if (cursor == null || typeof cursor.fetch !== 'function') {
      return cursor;
    }
    if (!meteorSubscription) {
      const result = cursor.fetch();
      return isSingle ? result[0] : result;
    }

    const selectionSet = args[3].fieldNodes[0]?.selectionSet;
    const selectedFields = selectionSet
      ? (selectionSet.selections || []).map((selection) => selection.name.value)
      : args[3].fieldNodes.map((node) => node.name.value);
    const { collectionName } = cursor._cursorDescription;
    const initialResult = [];
    const publishedIds = new Set();
    let initializing = true;

    const handle = cursor.observeChanges({
      added(id, fields) {
        const value = { _id: id, ...fields };
        meteorSubscription.added(
          collectionName,
          id,
          pick(fields, selectedFields),
        );
        resolveFields(field, args, value, selectedFields);
        if (initializing) {
          initialResult.push(value);
        }
        publishedIds.add(id);
      },
      changed(id, fields) {
        const changedFields = selectedFields.filter((name) =>
          Object.prototype.hasOwnProperty.call(fields, name),
        );
        const value = { _id: id, ...fields };
        meteorSubscription.changed(
          collectionName,
          id,
          pick(fields, changedFields),
        );
        resolveFields(field, args, value, changedFields);
      },
      removed(id) {
        meteorSubscription.removed(collectionName, id);
        publishedIds.delete(id);
      },
    });
    initializing = false;
    meteorSubscription.onStop(() => {
      handle.stop();
      publishedIds.forEach((id) =>
        meteorSubscription.removed(collectionName, id),
      );
      publishedIds.clear();
    });

    return isSingle ? initialResult[0] : initialResult;
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
  return (
    type.kind === 'NamedType' && isObjectType(schema.getType(type.name.value))
  );
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
    const {
      resolve,
      astNode: { type },
    } = field;

    if (isSingleObject(this.schema, type)) {
      // eslint-disable-next-line no-param-reassign
      field.resolve = createResolver(resolve, field, true);
    } else if (isListOfObjects(this.schema, type)) {
      // eslint-disable-next-line no-param-reassign
      field.resolve = createResolver(resolve, field, false);
    } else {
      throw new Error(
        `@cursor directive only works with object types but got ${field.type}`,
      );
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
