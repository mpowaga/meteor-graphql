import { Mongo } from 'meteor/mongo';

export const Fruits = new Mongo.Collection('fruits');

export const typeDefs = `
  type Fruit {
    _id: ID!
    name: String!
  }

  type Query {
    hello: String!
    allFruits: [Fruit] @cursor
    selectedFruits(selection: [String!]!): [Fruit] @cursor
  }

  type Mutation {
    addFruit(name: String!): ID!
  }
`;

export const resolvers = {
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
  },
  Mutation: {
    addFruit(_, { name }) {
      return Fruits.insert({ name });
    },
  },
};