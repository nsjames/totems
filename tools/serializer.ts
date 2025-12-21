import { Serializer, APIClient } from '@wharfkit/antelope'

/***
 * Helper to convert RequiredAction fields into a format that the smart contract
 * expects and can use to validate existence of those actions within the transaction.
 */

/***
 * Types of fields you can enforce
 */
export enum FieldType {
    // This will always be the account sending the transaction
    SENDER,
    // This field required dynamic user-specified data
    DYNAMIC,
    // This field uses static pre-defined data
    STATIC,
    // This will always be the totem ticker
    TOTEM
    // Anything field not specified as one of the above is considered IGNORED, and
    // will not prompt a user to fill it in, or be autofilled like SENDER/TOTEM.
}

/***
 * Input action field to be serialized
 * @param param - name of the parameter in the action
 * @param type - type of the field (Sender, Dynamic, Static, Totem)
 * @param data - data to serialize (if applicable)
 */
export interface InputActionField {
    param: string
    type: FieldType
    data?: any
    min?: number
    max?: number
}

/***
 * Serialized field with byte offset information
 * @param param - name of the parameter in the action
 * @param data - raw serialized bytes
 * @param offset - byte offset in the serialized action
 * @param size - size of the serialized field in bytes
 */
export interface SerializedField {
    param: string
    type: number
    data: Uint8Array // raw serialized bytes
    offset: number
    size: number
    min?: number
    max?: number
}

export interface SerializedRequiredAction {
    contract: string
    action: string
    fields: SerializedField[]
    purpose: string
}

let abiCache = new Map<string, any>()
const getAbi = async (client: APIClient, contract: string) => {
    if (abiCache.has(contract)) {
        return abiCache.get(contract)
    }
    const { abi } = await client.v1.chain.get_abi(contract)
    if (!abi) throw new Error(`ABI not found for ${contract}`)
    abiCache.set(contract, abi)
    return abi
}

let clients = new Map<string, APIClient>()
const getClient = (rpcEndpoint: string) => {
    if (clients.has(rpcEndpoint)) {
        return clients.get(rpcEndpoint)!
    }
    const client = new APIClient({
        url: rpcEndpoint
    })
    clients.set(rpcEndpoint, client)
    return client
}

/**
 * Serialize enforced action fields into byte offsets
 * @param rpcEndpoint - RPC endpoint to use (if client not provided)
 * @param client - APIClient to use (if rpcEndpoint not provided)
 * @param contract - contract name
 * @param action - action name
 * @param fields - fields to serialize
 * * You can only serialize variable length fields if they either come after all fields, or if they are using STATIC
 * as the type so that the length is known ahead of time
 * @param purpose - optional purpose string for logging
 * @param min - optional min for param display/input
 * @param max - optional max for param display/input
 * @returns SerializedRequiredAction
 */
export async function serializeActionFields({
    rpcEndpoint,
    client,
    contract,
    action,
    fields,
    purpose = '',
}: {
    rpcEndpoint?: string
    client?: APIClient
    contract: string
    action: string
    fields: InputActionField[],
    purpose?: string
}): Promise<SerializedRequiredAction> {
    if(!rpcEndpoint && !client) {
        throw new Error('Either rpcEndpoint or client must be provided');
    }
    client = client ? client : getClient(rpcEndpoint);
    const abi = await getAbi(client, contract);

    const actionDef = abi.actions.find(a => a.name === action)
    if (!actionDef) throw new Error(`Action ${action} not found`)

    const struct = abi.structs.find(s => s.name === actionDef.type)
    if (!struct) throw new Error(`Struct ${actionDef.type} not found`)

    const enforced = new Map(
        fields.map(f => [f.param, f])
    )


    const serialized: SerializedField[] = []

    let offset = 0
    let enforcedSeen = false

    for (const abiField of struct.fields) {
        const enforcedField = enforced.get(abiField.name)
        const isEnforced = !!enforcedField
        const isVariable = isVariableType(abiField.type)

        // Only reject NON-enforced variable fields before first enforced
        if (!enforcedSeen && isVariable && !isEnforced) {
            throw new Error(
                `Variable-length field "${abiField.name}" occurs before enforced fields`
            )
        }

        if (isEnforced) {
            enforcedSeen = true
        }

        const encoded = Serializer.encode({
            abi,
            type: abiField.type,
            object: enforcedField?.data ?? getZeroValue(abiField.type),
        })

        if (isEnforced) {
            serialized.push({
                param: abiField.name,
                data: enforcedField!.type === FieldType.STATIC ? encoded.array : Uint8Array.from([]),
                offset,
                size: encoded.length,
                type: enforcedField!.type,
                min: enforcedField!.min,
                max: enforcedField!.max
            })
        }

        offset += encoded.length
    }

    return {
        contract,
        action,
        fields:serialized,
        purpose
    }
}

/**
 * Minimal zero-values to advance ABI offsets
 * (never stored, never enforced)
 */
function getZeroValue(type: string): any {
    if (type === 'string') return ''
    if (type === 'asset') return '0.0000 TOTEM'
    if (type === 'name') return 'totems'
    if (type === 'bool') return false

    if (type === 'bytes') return new Uint8Array(0)

    if (type === 'public_key')
        return 'EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV'

    if (type.startsWith('uint') || type.startsWith('int')) return 0
    if (type.startsWith('float')) return 0

    if (type === 'time_point') return '1970-01-01T00:00:00.000'
    if (type === 'time_point_sec') return '1970-01-01T00:00:00'
    if (type === 'block_timestamp_type') return 0

    if (type === 'checksum160') return '0'.repeat(40)
    if (type === 'checksum256') return '0'.repeat(64)
    if (type === 'checksum512') return '0'.repeat(128)

    if (type === 'symbol') return '4,TOTEM'
    if (type === 'symbol_code') return 'TOTEM'

    if (type === 'varuint32' || type === 'varint32') return 0

    throw new Error(`Unsupported dynamic field type: ${type}`)
}


function isVariableType(type: string): boolean {
    return (
        type === 'string' ||
        type === 'bytes' ||
        type.endsWith('[]')
    )
}

export function uint8ToHex(uint8) {
    // @ts-ignore
    return Array.from(uint8, b => b.toString(16).padStart(2, '0')).join('');
}