import { Mongo } from 'meteor/mongo';

export const Fruits = new Mongo.Collection('fruits');
export const Users = new Mongo.Collection('users');
export const Entries = new Mongo.Collection('entries');

export const typeDefs = `
  type Fruit {
    _id: ID!
    name: String!
  }

  type User {
    _id: ID!
    name: String!
  }

  type Entry {
    _id: ID!
    content: String!
    author: User! @cursor
    emptyCursor: User @cursor
  }

  type Query {
    hello: String!
    allFruits: [Fruit] @cursor
    selectedFruits(selection: [String!]!): [Fruit] @cursor
    allEntries: [Entry!] @cursor
  }

  type Mutation {
    addFruit(name: String!): ID!
  }
`;

export const resolvers = {
  Entry: {
    author(entry) {
      return Users.find({ _id: entry.author });
    },
    emptyCursor() {
      return undefined;
    },
  },
  Query: {
    hello() {
      return 'Hello';
    },
    allFruits() {
      return Fruits.find();
    },
    selectedFruits(_, { selection }) {
      return Fruits.find({ name: { $in: selection } });
    },
    allEntries() {
      return Entries.find();
    },
  },
  Mutation: {
    addFruit(_, { name }) {
      return Fruits.insert({ name });
    },
  },
};
