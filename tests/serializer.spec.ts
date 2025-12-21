// @ts-ignore
import chai, { assert, expect } from "chai";
import {FieldType, serializeActionFields, uint8ToHex} from "../tools/serializer";
chai.config.truncateThreshold = 0;



describe('Serializer', () => {
    it('Should be able to serialize params', async () => {
        const result = await serializeActionFields({
            rpcEndpoint: 'https://vaulta.greymass.com',
            contract: 'eosio.token',
            action: 'transfer',
            fields: [
                { param: 'from', type:FieldType.SENDER },
                { param: 'to', type:FieldType.STATIC, data: 'seller' },
                { param: 'quantity', type:FieldType.DYNAMIC },
            ],
        })

        const from = result.fields.find(f => f.param === 'from');
        assert(!!from, 'from field should be present');
        assert.equal(from.param, 'from', 'from field param name should be correct');
        assert.equal(uint8ToHex(from.data), '', 'from field data should be correct');
        assert.equal(from.offset, 0, 'from field offset should be correct');
        assert.equal(from.size, 8, 'from field size should be correct');
        assert.equal(from.type, FieldType.SENDER, 'from field type should be correct');

        const to = result.fields.find(f => f.param === 'to');
        assert(!!to, 'to field should be present');
        assert.equal(to.param, 'to', 'to field param name should be correct');
        assert.equal(uint8ToHex(to.data), '000000005c15a3c2', 'to field data should be correct');
        assert.equal(to.offset, 8, 'to field offset should be correct');
        assert.equal(to.size, 8, 'to field size should be correct');
        assert.equal(to.type, FieldType.STATIC, 'to field type should be correct');

        const quantity = result.fields.find(f => f.param === 'quantity');
        assert(!!quantity, 'quantity field should be present');
        assert.equal(quantity.param, 'quantity', 'quantity field param name should be correct');
        assert.equal(uint8ToHex(quantity.data), '', 'quantity field data should be correct');
        assert.equal(quantity.offset, 16, 'quantity field offset should be correct');
        assert.equal(quantity.size, 16, 'quantity field size should be correct');
        assert.equal(quantity.type, FieldType.DYNAMIC, 'quantity field type should be correct');
    })

    it('Should fail to allow variable types before specified params', async () => {
        try {
            await serializeActionFields({
                rpcEndpoint: 'https://vaulta.greymass.com',
                contract: 'eosio',
                action: 'regproducer',
                fields: [
                    // producer:name, producer_key:public_key, url:string, location:uint16
                    { param: 'location', type: FieldType.STATIC, data: 1 },
                ],
            })

            throw new Error('Expected serializeActionFields to throw')
        } catch (err: any) {
            expect(err).to.be.instanceof(Error)
            expect(err.message).to.equal(
                'Variable-length field "url" occurs before enforced fields'
            )
        }
    })

    it('Should be able to use variable types before specified params if they are specified as well', async () => {
        const result = await serializeActionFields({
            rpcEndpoint: 'https://vaulta.greymass.com',
            contract: 'eosio',
            action: 'regproducer',
            fields: [
                // producer:name, producer_key:public_key, url:string, location:uint16
                { param: 'url', type: FieldType.STATIC, data: 'https://test.com' },
                { param: 'location', type: FieldType.STATIC, data: 1 },
            ],
        });

        const url = result.fields.find(f => f.param === 'url');
        assert(!!url, 'url field should be present');
        assert.equal(url.param, 'url', 'url field param name should be correct');
        assert.equal(uint8ToHex(url.data), '1068747470733a2f2f746573742e636f6d', 'url field data should be correct');
        assert.equal(url.offset, 42, 'url field offset should be correct');
        assert.equal(url.size, 17, 'url field size should be correct');

        const location = result.fields.find(f => f.param === 'location');
        assert(!!location, 'location field should be present');
        assert.equal(location.param, 'location', 'location field param name should be correct');
        assert.equal(uint8ToHex(location.data), '0100', 'location field data should be correct');
        assert.equal(location.offset, 59, 'location field offset should be correct');
        assert.equal(location.size, 2, 'location field size should be correct');
    })
});
