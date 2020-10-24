import { makeExecutableSchema as makeExecutableSchema_ } from 'graphql-tools';

// eslint-disable-next-line import/prefer-default-export
export function makeExecutableSchema(options, cursorDirective) {
  return makeExecutableSchema_({
    ...options,
    typeDefs: [
      'directive @cursor on FIELD_DEFINITION',
      ...(Array.isArray(options.typeDefs)
        ? options.typeDefs
        : [options.typeDefs]),
    ],
    schemaDirectives: {
      ...(options.schemaDirectovies || {}),
      cursor: cursorDirective,
    },
  });
}
