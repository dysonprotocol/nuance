import { computed, reactive } from "vue";
import api from "@/orm/http";
import { useAxiosRepo } from "@pinia-orm/axios";
import {
  DirectSecp256k1HdWallet,
  makeSignDoc,
  executeKdf,
  extractKdfConfiguration,
} from "@cosmjs/proto-signing";
import { useStorage } from "@vueuse/core";
import { getChainInfo, sendMsgs } from "../utils/dysonTxUtils";
import { DenomMetadata } from "@/orm/models/bank/DenomMetadata";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { toBase64, fromBase64 } from "@cosmjs/encoding";

const COSMJS_WALLET_TYPE = "cosmjs";

// Global event listener state to prevent multiple listeners
let globalKeplrListenerSet = false;
let globalHandleKeplrAccountChange = null;

export function useWallet() {
  // Persisted state
  const restUrl = api.defaults.baseURL;
  const chainId = useStorage("chainId", "");
  const rpcUrl = useStorage("rpcUrl", "");
  const nodeInfo = useStorage("nodeInfo", null);
  const localCosmJsWallets = useStorage("localCosmJsWallets", []);
  const gasPrice = useStorage("gasPrice", 0.0);

  const selectedAuthorIdentity = useStorage("selectedAuthorIdentity", null);
  const txHistory = useStorage("txHistory", []);

  // Unlocked wallets list
  const unlockedWallets = useStorage("unlockedWallets", []);

  // Ephemeral state
  const state = reactive({
    activeWalletInstance: null,
    isLoading: true,
    addressNames: {},
  });

  // Derived
  const isAnyWalletConnected = computed(() => unlockedWallets.value.length > 0);

  // INITIALIZATION
  const init = async () => {
    await loadChainIdFromApi();

    if (!globalKeplrListenerSet && typeof window !== "undefined") {
      globalHandleKeplrAccountChange = handleKeplrAccountChange;
      window.addEventListener(
        "keplr_keystorechange",
        globalHandleKeplrAccountChange
      );
      globalKeplrListenerSet = true;
    }

    // Validate any persisted Keplr wallet entry; remove if not actually connected/authorized
    await validatePersistedKeplrWallet();

    state.isLoading = false;
  };

  // KEPLR ACCOUNT CHANGE HANDLER
  const handleKeplrAccountChange = async () => {
    state.activeWalletInstance = null;
    if (typeof window === "undefined" || !window.keplr) return;
    try {
      await window.keplr.enable(chainId.value);
      const key = await window.keplr.getKey(chainId.value);

      // Replace/add keplr wallet in unlocked list
      const wallets = [...unlockedWallets.value];
      const keplrIndex = wallets.findIndex((w) => w.type === "keplr");
      const newKeplrWallet = {
        name: key.name,
        address: key.bech32Address,
        type: "keplr",
      };
      if (keplrIndex === -1) wallets.push(newKeplrWallet);
      else wallets.splice(keplrIndex, 1, newKeplrWallet);
      unlockedWallets.value = wallets;

      state.activeWalletInstance = window.keplr.getOfflineSigner(chainId.value);
      state.addressNames = {};
    } catch (error) {
      console.error(
        "Failed to update wallet state after Keplr account change:",
        error
      );
    }
  };

  // UNLOCKED WALLETS MANAGEMENT
  const unlockWallet = async (name, password) => {
    const walletData = localCosmJsWallets.value.find((w) => w.name === name);
    if (!walletData) throw new Error(`No local wallet named "${name}".`);
    if (!password.trim())
      throw new Error("Password required to unlock wallet.");

    const kdfConf = extractKdfConfiguration(walletData.encrypted);
    const encryptionKey = await executeKdf(password, kdfConf);
    const wallet = await DirectSecp256k1HdWallet.deserializeWithEncryptionKey(
      walletData.encrypted,
      encryptionKey
    );
    const address = (await wallet.getAccounts())[0].address;

    const existingIndex = unlockedWallets.value.findIndex(
      (w) => w.name === name
    );
    if (existingIndex === -1) {
      unlockedWallets.value.push({
        name,
        address,
        type: COSMJS_WALLET_TYPE,
        _pass: password,
      });
    } else {
      unlockedWallets.value[existingIndex]._pass = password;
    }
  };

  const lockWallet = (name) => {
    const index = unlockedWallets.value.findIndex((w) => w.name === name);
    if (index !== -1) {
      unlockedWallets.value.splice(index, 1);
    }
  };

  // SIGNER METHODS
  const requireUnlockedByAddress = (addr) => {
    const w = unlockedWallets.value.find((u) => u.address === addr);
    if (!w) throw new Error("Requested wallet is not unlocked.");
    return w;
  };

  // NAME RESOLUTION METHODS
  const fetchNamesByDestination = async (address) => {
    if (state.addressNames[address]) return state.addressNames[address];
    try {
      const url = `/dysonprotocol/nameservice/v1/names_by_destination/${address}`;
      try {
        const resp = await api.get(url);
        const json = resp.data;
        const names = json.names || [];
        state.addressNames[address] = names;
        return names;
      } catch (error) {
        console.warn(
          `[useWallet] Failed to fetch names for address ${address}:`,
          error
        );
        state.addressNames[address] = [];
        return [];
      }
    } catch (error) {
      console.error(
        `[useWallet] Error fetching names for address ${address}:`,
        error
      );
      state.addressNames[address] = [];
      return [];
    }
  };

  // WALLET CONNECTION METHODS
  const connectNamedCosmJsWallet = async (name, password) => {
    const walletData = localCosmJsWallets.value.find((w) => w.name === name);
    if (!walletData) throw new Error(`No local wallet named "${name}".`);
    if (!password.trim())
      throw new Error("Password required to unlock wallet.");

    const kdfConf = extractKdfConfiguration(walletData.encrypted);
    const encryptionKey = await executeKdf(password, kdfConf);
    const wallet = await DirectSecp256k1HdWallet.deserializeWithEncryptionKey(
      walletData.encrypted,
      encryptionKey
    );
    state.activeWalletInstance = wallet;

    await unlockWallet(name, password);
    state.addressNames = {};
  };

  const connectExtension = async (type) => {
    const provider =
      type === "keplr"
        ? typeof window !== "undefined"
          ? window.keplr
          : null
        : null;
    if (!provider) throw new Error(`Extension not found: ${type}`);
    await loadChainIdFromApi();
    await suggestChainIfNeeded(provider);

    const offlineSigner = provider.getOfflineSigner(chainId.value);
    let { name, bech32Address: address } = await provider.getKey(chainId.value);

    const existingIndex = unlockedWallets.value.findIndex(
      (w) => w.address === address
    );
    state.activeWalletInstance = offlineSigner;

    if (existingIndex === -1) {
      unlockedWallets.value.push({
        name: String(name),
        address: String(address),
        type: String(type),
      });
    }
    state.addressNames = {};
  };

  // UTILITIES
  const loadChainIdFromApi = async () => {
    const resp = await api.get("/cosmos/base/tendermint/v1beta1/node_info");
    const json = resp.data;

    const sanitized = { ...json };
    if (
      sanitized &&
      typeof sanitized === "object" &&
      sanitized.application_version &&
      typeof sanitized.application_version === "object" &&
      "build_deps" in sanitized.application_version
    ) {
      delete sanitized.application_version.build_deps;
    }
    nodeInfo.value = sanitized;
    const discovered = json?.default_node_info?.network;
    if (!discovered) throw new Error("No chainId found in node_info response.");
    chainId.value = discovered;

    const rawRpcAddr = json?.default_node_info?.other?.rpc_address || "";
    const normalizedRpc = String(rawRpcAddr)
      .trim()
      .replace(/^tcp:\/\//, "http://");
    if (normalizedRpc) rpcUrl.value = normalizedRpc;

    // Chain/REST context may have changed; callers should refetch denom metadata if needed
  };

  const suggestChainIfNeeded = async (provider) => {
    const name = chainId.value.includes("mainnet")
      ? "DysonProtocol2"
      : `DysonProtocol2 (${chainId.value})`;

    const chainInfo = {
      chainId: chainId.value,
      chainName: name,
      rpc: rpcUrl.value,
      rest: restUrl,
      bip44: { coinType: 118 },
      bech32Config: {
        bech32PrefixAccAddr: "dys2",
        bech32PrefixAccPub: "dys2pub",
        bech32PrefixValAddr: "dys2valoper",
        bech32PrefixValPub: "dys2valoperpub",
        bech32PrefixConsAddr: "dys2valcons",
        bech32PrefixConsPub: "dys2valconspub",
      },
      currencies: [
        { coinDenom: "DYS2", coinMinimalDenom: "udys", coinDecimals: 6 },
      ],
      feeCurrencies: [
        {
          coinDenom: "DYS2",
          coinMinimalDenom: "udys",
          coinDecimals: 6,
          gasPriceStep: { low: 0.0, average: 0.0, high: 0.00002 },
        },
      ],
      stakeCurrency: {
        coinDenom: "DYS2",
        coinMinimalDenom: "udys",
        coinDecimals: 6,
      },
    };

    try {
      await provider.enable(chainId.value);
    } catch {
      await provider.experimentalSuggestChain(chainInfo);
      await provider.enable(chainId.value);
    }
  };

  // Ensure that a persisted Keplr wallet really is available and authorized
  const validatePersistedKeplrWallet = async () => {
    const idx = Array.isArray(unlockedWallets.value)
      ? unlockedWallets.value.findIndex((w) => w.type === "keplr")
      : -1;
    if (idx === -1) return;

    if (typeof window === "undefined" || !window.keplr) {
      // Keplr not available: drop stale persisted entry
      try {
        unlockedWallets.value.splice(idx, 1);
      } catch (e) {
        console.warn(
          "[useWallet] Failed to remove stale Keplr entry when provider missing:",
          e
        );
      }
      if (state.activeWalletInstance) state.activeWalletInstance = null;
      return;
    }

    try {
      await suggestChainIfNeeded(window.keplr);
      const key = await window.keplr.getKey(chainId.value);
      const updated = {
        name: key.name,
        address: key.bech32Address,
        type: "keplr",
      };
      try {
        unlockedWallets.value.splice(idx, 1, updated);
      } catch (e) {
        console.warn(
          "[useWallet] Failed to update persisted Keplr wallet entry:",
          e
        );
      }
      state.activeWalletInstance = window.keplr.getOfflineSigner(chainId.value);
      state.addressNames = {};
    } catch (error) {
      // Not authorized or failed: remove persisted entry to avoid false "connected" state
      console.warn(
        "[useWallet] Persisted Keplr wallet invalid; removing it:",
        error
      );
      try {
        unlockedWallets.value.splice(idx, 1);
      } catch (e) {
        console.warn("[useWallet] Failed to remove invalid Keplr entry:", e);
      }
      if (state.activeWalletInstance) state.activeWalletInstance = null;
    }
  };

  const buildFee = (gasLimit) => {
    const limit = Number(gasLimit) || 200000;
    const price = Number(gasPrice.value) || 0;
    const totalAmount = Math.floor(limit * price);
    return {
      amount: [{ denom: "udys", amount: String(totalAmount) }],
      gas_limit: String(limit),
    };
  };

  // Extract embedded Dyson error JSON from a text blob. Looks for '{"cumsize":' ... last '}'.
  const extractDysonErrorJson = (text) => {
    if (!text || typeof text !== "string") return null;
    const marker = '{"cumsize":';
    const start = text.indexOf(marker);
    if (start === -1) return null;
    const end = text.lastIndexOf("}");
    if (end === -1 || end <= start) return null;
    const candidate = text.substring(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      console.warn(
        "[useWallet] Failed to JSON.parse embedded Dyson error payload:",
        e
      );
      return null;
    }
  };

  // LOCAL WALLET METHODS
  const listLocalCosmJsWallets = () => [...localCosmJsWallets.value];

  const getSignerAddress = () => {
    const first =
      Array.isArray(unlockedWallets.value) && unlockedWallets.value.length > 0
        ? unlockedWallets.value[0].address
        : "";
    if (!first) throw new Error("No unlocked wallet available");
    return first;
  };

  const generateMnemonic = async (length = 24) => {
    const wallet = await DirectSecp256k1HdWallet.generate(length);
    return wallet.mnemonic;
  };

  const importNamedCosmJsWallet = async (name, mnemonic, password) => {
    if (!name.trim()) throw new Error("Wallet name is required.");
    if (!mnemonic.trim()) throw new Error("Mnemonic is empty.");
    if (!password.trim()) throw new Error("Password is required.");

    if (localCosmJsWallets.value.find((w) => w.name === name.trim())) {
      throw new Error(`Wallet "${name}" already exists.`);
    }

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: "dys2",
    });
    const kdfConfig = {
      algorithm: "argon2id",
      params: { outputLength: 32, opsLimit: 24, memLimitKib: 12 * 1024 },
    };
    const encryptionKey = await executeKdf(password, kdfConfig);
    const encrypted = await wallet.serializeWithEncryptionKey(
      encryptionKey,
      kdfConfig
    );
    const address = (await wallet.getAccounts())[0].address;

    localCosmJsWallets.value.push({
      name: name.trim(),
      encrypted,
      _pass: password,
      address,
    });
  };

  const removeNamedCosmJsWallet = (name) => {
    const idx = localCosmJsWallets.value.findIndex((w) => w.name === name);
    if (idx === -1) throw new Error(`Wallet "${name}" not found.`);
    lockWallet(name);
    localCosmJsWallets.value.splice(idx, 1);
  };

  const getWallet = async (overrideAddress) => {
    if (!overrideAddress)
      throw new Error("Explicit address required for getWallet()");
    const effective = requireUnlockedByAddress(overrideAddress);
    const address = effective.address;

    if (effective.type === "keplr") {
      const provider = typeof window !== "undefined" ? window.keplr : null;
      if (!provider) throw new Error("Keplr extension not found.");
      await suggestChainIfNeeded(provider);
      const offlineSigner = provider.getOfflineSigner(chainId.value);
      const [{ address: signerAddr }] = await offlineSigner.getAccounts();
      if (signerAddr !== address) {
        throw new Error(
          `Address mismatch: requested address (${address}) is not active in Keplr. Switch account in Keplr or reconnect the wallet.`
        );
      }
      state.activeWalletInstance = offlineSigner;
    } else if (effective.type === COSMJS_WALLET_TYPE) {
      const unlocked = unlockedWallets.value.find((u) => u.address === address);
      if (!unlocked || !unlocked._pass) {
        throw new Error(
          "Wallet session expired. Please unlock the wallet again."
        );
      }
      const walletData = localCosmJsWallets.value.find(
        (w) => w.name === effective.name
      );
      if (!walletData) {
        throw new Error("Wallet data not found. Please reconnect your wallet.");
      }
      const kdfConf = extractKdfConfiguration(walletData.encrypted);
      const encryptionKey = await executeKdf(unlocked._pass, kdfConf);
      const wallet = await DirectSecp256k1HdWallet.deserializeWithEncryptionKey(
        walletData.encrypted,
        encryptionKey
      );
      state.activeWalletInstance = wallet;
    }

    if (!state.activeWalletInstance)
      throw new Error("Wallet session expired. Please reconnect your wallet.");

    return { ...effective, walletInstance: state.activeWalletInstance };
  };

  const getAccountInfo = async (address) => {
    if (!address)
      throw new Error("Explicit address required for getAccountInfo()");
    return getChainInfo({ apiUrl: restUrl, address });
  };

  const sendMsg = async ({
    msg,
    msgs,
    gasLimit,
    memo = "",
    executorAddress = undefined,
    grantee = undefined,
  }) => {
    if (!executorAddress)
      throw new Error("executorAddress is required in sendMsg()");
    const signerAddress = grantee || executorAddress;
    const { walletInstance, address, type } = await getWallet(signerAddress);

    const baseMsgs =
      Array.isArray(msgs) && msgs.length > 0 ? msgs : msg ? [msg] : [];
    if (baseMsgs.length === 0)
      throw new Error("sendMsg requires msg or msgs[]");
    const msgsForSend = grantee
      ? [{ "@type": "/cosmos.authz.v1beta1.MsgExec", grantee, msgs: baseMsgs }]
      : baseMsgs;

    let finalGasLimit = gasLimit;

    if (type === "keplr") {
      if (gasLimit === "auto" || gasLimit == null || gasLimit == undefined)
        finalGasLimit = 100000000;
      else finalGasLimit = gasLimit;
    } else if (gasLimit == null || gasLimit == undefined) {
      const simulationResult = await sendMsgs({
        apiUrl: restUrl,
        wallet: walletInstance,
        walletType: type,
        address,
        msgs: msgsForSend,
        memo,
        fee: buildFee(200000),
        simulate: true,
      });
      if (!simulationResult.success) {
        const errorMsg =
          simulationResult.rawLog ||
          simulationResult.raw?.message ||
          "Simulation failed";
        throw new Error(
          `Gas estimation failed, code: [${simulationResult.code}] ${errorMsg}`
        );
      }
      let gasUsed = 0;
      if (simulationResult?.raw?.gas_info?.gas_used)
        gasUsed = parseInt(simulationResult.raw.gas_info.gas_used);
      else if (simulationResult?.gasUsed)
        gasUsed = parseInt(simulationResult.gasUsed);
      finalGasLimit = gasUsed > 0 ? Math.ceil(gasUsed * 1.5) : 200000;
    } else if (gasLimit === "auto") {
      const simulationResult = await sendMsgs({
        apiUrl: restUrl,
        wallet: walletInstance,
        walletType: type,
        address,
        msgs: msgsForSend,
        memo,
        fee: buildFee(100000000),
        simulate: true,
      });
      if (!simulationResult.success) {
        const errorMsg =
          simulationResult.rawLog ||
          simulationResult.raw?.message ||
          "Simulation failed";
        throw new Error(
          `Gas estimation failed, code: [${simulationResult.code}] ${errorMsg}`
        );
      }
      let gasUsed = 0;
      if (simulationResult?.raw?.gas_info?.gas_used)
        gasUsed = parseInt(simulationResult.raw.gas_info.gas_used);
      else if (simulationResult?.gasUsed)
        gasUsed = parseInt(simulationResult.gasUsed);
      finalGasLimit = gasUsed > 0 ? Math.ceil(gasUsed * 1.5) : 100000000;
    }

    const fee = buildFee(finalGasLimit);
    const result = await sendMsgs({
      apiUrl: restUrl,
      wallet: walletInstance,
      walletType: type,
      address,
      msgs: msgsForSend,
      memo,
      fee,
      simulate: false,
    });

    const txResp = result?.raw?.tx_response;
    const txHash = txResp?.txhash;
    if (txHash) {
      addTransaction({
        txHash,
        timestamp: Date.now(),
        type: (msgsForSend?.[0] && msgsForSend[0]["@type"]) || "unknown",
        fromAddress: address,
        toAddress:
          (baseMsgs?.[0] &&
            (baseMsgs[0].address ||
              baseMsgs[0].to_address ||
              baseMsgs[0].recipient)) ||
          "",
        amount: baseMsgs?.[0]?.amount,
        status: result?.success ? "success" : "failed",
      });
    }

    return result;
  };

  const runDysonScript = async ({
    scriptAddress,
    scriptName = "",
    functionName = "",
    args = "",
    kwargs = "",
    extraCode = "",
    attachedMsg = [],
    memo = "",
    gasLimit = 100000000,
    simulate = false,
    executorAddress = undefined,
    grantee = undefined,
  }) => {
    const signerAddress = grantee || executorAddress;
    const { walletInstance, address, type } = await getWallet(signerAddress);
    if (!scriptAddress && !scriptName)
      throw new Error("scriptAddress or scriptName is required.");

    // Decide whether to use script_address or script_name
    const isBech32 =
      typeof scriptAddress === "string" && /^dys[0-9a-z]+/i.test(scriptAddress);
    const isName =
      !isBech32 &&
      (scriptName ||
        (typeof scriptAddress === "string" && scriptAddress.includes(".")));

    let finalGasLimit = gasLimit;
    if (gasLimit === "auto" && !simulate) {
      if (type === COSMJS_WALLET_TYPE) {
        const innerMsg = {
          "@type": "/dysonprotocol.script.v1.MsgExec",
          executor_address: executorAddress,
          ...(isName
            ? { script_name: scriptName || scriptAddress }
            : { script_address: scriptAddress }),
          function_name: functionName,
          args,
          kwargs,
          extra_code: extraCode,
          attached_messages: attachedMsg,
        };
        const finalMsgForSim = grantee
          ? {
              "@type": "/cosmos.authz.v1beta1.MsgExec",
              grantee,
              msgs: [innerMsg],
            }
          : innerMsg;
        const simulationResult = await sendMsgs({
          apiUrl: restUrl,
          wallet: walletInstance,
          walletType: type,
          address,
          msgs: [finalMsgForSim],
          memo,
          fee: buildFee(100000000),
          simulate: true,
        });
        if (!simulationResult.success) {
          const result = extractDysonErrorJson(simulationResult.raw?.message);
          if (result) return result;
          return simulationResult;
        }

        let gasUsed = 0;
        if (simulationResult?.raw?.gas_info?.gas_used)
          gasUsed = parseInt(simulationResult.raw.gas_info.gas_used);
        else if (simulationResult?.gasUsed)
          gasUsed = parseInt(simulationResult.gasUsed);
        finalGasLimit = gasUsed > 0 ? Math.round(gasUsed * 1.5) : 100000000;
      } else {
        finalGasLimit = 100000000;
      }
    }

    const fee = buildFee(finalGasLimit);
    const innerMsg = {
      "@type": "/dysonprotocol.script.v1.MsgExec",
      executor_address: executorAddress,
      ...(isName
        ? { script_name: scriptName || scriptAddress }
        : { script_address: scriptAddress }),
      function_name: functionName,
      args,
      kwargs,
      extra_code: extraCode,
      attached_messages: attachedMsg,
    };
    const finalMsg = grantee
      ? { "@type": "/cosmos.authz.v1beta1.MsgExec", grantee, msgs: [innerMsg] }
      : innerMsg;

    const sendResult = await sendMsgs({
      apiUrl: restUrl,
      wallet: walletInstance,
      walletType: type,
      address,
      msgs: [finalMsg],
      memo,
      fee,
      simulate,
    });

    const { kind, success, rawLog, raw } = sendResult;
    let scriptResponse = null;
    if (success) {
      const events =
        kind === "simulate" ? raw?.result?.events : raw?.tx_response?.events;
      if (Array.isArray(events)) {
        const scriptEvt = events
          .reverse()
          .find((e) => e.type === "dysonprotocol.script.v1.EventExecScript");
        const responseAttr = scriptEvt?.attributes?.find(
          (a) => a.key === "response"
        );
        const value = responseAttr?.value;
        if (value) {
          try {
            const parsed = JSON.parse(
              value.replace(/(: script execution error)$/, "")
            );
            if (parsed.result && typeof parsed.result === "string") {
              try {
                parsed.result = JSON.parse(parsed.result);
              } catch {
                // ignore parse error of nested JSON
              }
            }
            scriptResponse = parsed;
          } catch {
            scriptResponse = value;
          }
        }
      }
    } else {
      try {
        if (raw?.message) scriptResponse = extractDysonErrorJson(raw.message);
        if (!scriptResponse && rawLog)
          scriptResponse = extractDysonErrorJson(rawLog);
        if (!scriptResponse && raw?.message) {
          const firstBrace = raw.message.indexOf("{");
          const lastBrace = raw.message.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonStr = raw.message.substring(firstBrace, lastBrace + 1);
            scriptResponse = JSON.parse(jsonStr);
          }
        }
        if (!scriptResponse && rawLog) {
          const firstBrace = rawLog.indexOf("{");
          const lastBrace = rawLog.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonStr = rawLog.substring(firstBrace, lastBrace + 1);
            scriptResponse = JSON.parse(jsonStr);
          } else {
            const cleanedLog = rawLog.replace(
              /(: script execution error)$/,
              ""
            );
            scriptResponse = JSON.parse(cleanedLog);
          }
        }
      } catch (err) {
        console.warn("[useWallet] Failed to parse script error JSON:", err);
        scriptResponse = null;
      }
    }

    const result = {
      kind,
      success,
      scriptResponse,
      rawSendMsgsResponse: sendResult,
    };
    if (!simulate) {
      const txResp = sendResult?.raw?.tx_response;
      const hasHash = Boolean(txResp?.txhash);
      if (hasHash) {
        const firstMsgType = String(
          sendResult?.raw?.tx?.body?.messages?.[0]?.["@type"] ||
            "/dysonprotocol.script.v1.MsgExec"
        );
        addTransaction({
          txHash: txResp.txhash,
          timestamp: Date.now(),
          type: firstMsgType,
          fromAddress: address,
          toAddress: isName ? scriptName || scriptAddress : scriptAddress || "",
          amount: undefined,
          status: result.success ? "success" : "failed",
        });
      }
    }
    return result;
  };

  // SIGNING METHODS
  const signArbitraryData = async ({ address, data = "", msg = null }) => {
    const { walletInstance } = await getWallet(address);
    const apiUrl = restUrl;

    let transaction = {
      body: {
        messages: msg
          ? [msg]
          : [
              {
                "@type": "/dysonprotocol.script.v1.MsgArbitraryData",
                app_domain: "dysond",
                signer: address,
                data: data,
              },
            ],
        memo: "",
        timeout_height: "0",
        unordered: false,
        timeout_timestamp: "0001-01-01T00:00:00Z",
        extension_options: [],
        non_critical_extension_options: [],
      },
      auth_info: {
        signer_infos: [],
        fee: { amount: [], gas_limit: "0", payer: "", granter: "" },
        tip: null,
      },
      signatures: [],
    };

    const [{ pubkey }] = await state.activeWalletInstance.getAccounts();
    transaction.auth_info.signer_infos = [
      {
        public_key: {
          "@type": "/cosmos.crypto.secp256k1.PubKey",
          key: toBase64(pubkey),
        },
        mode_info: { single: { mode: "SIGN_MODE_DIRECT" } },
        sequence: "0",
      },
    ];

    const encodeRes = await fetch(`${apiUrl}/cosmos/tx/v1beta1/encode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx: transaction }),
    });
    if (!encodeRes.ok)
      throw new Error(`Failed to encode: ${await encodeRes.text()}`);
    const encodedTx = await encodeRes.json();

    const tx = TxRaw.decode(fromBase64(encodedTx.tx_bytes));
    const chainIdForSign = "";
    const accountNumber = "0";

    const signDoc = makeSignDoc(
      tx.bodyBytes,
      tx.authInfoBytes,
      chainIdForSign,
      accountNumber
    );
    const sig = await walletInstance.signDirect(address, signDoc);
    transaction.signatures = [sig.signature.signature];
    return transaction;
  };

  // DENOMINATION METADATA METHODS (wrappers around DenomMetadata)
  const loadDenomMetadata = async () => {
    await useAxiosRepo(DenomMetadata).api().fetchAll();
  };
  const getDisplayOptions = ({ allowedBases }) =>
    DenomMetadata.getOptions({ allowedBases });
  const normalizeFromDisplay = (args) =>
    DenomMetadata.normalize({ amount: args.amount, denom: args.displayDenom });
  const normalizeCoin = (args) =>
    DenomMetadata.normalize({ amount: args.amount, denom: args.denom });

  // TRANSACTION HISTORY METHODS
  const addTransaction = (txMetadata) => {
    const transaction = {
      txHash: txMetadata.txHash,
      timestamp: txMetadata.timestamp,
      type: txMetadata.type,
      fromAddress: txMetadata.fromAddress,
      toAddress: txMetadata.toAddress,
      amount: txMetadata.amount,
      status: txMetadata.status,
    };
    txHistory.value.unshift(transaction);
    if (txHistory.value.length > 100)
      txHistory.value = txHistory.value.slice(0, 100);
  };

  const removeTransaction = (txHash) => {
    if (!txHash) return;
    const idx = txHistory.value.findIndex((t) => t.txHash === txHash);
    if (idx !== -1) txHistory.value.splice(idx, 1);
  };

  const disconnectWallet = () => {
    unlockedWallets.value = [];
    state.activeWalletInstance = null;
    selectedAuthorIdentity.value = null;
    state.addressNames = {};
  };

  return {
    // State
    rpcUrl,
    chainId,
    localCosmJsWallets,
    gasPrice,
    selectedAuthorIdentity,
    unlockedWallets,
    txHistory,
    state,
    // Derived
    isAnyWalletConnected,
    // Methods
    init,
    unlockWallet,
    lockWallet,
    fetchNamesByDestination,
    connectNamedCosmJsWallet,
    connectExtension,
    disconnectWallet,
    loadChainIdFromApi,
    suggestChainIfNeeded,
    buildFee,
    listLocalCosmJsWallets,
    getSignerAddress,
    generateMnemonic,
    importNamedCosmJsWallet,
    removeNamedCosmJsWallet,
    getWallet,
    getAccountInfo,
    sendMsg,
    runDysonScript,
    signArbitraryData,
    loadDenomMetadata,
    getDisplayOptions,
    normalizeFromDisplay,
    normalizeCoin,
    addTransaction,
    removeTransaction,
    // Cleanup function
    cleanup: () => {
      if (
        globalKeplrListenerSet &&
        globalHandleKeplrAccountChange &&
        typeof window !== "undefined"
      ) {
        window.removeEventListener(
          "keplr_keystorechange",
          globalHandleKeplrAccountChange
        );
        globalKeplrListenerSet = false;
      }
    },
  };
}
