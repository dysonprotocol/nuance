import { createApp } from "vue";
import { createPinia } from "pinia";
import { setupPiniaOrm } from "./orm/setup";
import App from "./App.vue";
import router from "./router";
import "vue-sonner/style.css";
import "./style.css";
import { useRepo, Model as OrmModel } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { useWallet } from "@/composables/useWallet";
import type { Repository } from "pinia-orm";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
setupPiniaOrm(pinia);
app.use(router);
app.mount("#app");

// Expose dynamic ORM helpers for e2e/dev tooling
if (import.meta.env.DEV && typeof window !== "undefined") {
  type RepoLike = Repository<OrmModel>;
  type OrmGlobal = Record<
    string,
    { model: typeof OrmModel; repo: RepoLike; api: () => unknown }
  >;

  try {
    // Only import the ORM models that are actually used in the nuance blogging platform
    const modules = import.meta.glob(
      [
        "./orm/models/nuance/*.ts",
        "./orm/models/storage/Storage.ts",
        "./orm/models/bank/DenomMetadata.ts",
        "./orm/models/bank/SpendableBalance.ts",
        "./orm/models/bank/Balance.ts",
        "./orm/models/bank/Supply.ts",
        "./orm/models/base/TendermintService.ts",
        "./orm/models/tendermint/Block.ts",
        "./orm/models/tx/TxBlock.ts",
        "./orm/models/script/Script.ts",
        "./orm/models/nameservice/NameResolution.ts",
        "./orm/models/nameservice/NamesByDestination.ts",
        "./orm/models/nft/NftItem.ts",
      ],
      {
        eager: true,
      }
    ) as Record<string, Record<string, unknown>>;
    const exposed: OrmGlobal = {};

    for (const mod of Object.values(modules)) {
      for (const [exportName, exported] of Object.entries(mod)) {
        if (typeof exported !== "function") continue;
        const ctor = exported as unknown as typeof OrmModel;
        if (!ctor?.prototype || !(ctor.prototype instanceof OrmModel)) continue;

        const repo = useRepo(ctor) as unknown as RepoLike;
        const key = exportName || ctor.name || "UnknownModel";
        exposed[key] = {
          model: ctor,
          repo,
          api: () => useAxiosRepo(ctor).api(),
        };
      }
    }

    (globalThis as typeof globalThis & { __orm?: OrmGlobal }).__orm = exposed;
    console.log(
      "[dev] __orm exposed on window with models:",
      Object.keys(exposed)
    );
  } catch (e) {
    console.warn("Failed to expose __orm", e);
  }
  try {
    const wallet = useWallet();
    let initialized = false;
    const ensureInit = async () => {
      if (!initialized) {
        await wallet.init();
        initialized = true;
      }
    };
    const getWallet = async (address: string) => {
      await ensureInit();
      return wallet.getWallet(address);
    };
    const sendMsg = async (args: unknown) => {
      await ensureInit();
      return (
        wallet as unknown as { sendMsg: (a: unknown) => Promise<unknown> }
      ).sendMsg(args);
    };
    (
      globalThis as typeof globalThis & {
        __wallet?: {
          getWallet: (address: string) => Promise<unknown>;
          sendMsg: (args: unknown) => Promise<unknown>;
        };
      }
    ).__wallet = {
      getWallet,
      sendMsg,
    };
    console.log("[dev] __wallet.getWallet exposed on window");
  } catch (e) {
    console.warn("Failed to expose __wallet", e);
  }
}

/*
Console usage examples (DEV only)
---------------------------------

1) Inspect available models and APIs:
   __orm
   Object.keys(__orm)

2) Real send using the app wallet pipeline:
   // Ensure your wallet is connected in the UI first (Keplr or Local).
   const bank = __orm.Balance.api();
   const fromAddress = 'dys2from...';
   const toAddress = 'dys2to...';
   // Optional: warm up wallet session (ensures provider and state are ready)
   await __wallet.getWallet(fromAddress);
   // Build a WalletLike adapter using the app's sendMsg
   const wallet = { sendMsg: (args) => __wallet.sendMsg({ ...args, executorAddress: fromAddress }) };
   res = await bank.sendCoins({ fromAddress, toAddress, amount: '1', denom: 'udys', wallet, gasLimit: 'auto', memo: '' });
   

{
    "kind": "broadcast",
    "success": true,
    "code": 0,
    "gasUsed": "49135",
    "rawLog": "",
    "raw": {
        "tx": {
            "body": {
                "messages": [
                    {
                        "@type": "/cosmos.bank.v1beta1.MsgSend",
                        "from_address": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                        "to_address": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                        "amount": [
                            {
                                "denom": "udys",
                                "amount": "1"
                            }
                        ]
                    }
                ],
                "memo": "hi there",
                "timeout_height": "0",
                "unordered": false,
                "timeout_timestamp": null,
                "extension_options": [],
                "non_critical_extension_options": []
            },
            "auth_info": {
                "signer_infos": [
                    {
                        "public_key": {
                            "@type": "/cosmos.crypto.secp256k1.PubKey",
                            "key": "A63yc5XCf3/qycZpy19d2KrL51eCfOWj+IeCPkoXJ99a"
                        },
                        "mode_info": {
                            "single": {
                                "mode": "SIGN_MODE_DIRECT"
                            }
                        },
                        "sequence": "234"
                    }
                ],
                "fee": {
                    "amount": [
                        {
                            "denom": "udys",
                            "amount": "0"
                        }
                    ],
                    "gas_limit": "73718",
                    "payer": "",
                    "granter": ""
                },
                "tip": null
            },
            "signatures": [
                "yZCcfkRJAL7antCQS5Eia5/VP/Wb1czSSIVxnAJCrYgKxKLKueCL3BGm86FNE7kWVM45m2PqbqDkvul4Lx/pYA=="
            ]
        },
        "tx_response": {
            "height": "574095",
            "txhash": "03C2B8EE7CBE36655362ED413719140A099655B89819E40423FCDC382026E73E",
            "codespace": "",
            "code": 0,
            "data": "12260A242F636F736D6F732E62616E6B2E763162657461312E4D736753656E64526573706F6E7365",
            "raw_log": "",
            "logs": [],
            "info": "",
            "gas_wanted": "73718",
            "gas_used": "49135",
            "tx": {
                "@type": "/cosmos.tx.v1beta1.Tx",
                "body": {
                    "messages": [
                        {
                            "@type": "/cosmos.bank.v1beta1.MsgSend",
                            "from_address": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "to_address": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "amount": [
                                {
                                    "denom": "udys",
                                    "amount": "1"
                                }
                            ]
                        }
                    ],
                    "memo": "hi there",
                    "timeout_height": "0",
                    "unordered": false,
                    "timeout_timestamp": null,
                    "extension_options": [],
                    "non_critical_extension_options": []
                },
                "auth_info": {
                    "signer_infos": [
                        {
                            "public_key": {
                                "@type": "/cosmos.crypto.secp256k1.PubKey",
                                "key": "A63yc5XCf3/qycZpy19d2KrL51eCfOWj+IeCPkoXJ99a"
                            },
                            "mode_info": {
                                "single": {
                                    "mode": "SIGN_MODE_DIRECT"
                                }
                            },
                            "sequence": "234"
                        }
                    ],
                    "fee": {
                        "amount": [
                            {
                                "denom": "udys",
                                "amount": "0"
                            }
                        ],
                        "gas_limit": "73718",
                        "payer": "",
                        "granter": ""
                    },
                    "tip": null
                },
                "signatures": [
                    "yZCcfkRJAL7antCQS5Eia5/VP/Wb1czSSIVxnAJCrYgKxKLKueCL3BGm86FNE7kWVM45m2PqbqDkvul4Lx/pYA=="
                ]
            },
            "timestamp": "2025-08-31T09:27:37Z",
            "events": [
                {
                    "type": "tx",
                    "attributes": [
                        {
                            "key": "acc_seq",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf/234",
                            "index": true
                        }
                    ]
                },
                {
                    "type": "tx",
                    "attributes": [
                        {
                            "key": "signature",
                            "value": "yZCcfkRJAL7antCQS5Eia5/VP/Wb1czSSIVxnAJCrYgKxKLKueCL3BGm86FNE7kWVM45m2PqbqDkvul4Lx/pYA==",
                            "index": true
                        }
                    ]
                },
                {
                    "type": "message",
                    "attributes": [
                        {
                            "key": "action",
                            "value": "/cosmos.bank.v1beta1.MsgSend",
                            "index": true
                        },
                        {
                            "key": "sender",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "index": true
                        },
                        {
                            "key": "module",
                            "value": "bank",
                            "index": true
                        },
                        {
                            "key": "msg_index",
                            "value": "0",
                            "index": true
                        }
                    ]
                },
                {
                    "type": "coin_spent",
                    "attributes": [
                        {
                            "key": "spender",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "index": true
                        },
                        {
                            "key": "amount",
                            "value": "1udys",
                            "index": true
                        },
                        {
                            "key": "msg_index",
                            "value": "0",
                            "index": true
                        }
                    ]
                },
                {
                    "type": "coin_received",
                    "attributes": [
                        {
                            "key": "receiver",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "index": true
                        },
                        {
                            "key": "amount",
                            "value": "1udys",
                            "index": true
                        },
                        {
                            "key": "msg_index",
                            "value": "0",
                            "index": true
                        }
                    ]
                },
                {
                    "type": "transfer",
                    "attributes": [
                        {
                            "key": "recipient",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "index": true
                        },
                        {
                            "key": "sender",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "index": true
                        },
                        {
                            "key": "amount",
                            "value": "1udys",
                            "index": true
                        },
                        {
                            "key": "msg_index",
                            "value": "0",
                            "index": true
                        }
                    ]
                },
                {
                    "type": "message",
                    "attributes": [
                        {
                            "key": "sender",
                            "value": "dys217gxwmfaxq0qvprqg8ugxm0lqpwjfg875jcg9uf",
                            "index": true
                        },
                        {
                            "key": "msg_index",
                            "value": "0",
                            "index": true
                        }
                    ]
                }
            ]
        }
    }
}
*/
