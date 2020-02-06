/* global describe, it, beforeEach */
/* eslint-disable no-return-assign */

import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testSubscription(subscription) {
  return new Promise((resolve) => {
    let result;
    let computation;
    const ready = _.once(() => {
      Meteor.setTimeout(() => {
        resolve({
          async run(fn) {
            Tracker.flush();
            fn();
            Tracker.flush();
            await sleep(100);
            return result;
          },
          result() {
            return result;
          },
          async stop() {
            computation.stop();
            subscription.stop();
            await sleep(100);
          },
        });
      }, 1);
    });
    computation = Tracker.autorun(() => {
      if (subscription.ready()) {
        result = subscription.result();
        Tracker.nonreactive(() => ready());
      }
    });
  });
}

describe('MeteorGraphQLClient', function () {
  beforeEach((done) => {
    Meteor.call('test.resetDatabase', done);
  });

  const client = new MeteorGraphQLClient({
    typeDefs,
    resolvers,
  });

  describe('queries', () => {
    it('can run simple query', async () => {
      const result = await client.query('{ hello }');
      expect(result).to.eql({ data: { hello: 'Hello' } });
    });

    it('can resolve mongo cursor', async () => {
      const name = 'banana';
      const _id = Fruits.insert({ name });
      const result = await client.query('{ allFruits { _id name } }');
      expect(result.errors).to.be.undefined;
      expect(result.data.allFruits).to.eql([{ _id, name }]);
    });

    it('can resolve nested mongo cursors', async () => {
      const entry1 = { content: 'Hello world', author: { name: 'foobar' }, emptyCursor: null };
      const entry2 = { content: 'Hi there', author: { name: 'barfoo' }, emptyCursor: null };

      Entries.insert({
        content: entry1.content,
        author: Users.insert(entry1.author),
      });
      Entries.insert({
        content: entry2.content,
        author: Users.insert(entry2.author),
      });

      const ENTRIES = `
        query Entries {
          entries: allEntries {
            content
            author {
              name
            }
            emptyCursor {
              _id
            }
          }
        }
      `;

      const result = await client.query(ENTRIES);
      expect(result.errors).to.be.undefined;
      expect(result.data.entries).to.eql([entry1, entry2]);
    });

    it('resolves only selected fields', async () => {
      const entry = { content: 'Hello world', author: { name: 'foobar' }, emptyCursor: null };
      Entries.insert({
        content: entry.content,
        author: Users.insert(entry.author),
      });
      const result = await client.query('{ entries: allEntries { content } }');
      expect(result.errors).to.be.undefined;
      expect(result.data.entries).to.eql([{ content: entry.content }]);
    });
  });

  describe('mutations', () => {
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
  });

  describe('subscriptions', () => {
    it('can run simple subscription', async () => {
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
      const { run, stop } = await testSubscription(subscription);
      let _id;
      expect(
        await run(() => _id = Fruits.insert({ name })),
      ).to.eql({ data: { fruits: [{ _id, name }] } });
      expect(
        await run(() => Fruits.insert({ name: 'avocado' })),
      ).to.eql({ data: { fruits: [{ _id, name }] } });
      expect(
        await run(() => Fruits.remove(_id)),
      ).to.eql({ data: { fruits: [] } });
      await stop();
    });

    it('removes documents when subscription is stopped', async () => {
      const fruits = [
        'avocado',
        'apple',
        'banana',
        'cherry',
      ];
      fruits.forEach((name) => Fruits.insert({ name }));
      const subscription = client.subscribe('{ allFruits { name } }');
      const { stop } = await testSubscription(subscription);
      expect(Fruits.find().count()).to.equal(fruits.length);
      await stop();
      expect(Fruits.find().count()).to.equal(0);
    });

    it('can resolve nested cursors', async () => {
      const entry1 = { content: 'Hello world', author: { name: 'foobar' }, emptyCursor: null };
      const entry2 = { content: 'Hi there', author: { name: 'barfoo' }, emptyCursor: null };
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
            emptyCursor {
              _id
            }
          }
        }
      `;
      const subscription = client.subscribe(ENTRIES);
      const { run, result, stop } = await testSubscription(subscription);
      expect(result()).to.eql({ data: { entries: [entry1] } });
      let entryId;
      expect(
        await run(() => entryId = Entries.insert({
          content: entry2.content,
          author: Users.insert(entry2.author),
        })),
      ).to.eql({ data: { entries: [entry1, entry2] } });
      expect(
        await run(() => Entries.remove(entryId)),
      ).to.eql({ data: { entries: [entry1] } });
      await stop();
    });

    it('can update nested cursor', async () => {
      const user = { name: 'baz' };
      const userId = Users.insert(user);
      const entry1V1 = { content: 'Hello world', author: { name: 'foobar' }, emptyCursor: null };
      const entry2V1 = { content: 'Hi there', author: { name: 'barfoo' }, emptyCursor: null };
      const entry2V2 = { content: 'Hi there', author: user, emptyCursor: null };
      Entries.insert({
        content: entry1V1.content,
        author: Users.insert(entry1V1.author),
      });
      const ENTRIES = `
        query Entries {
          entries: allEntries {
            content
            author {
              name
            }
            emptyCursor {
              _id
              name
            }
          }
        }
      `;
      const subscription = client.subscribe(ENTRIES);
      const { run, result, stop } = await testSubscription(subscription);
      expect(result()).to.eql({ data: { entries: [entry1V1] } });
      let entryId;
      expect(
        await run(() => entryId = Entries.insert({
          content: entry2V1.content,
          author: Users.insert(entry2V1.author),
        })),
      ).to.eql({ data: { entries: [entry1V1, entry2V1] } });
      expect(
        await run(() => Entries.update(entryId, { $set: { author: userId } })),
      ).to.eql({ data: { entries: [entry1V1, entry2V2] } });
      await stop();
    });

    it('resolves only selected fields', async () => {
      const entry1 = { content: 'Hello world', author: { name: 'foobar', email: 'foo@bar.com' } };
      const entry2 = { content: 'Hi there', author: { name: 'barfoo', email: 'bar@foo.com' } };
      const user1Id = Users.insert(entry1.author);
      const user2Id = Users.insert(entry2.author);
      const entry1Id = Entries.insert({
        content: entry1.content,
        author: user1Id,
      });
      let entry2Id;
      const subscription = client.subscribe('{ entries: allEntries { content author { email } } }');
      const { run, result, stop } = await testSubscription(subscription);
      expect(result()).to.eql({
        data: {
          entries: [{ content: entry1.content, author: { email: entry1.author.email } }],
        },
      });
      expect(
        await run(() => entry2Id = Entries.insert({
          content: entry2.content,
          author: user2Id,
        })),
      ).to.eql({
        data: {
          entries: [
            { content: entry1.content, author: { email: entry1.author.email } },
            { content: entry2.content, author: { email: entry2.author.email } },
          ],
        },
      });
      expect(
        await run(() => Entries.update(entry1Id, { $set: { author: user2Id } })),
      ).to.eql({
        data: {
          entries: [
            { content: entry1.content, author: { email: entry2.author.email } },
            { content: entry2.content, author: { email: entry2.author.email } },
          ],
        },
      });
      expect(Entries.find().fetch()).to.eql([
        {
          _id: entry1Id, content: entry1.content, author: user2Id,
        },
        {
          _id: entry2Id, content: entry2.content, author: user2Id,
        },
      ]);
      expect(Users.findOne(user1Id)).to.eql({ _id: user1Id, email: entry1.author.email });
      expect(Users.findOne(user2Id)).to.eql({ _id: user2Id, email: entry2.author.email });
      expect(Users.find().fetch().length).to.equal(2);
      await stop();
    });
  });
});
