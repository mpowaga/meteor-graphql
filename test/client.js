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
    it('can run simple subscription', (done) => {
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

    it('can resolve nested mongo cursors', (done) => {
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
      const spy = sinon.spy();

      function finish() {
        subscription.stop();
        Tracker.flush();
        expect(spy.firstCall.args[0]).to.eql({ data: { entries: [entry1] } });
        expect(spy.secondCall.args[0]).to.eql({ data: { entries: [entry1, entry2] } });
        expect(spy.thirdCall.args[0]).to.eql({ data: { entries: [entry1] } });
        expect(spy.callCount).to.equal(3);
        done();
      }

      const ready = _.once(() => {
        const entryId = Entries.insert({
          content: entry2.content,
          author: Users.insert(entry2.author),
        });
        setTimeout(() => {
          Entries.remove(entryId);
          Tracker.flush();
          setTimeout(finish, 0);
        }, 0);
      });

      Tracker.autorun(async () => {
        if (subscription.ready()) {
          spy(subscription.result());
          Tracker.nonreactive(() => ready());
        }
      });
    });

    it('can update nested cursor', (done) => {
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
      const spy = sinon.spy();

      function finish() {
        subscription.stop();
        Tracker.flush();
        expect(spy.getCall(0).args[0]).to.eql({ data: { entries: [entry1V1] } });
        expect(spy.getCall(1).args[0]).to.eql({ data: { entries: [entry1V1, entry2V1] } });
        expect(spy.getCall(2).args[0]).to.eql({ data: { entries: [entry1V1, entry2V2] } });
        expect(spy.callCount).to.equal(3);
        done();
      }

      const ready = _.once(() => {
        const entryId = Entries.insert({
          content: entry2V1.content,
          author: Users.insert(entry2V1.author),
        });
        setTimeout(() => {
          Entries.update(entryId, { $set: { author: userId } });
          Tracker.flush();
          setTimeout(finish, 100);
        }, 0);
      });

      Tracker.autorun(async () => {
        if (subscription.ready()) {
          spy(subscription.result());
          Tracker.nonreactive(() => ready());
        }
      });
    });

    it('resolves only selected fields', (done) => {
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
      const spy = sinon.spy();

      function finish() {
        subscription.stop();
        Tracker.flush();
        expect(spy.getCall(0).args[0]).to.eql(
          {
            data: {
              entries: [{ content: entry1.content, author: { email: entry1.author.email } }],
            },
          },
        );
        expect(spy.getCall(1).args[0]).to.eql(
          {
            data: {
              entries: [
                { content: entry1.content, author: { email: entry1.author.email } },
                { content: entry2.content, author: { email: entry2.author.email } },
              ],
            },
          },
        );
        expect(spy.getCall(2).args[0]).to.eql(
          {
            data: {
              entries: [
                { content: entry1.content, author: { email: entry2.author.email } },
                { content: entry2.content, author: { email: entry2.author.email } },
              ],
            },
          },
        );
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
        expect(spy.callCount).to.equal(3);
        done();
      }

      const ready = _.once(() => {
        entry2Id = Entries.insert({
          content: entry2.content,
          author: user2Id,
        });
        setTimeout(() => {
          Entries.update(entry1Id, { $set: { author: user2Id } });
          Tracker.flush();
          setTimeout(finish, 100);
        }, 100);
      });

      Tracker.autorun(async () => {
        if (subscription.ready()) {
          spy(subscription.result());
          Tracker.nonreactive(() => ready());
        }
      });
    });
  });
});
