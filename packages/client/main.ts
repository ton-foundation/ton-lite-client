import { fromNano, parseCurrencyCollection, Slice } from "ton";
import { Functions } from "./schema";
import { LiteServerEngine } from "./engines/engine";
import { LiteServerSingleEngine } from "./engines/single";
import { LiteServerRoundRobinEngine } from "./engines/roundRobin";
import { LiteClient } from "./client";


// storage_used$_ cells:(VarUInteger 7) bits:(VarUInteger 7)
// ext_refs:(VarUInteger 7) int_refs:(VarUInteger 7)
// public_cells:(VarUInteger 7) = StorageUsed;

function readStorageUsed(cs: Slice) {
    return {
        cells: cs.readVarUInt(3),
        bits: cs.readVarUInt(3),
        // ext_refs: cs.readVarUInt(7),
        // int_refs: cs.readVarUInt(7),
        public_cells: cs.readVarUInt(3),
    }
}

// storage_info$_ used:StorageUsed last_paid:uint32
// due_payment:(Maybe Grams) = StorageInfo;

function readStorageInfo(cs: Slice) {
    return {
        storageUsed: readStorageUsed(cs),
        lastPaid: cs.readUint(32).toNumber(),
        duePayment: cs.readBit() ? cs.readCoins() : null
    }
}


// _ split_depth:(Maybe (## 5)) special:(Maybe TickTock)
//   code:(Maybe ^Cell) data:(Maybe ^Cell)
//   library:(HashmapE 256 SimpleLib) = StateInit;

// account_uninit$00 = AccountState;
// account_active$1 _:StateInit = AccountState;
// account_frozen$01 state_hash:bits256 = AccountState;
function readAccountState(cs: Slice) {
    cs.readBit() // account_active$1
    cs.readBit() // split_depth
    cs.readBit() // special

    return {
        code: cs.readRef().toCell(),
        data: cs.readRef().toCell(),
        // library: cs.readBit()
    }
}

// account_storage$_ last_trans_lt:uint64
// balance:CurrencyCollection state:AccountState
// = AccountStorage;

function readAccountStorage(cs: Slice) {
    return {
        transLastLt: cs.readUint(64),
        balance: fromNano(parseCurrencyCollection(cs).coins),
        state: readAccountState(cs)
    }
}

// account_none$0 = Account;
// account$1 addr:MsgAddressInt storage_stat:StorageInfo
// storage:AccountStorage = Account;
function readAccount(cs: Slice) {
    cs.readBit()
    return {
        address: cs.readAddress(),
        storageStat: readStorageInfo(cs),
        storage: readAccountStorage(cs)
    }
}



function intToIP(int: number) {
    var part1 = int & 255;
    var part2 = ((int >> 8) & 255);
    var part3 = ((int >> 16) & 255);
    var part4 = ((int >> 24) & 255);

    return part4 + "." + part3 + "." + part2 + "." + part1;
}

let server = {
    "ip": -1468558020,
    "port": 20640,
    "id": {
        "@type": "pub.ed25519",
        "key": "D/ezwjebrDbjs2rpaY3pYrewsI4qcu65HNNq/fim13U="
    }
}


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {

    const engines: LiteServerEngine[] = [];
    for (let i = 0; i < 50; i++) {
        engines.push(new LiteServerSingleEngine({
            host: intToIP(server.ip),
            port: server.port,
            publicKey: Buffer.from(server.id.key, 'base64')
        }));
    }
    const engine: LiteServerEngine = new LiteServerRoundRobinEngine(engines);
    const client = new LiteClient(engine);

    let start = Date.now();
    let mc = await client.getMasterchainInfoExt();
    console.log('Read in ' + (Date.now() - start) + ' ms');
    console.warn(mc);
    let seqno = 1;
    let read = 0;
    start = Date.now();

    while (true) {

        // MC


        // await delay(1000);

        // Blocks
        let seqnos: number[] = [];
        for (let i = 0; i < 1000; i++) {
            seqnos.push(seqno++);
        }
        await Promise.all(seqnos.map(async (s) => {
            let lk = await client.lookupBlockByID({
                seqno: s,
                shard: '-9223372036854775808',
                workchain: -1
            });
            // let bh = await client.getBlockHeader(lk.id);
            let shards = await client.getAllShardsInfo(lk.id);
            return shards;
        }));
        read += seqnos.length;
        console.log('Read ' + read + ' in ' + (Date.now() - start) + ' ms');
    }
}

main()
