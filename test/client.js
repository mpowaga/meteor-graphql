/* global describe, it, beforeEach */

import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import sinon from 'sinon';
import { Tracker } from 'meteor/tracker';
import { _ } from 'meteor/underscore';
import MeteorGraphQLClient from 'meteor/meteorengineer:graphql';
import {
  typeDefs,
  resolvers,
  Fruits,
  Users,
  Entries,
} from './index';

describe('MeteorGraphQLClient', function () {
  beforeEach((done) => {
    Meteor.call('test.resetDatabase', done);
  });

  const client = new MeteorGraphQLClient({
    typeDefs,
    resolvers,
  });

  it('can run simple query', async () => {
    const result = await client.query('{ hello }');
    expect(result).to.eql({ data: { hello: 'Hello' } });
  });

  it('can run simple mutation', async () => {
    const name = 'banana';
    const ADD_FRUIT = `
      mutation AddFruit($name: String!) {
        addFruit(name: $name)
      }
    `;
    const result = await client.query(ADD_FRUIT, { name });
    expect(result.errors).to.be.undefined;
    expect(result.data.addFruit).to.be.a.string;
  });

  it('can query mongo cursor', async () => {
    const name = 'banana';
    const _id = Fruits.insert({ name });
    const result = await client.query('{ allFruits { _id name } }');
    expect(result.errors).to.be.undefined;
    expect(result.data.allFruits).to.eql([{ _id, name }]);
  });

  it('can subscribe to query', (done) => {
    const FRUITS = `
      query Fruits($selection: [String!]!) {
        fruits: selectedFruits(selection: $selection) {
          _id
          name
        }
      }
    `;
    const name = 'banana';
    const subscription = client.subscribe(FRUITS, {
      selection: [name, 'apple'],
    });
    const spy = sinon.spy();
    let _id;

    function finish() {
      subscription.stop();
      expect(spy.firstCall.args[0]).to.eql({ data: { fruits: [] } });
      expect(spy.secondCall.args[0]).to.eql({ data: { fruits: [{ _id, name }] } });
      expect(spy.thirdCall.args[0]).to.eql({ data: { fruits: [] } });
      expect(spy.callCount).to.equal(3);
      done();
    }

    const ready = _.once(() => {
      _id = Fruits.insert({ name });
      setTimeout(() => {
        Fruits.insert({ name: 'avocado' });
        setTimeout(() => {
          Fruits.remove(_id);
          Tracker.flush();
          setTimeout(finish, 0);
        });
      }, 0);
    });

    Tracker.autorun(async () => {
      if (subscription.ready()) {
        spy(subscription.result());
        Tracker.nonreactive(() => ready());
      }
    });
  });

  it('can resolve nested cursors', (done) => {
    const entry1 = { content: 'Hello world', author: { name: 'foobar' } };
    const entry2 = { content: 'Hi there', author: { name: 'barfoo' } };

    Entries.insert({
      content: entry1.content,
      author: Users.insert(entry1.author),
    });

    const ENTRIES = `
      query Entries {
        entries: allEntries {
          content
          author {
            name
          }
        }
      }
    `;
    const spy = sinon.spy();
    const subscription = client.subscribe(ENTRIES);

    function finish() {
      subscription.stop();
      expect(spy.firstCall.args[0]).to.eql({ data: { entries: [entry1] } });
      expect(spy.secondCall.args[0]).to.eql({ data: { entries: [entry1, entry2] } });
      expect(spy.callCount).to.equal(2);
      done();
    }

    const ready = _.once(() => {
      Entries.insert({
        content: entry2.content,
        author: Users.insert(entry2.author),
      });
      setTimeout(() => {
        Tracker.flush();
        setTimeout(finish, 0);
      });
    });

    Tracker.autorun(() => {
      if (subscription.ready()) {
        // console.log(subscription);
        spy(subscription.result());
        Tracker.nonreactive(() => ready());
      }
    });
  });
});
